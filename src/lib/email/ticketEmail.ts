import QRCode from "qrcode";
import {
  defaultVenueSettings,
  getDisplayZoneTitle,
  getShowLocationOption,
  getTicketUrl,
  normalizeShowLocation,
  type DemoBooking,
  type DemoShow,
  type GuestTicket,
  type DemoVenueSettings,
} from "@/lib/zingaraDemo";
import {
  formatCustomerExperienceSchedule,
  getCustomerExperienceTimes,
} from "@/lib/experienceTimes";
import { getServiceClient } from "@/lib/supabase/serverAdmin";
import { loadServerVenueSettings } from "@/lib/supabase/serverVenueSettings";
import {
  createBrandedCustomerEmail,
  type EmailAttachment,
} from "@/lib/email/customerEmail";

const productionOrigin = "https://book.zingara.co.za";
const qrContentId = "zingara-ticket-qr@book.zingara.co.za";

export type TicketEmailSource = {
  booking: DemoBooking;
  qrPayload: string;
  show?: DemoShow | null;
  ticket?: GuestTicket | null;
  venueSettings?: DemoVenueSettings;
};

export type TicketEmail = {
  attachments: EmailAttachment[];
  html: string;
  message: string;
  subject: string;
};

function escapeHtml(value: string | number) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatShowDate(value: string | undefined, fallback: string) {
  if (!value) return fallback;

  const parsed = new Date(`${value.slice(0, 10)}T12:00:00+02:00`);

  if (Number.isNaN(parsed.getTime())) return fallback || value;

  return new Intl.DateTimeFormat("en-ZA", {
    day: "2-digit",
    month: "long",
    timeZone: "Africa/Johannesburg",
    weekday: "long",
    year: "numeric",
  }).format(parsed);
}

export function getAbsoluteTicketUrl(ticketReference: string) {
  return new URL(getTicketUrl(ticketReference), productionOrigin).toString();
}

export async function createZingaraTicketEmail({
  booking,
  qrPayload,
  show,
  ticket,
  venueSettings: suppliedVenueSettings,
}: TicketEmailSource): Promise<TicketEmail> {
  const authoritativeQrPayload = qrPayload.trim();

  if (!authoritativeQrPayload) {
    throw new Error("Authoritative ticket QR payload is missing.");
  }

  const ticketReference = ticket?.ticketCode ?? booking.ticketCode;

  if (!ticketReference) {
    throw new Error("Authoritative ticket reference is missing.");
  }

  const qrImage = await QRCode.toBuffer(authoritativeQrPayload, {
    color: { dark: "#000000", light: "#FFFFFF" },
    errorCorrectionLevel: "H",
    margin: 3,
    type: "png",
    width: 560,
  });
  const attachments: EmailAttachment[] = [
    {
      cid: qrContentId,
      content: qrImage,
      contentDisposition: "inline",
      contentType: "image/png",
      filename: "zingara-ticket-qr.png",
    },
  ];
  const location = normalizeShowLocation(
    show?.location ?? show?.venueName ?? show?.address,
  );
  const locationOption = location ? getShowLocationOption(location) : null;
  const serviceClient = suppliedVenueSettings ? null : getServiceClient();
  const venueSettings =
    suppliedVenueSettings ??
    (serviceClient
      ? await loadServerVenueSettings(serviceClient)
      : defaultVenueSettings);
  const experienceTimes = getCustomerExperienceTimes(venueSettings, location);

  if (!experienceTimes) {
    throw new Error("Authoritative customer experience times are missing.");
  }
  const venue = locationOption
    ? `${locationOption.courtName} · ${locationOption.city}`
    : show?.venueName ?? show?.address ?? "The Royal Countess";
  const guestName = ticket?.fullName?.trim() || booking.customer.name.trim();
  const showDate = formatShowDate(show?.date, booking.bookingDate);
  const zone = getDisplayZoneTitle(booking.zoneId, booking.zoneTitle);
  const table = "TBC";
  const liveTicketUrl = getAbsoluteTicketUrl(ticketReference);
  const ticketCount = ticket?.total ?? Math.max(booking.partySize, 1);
  const ticketPosition = ticket
    ? `Ticket ${ticket.index} of ${ticket.total}`
    : `${booking.partySize} guest${booking.partySize === 1 ? "" : "s"}`;
  const rows = [
    ["Guest", guestName],
    ["Booking reference", booking.reference],
    ["Venue", venue],
    ["Date", showDate],
    ["Grounds Open", experienceTimes.groundsOpen],
    ["Guest Seating", experienceTimes.guestSeating],
    ["Show Starts", experienceTimes.showStarts],
    ["Seating section", zone],
    ...(table ? [["Table", table]] : []),
    ["Guest information", ticketPosition],
  ];
  const detailRows = rows
    .map(
      ([label, value]) => `
        <tr>
          <td style="padding:9px 12px;color:#a8a29e;font-size:12px;line-height:1.4;text-transform:uppercase;vertical-align:top;">${escapeHtml(label)}</td>
          <td style="padding:9px 12px;color:#fffaf0;font-size:15px;line-height:1.4;text-align:right;vertical-align:top;">${escapeHtml(value)}</td>
        </tr>`,
    )
    .join("");
  const message = [
    "ZINGARA · THE ROYAL COUNTESS",
    "YOUR TICKET",
    "",
    `Guest: ${guestName}`,
    `Booking reference: ${booking.reference}`,
    `Venue: ${venue}`,
    `Date: ${showDate}`,
    "",
    formatCustomerExperienceSchedule(experienceTimes),
    `Seating section: ${zone}`,
    table ? `Table: ${table}` : "",
    `Guest information: ${ticketPosition}`,
    `Ticket reference: ${ticketReference}`,
    "",
    `Open live ticket: ${liveTicketUrl}`,
    "",
    defaultVenueSettings.ticketBranding.footerNote,
  ]
    .filter((line) => line !== "")
    .join("\n");

  const subject = `Your Zingara Ticket · ${booking.reference}`;
  const branded = await createBrandedCustomerEmail({
    ctaLabel: "OPEN LIVE TICKET",
    ctaUrl: liveTicketUrl,
    heading: "YOUR TICKET",
    html: `
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;">${detailRows}</table>
      <div style="padding:22px 0 8px;text-align:center;">
        <div style="margin-bottom:12px;color:#d8c36a;font-size:12px;letter-spacing:2px;line-height:1.4;">QR CODE</div>
        <div style="display:inline-block;padding:12px;border-radius:12px;background:#ffffff;">
          <img src="cid:${qrContentId}" width="244" height="244" alt="Scannable Zingara ticket QR code" style="display:block;width:244px;max-width:100%;height:auto;" />
        </div>
        <div style="margin-top:12px;color:#a8a29e;font-size:12px;line-height:1.5;">${escapeHtml(ticketReference)}${ticket ? ` · ${escapeHtml(ticket.index)} of ${escapeHtml(ticketCount)}` : ""}</div>
      </div>
      <p style="margin:18px 0 0;color:#a8a29e;font-size:12px;line-height:1.6;text-align:center;">
        ${escapeHtml(defaultVenueSettings.ticketBranding.footerNote)}<br />
        Box Office: <a href="mailto:bookings@zingara.co.za" style="color:#f2d66c;text-decoration:none;">bookings@zingara.co.za</a>
      </p>`,
    message,
    subject,
  });

  return {
    attachments: [...branded.attachments, ...attachments],
    html: branded.html,
    message: branded.message,
    subject,
  };
}
