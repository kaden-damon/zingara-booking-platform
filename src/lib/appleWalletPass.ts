import { readFile } from "node:fs/promises";
import path from "node:path";

import { PKPass } from "passkit-generator";

import { resolveGuestVisibleTable } from "@/lib/guestTicketDisplay";
import {
  createAppleWalletAuthenticationToken,
  getAppleWalletWebServiceUrl,
} from "@/lib/appleWalletSync";
import { getShowLocationOption, normalizeShowLocation } from "@/lib/zingaraDemo";
import { getServiceClient } from "@/lib/supabase/serverAdmin";

const bookingMetadataPrefix = "__zingara_booking_meta__:";
const passAssetNames = [
  "icon.png",
  "icon@2x.png",
  "logo.png",
  "logo@2x.png",
] as const;

type BookingRow = {
  booking_reference: string;
  booking_status: string;
  customer_id: string;
  guest_count: number;
  id: string;
  notes: string | null;
  payment_status: string;
  section: string | null;
  show_id: string;
  table_id: string | null;
};

type CustomerRow = {
  first_name: string;
  surname: string | null;
};

type ShowRow = {
  date: string;
  name: string;
  time: string;
  venue: string;
};

type TableRow = {
  table_code: string;
};

type TicketRow = {
  booking_id: string;
  id: string;
  qr_payload: string;
  ticket_code: string;
  ticket_status: string;
};

type MetadataBooking = {
  customer?: {
    name?: string;
  };
  guestTickets?: Array<{
    fullName?: string;
    index?: number;
    ticketCode?: string;
    total?: number;
  }>;
  zoneTitle?: string;
};

type AppleWalletPassSource = {
  booking: BookingRow;
  customer: CustomerRow | null;
  guestName: string;
  show: ShowRow;
  table: TableRow | null;
  ticket: TicketRow;
  ticketIndex: number;
  ticketTotal: number;
  zoneTitle: string;
};

export class AppleWalletConfigurationError extends Error {}
export class AppleWalletTicketDataError extends Error {}

function normalizedReference(reference: string) {
  return decodeURIComponent(reference).trim().toUpperCase();
}

