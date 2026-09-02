import { readFile } from "node:fs/promises";
import path from "node:path";
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
} from "@/lib/zingaraDemo";
import type { EmailAttachment } from "@/lib/email/smtp";

const productionOrigin = "https://book.zingara.co.za";
const qrContentId = "zingara-ticket-qr@book.zingara.co.za";
const brandContentId = "zingara-brand-seal@book.zingara.co.za";

export type TicketEmailSource = {
  booking: DemoBooking;
  qrPayload: string;
  show?: DemoShow | null;
  ticket?: GuestTicket | null;
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

function formatShowTime(value: string | undefined) {
  return value?.slice(0, 5) || "Please see your live ticket";
}

function visibleTable(value: string | undefined) {
  const table = value?.trim() ?? "";
  return /^(assigned|internal|pending|unassigned|table assigned)$/i.test(table)
    ? ""
    : table;
}

export function getAbsoluteTicketUrl(ticketReference: string) {
  return new URL(getTicketUrl(ticketReference), productionOrigin).toString();
}

async function loadBrandAttachment(): Promise<EmailAttachment | null> {
  try {
    return {
      cid: brandContentId,
      content: await readFile(
        path.join(process.cwd(), "public", "brand", "wax-seal.png"),
      ),
      contentDisposition: "inline",
      contentType: "image/png",
      filename: "zingara-seal.png",
    };
  } catch (error) {
    console.error("[Zingara Email] Brand seal could not be attached", error);
    return null;
  }
}

export async function createZingaraTicketEmail({
  booking,
  qrPayload,
  show,
  ticket,
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
  const brandAttachment = await loadBrandAttachment();
  const attachments: EmailAttachment[] = [
    {
      cid: qrContentId,
      content: qrImage,
      contentDisposition: "inline",
      contentType: "image/png",
      filename: "zingara-ticket-qr.png",
    },
    ...(brandAttachment ? [brandAttachment] : []),
  ];
  const location = normalizeShowLocation(
    show?.location ?? show?.venueName ?? show?.address,
  );
  const locationOption = location ? getShowLocationOption(location) : null;
  const venue = locationOption
    ? `${locationOption.courtName} · ${locationOption.city}`
    : show?.venueName ?? show?.address ?? "The Royal Countess";
  const guestName = ticket?.fullName?.trim() || booking.customer.name.trim();
  const showDate = formatShowDate(show?.date, booking.bookingDate);
  const showTime = formatShowTime(show?.time);
  const zone = getDisplayZoneTitle(booking.zoneId, booking.zoneTitle);
  const table = visibleTable(booking.tableNumber);
  const liveTicketUrl = getAbsoluteTicketUrl(ticketReference);
  const ticketCount = ticket?.total ?? Math.max(booking.partySize, 1);
  const ticketPosition = ticket
    ? `Ticket ${ticket.index} of ${ticket.total}`
    : `${booking.partySize} guest${booking.partySize === 1 ? "" : "s"}`;
  const rows = [
    ["Guest", guestName],
    ["Booking reference", booking.reference],
    ["Venue", venue],
    ["Show date", showDate],
    ["Show time", showTime],
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
  const logo = brandAttachment
    ? `<img src="cid:${brandContentId}" width="72" height="72" alt="Zingara seal" style="display:block;margin:0 auto 14px;width:72px;height:72px;" />`
    : "";
  const message = [
    "ZINGARA · THE ROYAL COUNTESS",
    "YOUR TICKET",
    "",
    `Guest: ${guestName}`,
    `Booking reference: ${booking.reference}`,
    `Venue: ${venue}`,
    `Show date: ${showDate}`,
    `Show time: ${showTime}`,
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

  return {
    attachments,
    message,
    subject: `Your Zingara Ticket · ${booking.reference}`,
    html: `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:0;background:#0a0908;color:#fffaf0;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;background:#0a0908;">
      <tr><td align="center" style="padding:24px 14px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;max-width:620px;border:1px solid #bda85a;border-radius:20px;background:#15120f;overflow:hidden;">
          <tr><td align="center" style="padding:30px 24px 22px;border-bottom:1px solid #4f4525;">
            ${logo}
            <div style="color:#f2d66c;font-family:Georgia,'Times New Roman',serif;font-size:30px;line-height:1.05;">ZINGARA</div>
            <div style="margin-top:7px;color:#d8c36a;font-size:12px;letter-spacing:2px;line-height:1.4;">THE ROYAL COUNTESS</div>
            <div style="margin-top:22px;color:#fffaf0;font-family:Georgia,'Times New Roman',serif;font-size:24px;line-height:1.2;">YOUR TICKET</div>
          </td></tr>
          <tr><td style="padding:22px 18px 8px;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;">${detailRows}</table>
          </td></tr>
          <tr><td align="center" style="padding:22px 24px 8px;">
            <div style="margin-bottom:12px;color:#d8c36a;font-size:12px;letter-spacing:2px;line-height:1.4;">QR CODE</div>
            <div style="display:inline-block;padding:12px;border-radius:12px;background:#ffffff;">
              <img src="cid:${qrContentId}" width="244" height="244" alt="Scannable Zingara ticket QR code" style="display:block;width:244px;max-width:100%;height:auto;" />
            </div>
            <div style="margin-top:12px;color:#a8a29e;font-size:12px;line-height:1.5;">${escapeHtml(ticketReference)}${ticket ? ` · ${escapeHtml(ticket.index)} of ${escapeHtml(ticketCount)}` : ""}</div>
          </td></tr>
          <tr><td align="center" style="padding:22px 24px;">
            <a href="${escapeHtml(liveTicketUrl)}" style="display:block;padding:15px 20px;border-radius:999px;background:#d8c36a;color:#090806;font-size:14px;font-weight:700;line-height:1.2;text-align:center;text-decoration:none;">OPEN LIVE TICKET</a>
          </td></tr>
          <tr><td align="center" style="padding:0 24px 28px;color:#a8a29e;font-size:12px;line-height:1.6;">
            ${escapeHtml(defaultVenueSettings.ticketBranding.footerNote)}<br />
            Box Office: <a href="mailto:bookings@zingara.co.za" style="color:#f2d66c;text-decoration:none;">bookings@zingara.co.za</a>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`,
  };
}
