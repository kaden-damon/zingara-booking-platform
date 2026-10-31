import {
  type CustomerInfo,
  type DemoWaitlistEntry,
  type WaitlistStatus,
  getDisplayZoneTitle,
} from "@/lib/zingaraDemo";
import { getServiceClient } from "./serverAdmin";

type ServiceClient = NonNullable<ReturnType<typeof getServiceClient>>;

type SupabaseWaitlistStatus =
  | "active"
  | "cancelled"
  | "contacted"
  | "converted"
  | "expired";

type SupabaseWaitlistRow = {
  converted_booking_id: string | null;
  created_at: string;
  customer_id: string;
  desired_section: string | null;
  guest_count: number;
  id: string;
  notes: string | null;
  show_id: string;
  status: SupabaseWaitlistStatus;
  updated_at: string;
};

type SupabaseShowRow = {
  id: string;
  notes: string | null;
};

const waitlistMetadataPrefix = "__zingara_waitlist_meta__:";
const showMetadataPrefix = "__zingara_show_meta__:";

export type PublicWaitlistSource = "secret-guest-list" | "waitlist";

function toSupabaseWaitlistStatus(
  status: WaitlistStatus,
): SupabaseWaitlistStatus {
  if (status === "promoted") {
    return "contacted";
  }

  if (status === "converted") {
    return "converted";
  }

  if (status === "removed") {
    return "cancelled";
  }

  return "active";
}

function toDemoWaitlistStatus(
  status: SupabaseWaitlistStatus,
): WaitlistStatus {
  if (status === "contacted") {
    return "promoted";
  }

  if (status === "converted") {
    return "converted";
  }

  if (status === "cancelled" || status === "expired") {
    return "removed";
  }

  return "waiting";
}

function parseShowNotes(notes: string | null) {
  if (!notes?.startsWith(showMetadataPrefix)) {
    return "";
  }

  try {
    return (
      (JSON.parse(notes.slice(showMetadataPrefix.length)) as { legacyId?: string })
        .legacyId ?? ""
    );
  } catch {
    return "";
  }
}

function parseWaitlistNotes(notes: string | null) {
  if (!notes?.startsWith(waitlistMetadataPrefix)) {
    return undefined;
  }

  try {
    return JSON.parse(notes.slice(waitlistMetadataPrefix.length)) as DemoWaitlistEntry;
  } catch {
    return undefined;
  }
}

function serializeWaitlistNotes(entry: DemoWaitlistEntry) {
  return `${waitlistMetadataPrefix}${JSON.stringify(entry)}`;
}

function splitPublicWaitlistName(name: string) {
  const [firstName = "", ...surnameParts] = name.trim().split(/\s+/);

  return { firstName, surname: surnameParts.join(" ") };
}

export async function createPublicWaitlistEntry(
  serviceClient: ServiceClient,
  input: {
    customerName: string;
    desiredZoneId?: DemoWaitlistEntry["desiredZoneId"];
    desiredZoneTitle?: string;
    email: string;
    mobile: string;
    notes?: string;
    partySize: number;
    showId: string;
    source: PublicWaitlistSource;
  },
) {
  const showId = await getSupabaseShowId(serviceClient, input.showId);

  if (!showId) {
    throw new Error("The selected performance is unavailable.");
  }

  const now = new Date().toISOString();
  const name = splitPublicWaitlistName(input.customerName);
  const entry: DemoWaitlistEntry = {
    communicationHistory: [],
    createdAt: now,
    customer: {
      email: input.email.trim().toLowerCase(),
      name: input.customerName.trim(),
      phone: input.mobile.trim(),
    },
    desiredZoneId: input.desiredZoneId,
    desiredZoneTitle: input.desiredZoneTitle?.trim() || undefined,
    id: `WLT-${crypto.randomUUID()}`,
    notes:
      input.source === "secret-guest-list"
        ? "Submitted via The Secret Guest List."
        : input.notes?.trim() ?? "",
    partySize: input.partySize,
    showId: input.showId,
    status: "waiting",
  };
  const { data, error } = await serviceClient.rpc(
    "create_public_waitlist_entry",
    {
      p_desired_section: entry.desiredZoneTitle ?? null,
      p_email: entry.customer.email,
      p_entry_metadata: entry,
      p_first_name: name.firstName,
      p_guest_count: input.partySize,
      p_mobile: entry.customer.phone,
      p_show_id: showId,
      p_source: input.source,
      p_surname: name.surname,
    },
  );

  if (error) throw error;

  const result = (data?.[0] ?? null) as
    | {
        customer_id: string;
        entry_metadata: DemoWaitlistEntry | null;
        waitlist_entry_id: string;
        was_created: boolean;
      }
    | null;

  if (!result) {
    throw new Error("The Waitlist request could not be saved.");
  }

  return {
    created: result.was_created,
    customerId: result.customer_id,
    entry: result.entry_metadata ?? entry,
    showId,
    waitlistEntryId: result.waitlist_entry_id,
  };
}