function humanizeStatus(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function parseBookingMetadata(notes: string | null) {
  if (!notes?.startsWith(bookingMetadataPrefix)) {
    return null;
  }

  try {
    return JSON.parse(notes.slice(bookingMetadataPrefix.length)) as MetadataBooking;
  } catch {
    return null;
  }
}

function formatGuestName(customer: CustomerRow | null) {
  return [customer?.first_name, customer?.surname]
    .map((value) => value?.trim())
    .filter(Boolean)
    .join(" ");
}

function formatPerformanceDate(date: string, time: string) {
  const parsedDate = new Date(`${date}T${time.slice(0, 8)}+02:00`);

  if (Number.isNaN(parsedDate.getTime())) {
    throw new AppleWalletTicketDataError("Ticket performance date is invalid.");
  }

  return {
    display: new Intl.DateTimeFormat("en-ZA", {
      day: "2-digit",
      hour: "2-digit",
      hour12: false,
      minute: "2-digit",
      month: "short",
      timeZone: "Africa/Johannesburg",
      year: "numeric",
    }).format(parsedDate),
    value: parsedDate,
  };
}

function getEncodedCredential(base64Name: string, pathName: string) {
  const encodedValue = process.env[base64Name]?.trim();
  const configuredPath = process.env[pathName]?.trim();

  if (encodedValue) {
    return Promise.resolve(Buffer.from(encodedValue, "base64"));
  }

  if (configuredPath) {
    return readFile(configuredPath);
  }

  throw new AppleWalletConfigurationError(
    `Apple Wallet signing input ${base64Name} or ${pathName} is not configured.`,
  );
}

async function loadSigningConfiguration() {
  const passTypeIdentifier =
    process.env.APPLE_WALLET_PASS_TYPE_IDENTIFIER?.trim();
  const teamIdentifier = process.env.APPLE_WALLET_TEAM_IDENTIFIER?.trim();

  if (!passTypeIdentifier || !teamIdentifier) {
    throw new AppleWalletConfigurationError(
      "Apple Wallet pass identifiers are not configured.",
    );
  }

  const [signerCert, signerKey, wwdr] = await Promise.all([
    getEncodedCredential(
      "APPLE_WALLET_SIGNER_CERTIFICATE_BASE64",
      "APPLE_WALLET_SIGNER_CERTIFICATE_PATH",
    ),
    getEncodedCredential(
      "APPLE_WALLET_SIGNER_KEY_BASE64",
      "APPLE_WALLET_SIGNER_KEY_PATH",
    ),
    getEncodedCredential(
      "APPLE_WALLET_WWDR_CERTIFICATE_BASE64",
      "APPLE_WALLET_WWDR_CERTIFICATE_PATH",
    ),
  ]);

  return {
    certificates: {
      signerCert,
      signerKey,
      signerKeyPassphrase:
        process.env.APPLE_WALLET_CERTIFICATE_PASSWORD?.trim() || undefined,
      wwdr,
    },
    passTypeIdentifier,
    teamIdentifier,
  };
}

async function loadPassAssets() {
  const assetDirectory = path.join(
    process.cwd(),
    "src/templates/apple-wallet",
  );
  const assets = await Promise.all(
    passAssetNames.map(async (name) => [
      name,
      await readFile(path.join(assetDirectory, name)),
    ]),
  );

  return Object.fromEntries(assets) as Record<string, Buffer>;
}

async function loadAppleWalletPassSource(
  reference: string,
  options: { serialNumber?: boolean } = {},
) {
  const supabase = getServiceClient();

  if (!supabase) {
    throw new AppleWalletConfigurationError(
      "Ticket data service is not configured.",
    );
  }

  const lookupReference = normalizedReference(reference);
  const directTicketQuery = supabase
    .from("tickets")
    .select("id,booking_id,ticket_code,qr_payload,ticket_status")
    .limit(1);
  const { data: directTicketData, error: directTicketError } = options.serialNumber
    ? await directTicketQuery.eq("id", lookupReference.toLowerCase())
    : await directTicketQuery.eq("ticket_code", lookupReference);

  if (directTicketError) {
    throw directTicketError;
  }

  let ticket = (directTicketData?.[0] as TicketRow | undefined) ?? null;
  let booking: BookingRow | null = null;

  if (ticket) {
    const { data, error } = await supabase
      .from("bookings")
      .select("id,customer_id,show_id,table_id,booking_reference,booking_status,payment_status,section,guest_count,notes")
      .eq("id", ticket.booking_id)
      .maybeSingle();

    if (error) {
      throw error;
    }

    booking = data as BookingRow | null;
  } else if (!options.serialNumber) {
    const { data, error } = await supabase
      .from("bookings")
      .select("id,customer_id,show_id,table_id,booking_reference,booking_status,payment_status,section,guest_count,notes")
      .eq("booking_reference", lookupReference)
      .maybeSingle();

    if (error) {
      throw error;
    }

    booking = data as BookingRow | null;
  }

  if (!booking) {
    return null;
  }

  const { data: ticketRowsData, error: ticketRowsError } = await supabase
    .from("tickets")
    .select("id,booking_id,ticket_code,qr_payload,ticket_status")
    .eq("booking_id", booking.id)
    .order("ticket_code", { ascending: true });

  if (ticketRowsError) {
    throw ticketRowsError;
  }

  const ticketRows = (ticketRowsData ?? []) as TicketRow[];
  ticket ??= ticketRows[0] ?? null;

  if (!ticket?.qr_payload) {
    throw new AppleWalletTicketDataError(
      "An authoritative ticket and QR payload are required.",
    );
  }

  const [customerResult, showResult, tableResult] = await Promise.all([
    supabase
      .from("customers")
      .select("first_name,surname")
      .eq("id", booking.customer_id)
      .maybeSingle(),
    supabase
      .from("shows")
      .select("name,date,time,venue")
      .eq("id", booking.show_id)
      .maybeSingle(),
    booking.table_id
      ? supabase
          .from("show_tables")
          .select("table_code")
          .eq("id", booking.table_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (customerResult.error || showResult.error || tableResult.error) {
    throw customerResult.error ?? showResult.error ?? tableResult.error;
  }

  const show = showResult.data as ShowRow | null;

  if (!show?.date || !show.time || !show.name || !show.venue) {
    throw new AppleWalletTicketDataError(
      "Authoritative show details are incomplete.",
    );
  }

  const metadata = parseBookingMetadata(booking.notes);
  const metadataTicket = metadata?.guestTickets?.find(
    (item) => item.ticketCode === ticket?.ticket_code,
  );
  const customer = customerResult.data as CustomerRow | null;
  const guestName =
    metadataTicket?.fullName?.trim() ||
    formatGuestName(customer) ||
    metadata?.customer?.name?.trim() ||
    "Guest";
  const ticketRowIndex = Math.max(
    ticketRows.findIndex((item) => item.id === ticket?.id),
    0,
  );

  return {
    booking,
    customer,
    guestName,
    show,
    table: tableResult.data as TableRow | null,
    ticket,
    ticketIndex: metadataTicket?.index ?? ticketRowIndex + 1,
    ticketTotal: metadataTicket?.total ?? Math.max(ticketRows.length, 1),
    zoneTitle: metadata?.zoneTitle?.trim() || booking.section?.trim() || "Not recorded",
  } satisfies AppleWalletPassSource;
}

function getGuestVisibleTable(source: AppleWalletPassSource) {
  return resolveGuestVisibleTable(
    {
      status:
        source.booking.booking_status === "checked_in"
          ? "checked-in"
          : "confirmed",
      tableNumber: source.table?.table_code ?? "",
    },
    {
      status:
        source.ticket.ticket_status === "checked_in"
          ? "checked-in"
          : "valid",
    },
  );
}

async function buildAppleWalletPass(
  reference: string,
  requestUrl: string,
  options: { serialNumber?: boolean } = {},
) {
  const source = await loadAppleWalletPassSource(reference, options);

  if (!source) {
    return null;
  }

  const [assets, signing] = await Promise.all([
    loadPassAssets(),
    loadSigningConfiguration(),
  ]);
  const location = normalizeShowLocation(source.show.venue);
  const locationOption = location ? getShowLocationOption(location) : null;
  const locationLabel = locationOption?.city ?? source.show.venue;
  const venueLabel = locationOption
    ? `${locationOption.city} - ${locationOption.courtName}`
    : source.show.venue;
  const performance = formatPerformanceDate(source.show.date, source.show.time);
  const isVoided = ["cancelled", "refunded", "void"].includes(
    source.ticket.ticket_status,
  ) || ["cancelled", "refunded"].includes(source.booking.booking_status);
  const liveTicketUrl = new URL(
    `/ticket/${encodeURIComponent(source.ticket.ticket_code)}`,
    requestUrl,
  ).toString();
  const guestVisibleTable = getGuestVisibleTable(source);
  const authenticationToken = createAppleWalletAuthenticationToken(
    source.ticket.id,
  );
  const webServiceURL = getAppleWalletWebServiceUrl(requestUrl);
  const backgroundColor =
    location === "cape-town" ? "rgb(18, 9, 15)" : "rgb(8, 8, 6)";
  const pass = new PKPass(assets, signing.certificates, {
    backgroundColor,
    authenticationToken,
    description: "Zingara Dinner Show Ticket",
    foregroundColor: "rgb(255, 250, 240)",
    formatVersion: 1,
    groupingIdentifier: source.booking.id,
    labelColor: "rgb(242, 214, 108)",
    logoText: "Zingara",
    organizationName: "Zingara",
    passTypeIdentifier: signing.passTypeIdentifier,
    serialNumber: source.ticket.id,
    teamIdentifier: signing.teamIdentifier,
    voided: isVoided,
    webServiceURL,
  });

  pass.type = "eventTicket";
  pass.primaryFields.push({
    key: "performance",
    label: "PERFORMANCE",
    value: source.show.name,
  });
  pass.secondaryFields.push(
    {
      key: "date-time",
      label: "DATE & TIME",
      value: performance.display,
    },
    {
      key: "location",
      label: "LOCATION",
      value: locationLabel,
    },
  );
  pass.auxiliaryFields.push(
    {
      key: "guest",
      label: "GUEST",
      value: source.guestName,
    },
    {
      key: "seating-zone",
      label: "SEATING",
      value: source.zoneTitle,
    },
    {
      key: "table",
      label: "TABLE",
      value: guestVisibleTable || "TBC",
    },
    {
      key: "ticket-number",
      label: "TICKET",
      value: `${source.ticketIndex} of ${source.ticketTotal}`,
    },
  );

  pass.backFields.push(
    {
      key: "booking-reference",
      label: "BOOKING REFERENCE",
      value: source.booking.booking_reference,
    },
    {
      key: "ticket-reference",
      label: "TICKET REFERENCE",
      value: source.ticket.ticket_code,
    },
    {
      key: "booking-status",
      label: "BOOKING STATUS",
      value: humanizeStatus(source.booking.booking_status),
    },
    {
      key: "ticket-status",
      label: "TICKET STATUS",
      value: humanizeStatus(source.ticket.ticket_status),
    },
    {
      key: "payment-status",
      label: "PAYMENT STATUS",
      value: humanizeStatus(source.booking.payment_status),
    },
    {
      key: "venue",
      label: "VENUE",
      value: venueLabel,
    },
    {
      key: "support",
      label: "SUPPORT",
      value: process.env.EMAIL_FROM_ADDRESS?.trim() || "bookings@zingara.co.za",
    },
    {
      key: "live-ticket",
      label: "LIVE TICKET",
      value: liveTicketUrl,
      dataDetectorTypes: ["PKDataDetectorTypeLink"],
    },
  );
  pass.setRelevantDate(performance.value);
  pass.setBarcodes({
    altText: source.ticket.ticket_code,
    format: "PKBarcodeFormatQR",
    message: source.ticket.qr_payload,
    messageEncoding: "iso-8859-1",
  });

  return {
    buffer: pass.getAsBuffer(),
    ticketCode: source.ticket.ticket_code,
  };
}

export function createAppleWalletPass(reference: string, requestUrl: string) {
  return buildAppleWalletPass(reference, requestUrl);
}

export function createAppleWalletPassForSerial(
  serialNumber: string,
  requestUrl: string,
) {
  return buildAppleWalletPass(serialNumber, requestUrl, {
    serialNumber: true,
  });
}