export async function createSecretGuestListEntry(
  serviceClient: ServiceClient,
  input: {
    email: string;
    firstName: string;
    mobile: string;
    partySize: number;
    showId: string;
    surname: string;
  },
) {
  return createPublicWaitlistEntry(serviceClient, {
    customerName: `${input.firstName.trim()} ${input.surname.trim()}`,
    email: input.email,
    mobile: input.mobile,
    partySize: input.partySize,
    showId: input.showId,
    source: "secret-guest-list",
  });
}

function getCustomerKey(customer: CustomerInfo) {
  const email = customer.email?.trim().toLowerCase();
  const phone = customer.phone?.replace(/\D/g, "");
  const name = customer.name?.trim().toLowerCase();

  return email || phone || name || "unknown-customer";
}

function splitCustomerName(name: string | undefined, fallbackKey: string) {
  const trimmedName = name?.trim() || fallbackKey;
  const [firstName = trimmedName, ...surnameParts] = trimmedName.split(/\s+/);

  return {
    firstName,
    surname: surnameParts.join(" ") || null,
  };
}

async function getShowRows(serviceClient: ServiceClient) {
  const { data, error } = await serviceClient
    .from("shows")
    .select("id,notes");

  if (error) {
    throw error;
  }

  return (data ?? []) as SupabaseShowRow[];
}

async function getSupabaseShowId(
  serviceClient: ServiceClient,
  showId: string,
) {
  const showRows = await getShowRows(serviceClient);
  const matchedShow = showRows.find(
    (show) => show.id === showId || parseShowNotes(show.notes) === showId,
  );

  return matchedShow?.id;
}

async function getLegacyShowId(
  serviceClient: ServiceClient,
  supabaseShowId: string,
) {
  const showRows = await getShowRows(serviceClient);
  const matchedShow = showRows.find((show) => show.id === supabaseShowId);

  return parseShowNotes(matchedShow?.notes ?? null) || supabaseShowId;
}

async function getOrCreateCustomerId(
  serviceClient: ServiceClient,
  customer: CustomerInfo,
) {
  const customerKey = getCustomerKey(customer);
  const email = customer.email?.trim().toLowerCase();
  const mobile = customer.phone?.trim();
  const mobileDigits = mobile?.replace(/\D/g, "");
  const filters = [
    email ? `email.eq.${email}` : "",
    mobile ? `mobile.eq.${mobile}` : "",
  ].filter(Boolean);
  let query = serviceClient.from("customers").select("id,email,mobile,preferences");

  if (filters.length > 0) {
    query = query.or(filters.join(","));
  }

  const { data: existingRows, error: loadError } = await query;

  if (loadError) {
    throw loadError;
  }

  const existingCustomer = ((existingRows ?? []) as Array<{
    email: string | null;
    id: string;
    mobile: string | null;
    preferences: { customerKey?: string } | null;
  }>).find((row) => {
    const rowMobile = row.mobile?.replace(/\D/g, "");

    return (
      row.preferences?.customerKey === customerKey ||
      (email && row.email === email) ||
      (mobileDigits && rowMobile === mobileDigits)
    );
  });

  if (existingCustomer) {
    return existingCustomer.id;
  }

  const nameParts = splitCustomerName(customer.name, customerKey);
  const { data, error } = await serviceClient
    .from("customers")
    .insert({
      dietary_requirements: null,
      email: email || null,
      first_name: nameParts.firstName,
      mobile: mobile || null,
      preferences: {
        customerKey,
        vipTags: [],
      },
      relationship_notes: "",
      surname: nameParts.surname,
      vip_status: null,
    })
    .select("id")
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (data as { id?: string } | null)?.id;
}

async function getBookingId(
  serviceClient: ServiceClient,
  bookingReference?: string,
) {
  if (!bookingReference) {
    return null;
  }

  const { data, error } = await serviceClient
    .from("bookings")
    .select("id")
    .eq("booking_reference", bookingReference)
    .limit(1);

  if (error) {
    throw error;
  }

  return (data?.[0] as { id?: string } | undefined)?.id ?? null;
}

async function getWaitlistRows(serviceClient: ServiceClient) {
  const { data, error } = await serviceClient
    .from("waitlist_entries")
    .select(
      "id,customer_id,show_id,desired_section,guest_count,status,converted_booking_id,notes,created_at,updated_at",
    )
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return (data ?? []) as SupabaseWaitlistRow[];
}

async function toSupabaseWaitlistEntry(
  serviceClient: ServiceClient,
  entry: DemoWaitlistEntry,
) {
  const customerId = await getOrCreateCustomerId(serviceClient, entry.customer);
  const showId = await getSupabaseShowId(serviceClient, entry.showId);
  const convertedBookingId = await getBookingId(serviceClient, entry.bookingReference);

  if (!customerId || !showId) {
    console.error("[Zingara API] Failed to map waitlist relations", {
      customerId,
      entryId: entry.id,
      showId,
      sourceShowId: entry.showId,
    });
    return undefined;
  }

  return {
    converted_booking_id: convertedBookingId,
    created_at: entry.createdAt,
    customer_id: customerId,
    desired_section: entry.desiredZoneTitle ?? null,
    guest_count: entry.partySize,
    notes: serializeWaitlistNotes(entry),
    show_id: showId,
    status: toSupabaseWaitlistStatus(entry.status),
    updated_at: entry.convertedAt ?? entry.promotedAt ?? entry.createdAt,
  };
}

async function toDemoWaitlistEntry(
  serviceClient: ServiceClient,
  row: SupabaseWaitlistRow,
): Promise<DemoWaitlistEntry> {
  const metadataEntry = parseWaitlistNotes(row.notes);

  if (metadataEntry) {
    return {
      ...metadataEntry,
      partySize: row.guest_count,
      showId: await getLegacyShowId(serviceClient, row.show_id),
      status: toDemoWaitlistStatus(row.status),
      desiredZoneTitle: getDisplayZoneTitle(
        metadataEntry.desiredZoneId,
        metadataEntry.desiredZoneTitle ?? row.desired_section,
      ),
    };
  }

  return {
    communicationHistory: [],
    createdAt: row.created_at,
    customer: {
      email: "",
      name: "Waitlist Guest",
      phone: "",
    },
    desiredZoneTitle: getDisplayZoneTitle(undefined, row.desired_section),
    id: row.id,
    notes: row.notes ?? "",
    partySize: row.guest_count,
    showId: await getLegacyShowId(serviceClient, row.show_id),
    status: toDemoWaitlistStatus(row.status),
  };
}

export async function loadWaitlistEntries(serviceClient: ServiceClient) {
  const rows = await getWaitlistRows(serviceClient);

  return Promise.all(rows.map((row) => toDemoWaitlistEntry(serviceClient, row)));
}

export async function persistWaitlistEntries(
  serviceClient: ServiceClient,
  entries: DemoWaitlistEntry[],
) {
  const existingRows = await getWaitlistRows(serviceClient);

  await Promise.all(
    entries.map(async (entry) => {
      const payload = await toSupabaseWaitlistEntry(serviceClient, entry);

      if (!payload) {
        return;
      }

      const existingRow = existingRows.find(
        (row) => parseWaitlistNotes(row.notes)?.id === entry.id,
      );

      if (existingRow) {
        const { error } = await serviceClient
          .from("waitlist_entries")
          .update(payload)
          .eq("id", existingRow.id);

        if (error) {
          throw error;
        }

        return;
      }

      const { error } = await serviceClient
        .from("waitlist_entries")
        .insert(payload);

      if (error) {
        throw error;
      }
    }),
  );

  return loadWaitlistEntries(serviceClient);
}
