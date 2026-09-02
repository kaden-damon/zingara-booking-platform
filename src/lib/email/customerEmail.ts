import { readFile } from "node:fs/promises";
import path from "node:path";

export type EmailAttachment = {
  cid: string;
  content: Buffer;
  contentDisposition?: "attachment" | "inline";
  contentType?: string;
  filename: string;
};

export type BrandedCustomerEmail = {
  attachments: EmailAttachment[];
  html: string;
  message: string;
};

const productionOrigin = "https://book.zingara.co.za";
const brandContentId = "zingara-brand-seal@book.zingara.co.za";
export const brandedCustomerEmailMarker = 'data-zingara-customer-email="true"';

const legalLinks = [
  ["Terms & Conditions", "/royal-decrees/terms-and-conditions"],
  ["Booking Terms", "/royal-decrees/booking-terms"],
  [
    "Booking & Cancellation Policy",
    "/royal-decrees/booking-and-cancellation-policy",
  ],
  ["Privacy Policy", "/royal-decrees/privacy-policy"],
] as const;

let brandAttachmentPromise: Promise<EmailAttachment | null> | null = null;

function escapeHtml(value: string | number) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getAbsoluteUrl(value: string) {
  return new URL(value, productionOrigin).toString();
}

export function replaceCustomerTableWithTbc(value: string) {
  return value.replace(
    /\btable(?:\s+number)?\s*[:#-]?\s*[A-Za-z+_-]*\d[A-Za-z0-9+_-]*/gi,
    (match) => `${match.match(/^table/i)?.[0] ?? "Table"} TBC`,
  );
}

export function normalizeCustomerEmailLinks(value: string) {
  return value
    .replace(
      /(href\s*=\s*["'])(\/(?!\/)[^"']*)(["'])/gi,
      (_match, prefix: string, route: string, suffix: string) =>
        `${prefix}${getAbsoluteUrl(route)}${suffix}`,
    )
    .replace(
      /(^|[\s(>])(\/(?:ticket|payment|find-booking|book|royal-decrees)\/[^\s<)]*)/gm,
      (_match, prefix: string, route: string) =>
        `${prefix}${getAbsoluteUrl(route)}`,
    );
}

function linkifyPlainText(value: string) {
  const escaped = escapeHtml(normalizeCustomerEmailLinks(value));

  return escaped.replace(
    /(https:\/\/[^\s<]+)/g,
    '<a href="$1" style="color:#f2d66c;text-decoration:underline;">$1</a>',
  );
}

function plainTextToContent(value: string) {
  return value
    .split(/\r?\n\s*\r?\n/)
    .map(
      (paragraph) =>
        `<p style="margin:0 0 16px;color:#fffaf0;font-size:15px;line-height:1.65;">${linkifyPlainText(paragraph).replace(/\r?\n/g, "<br />")}</p>`,
    )
    .join("");
}

function extractBodyContent(html: string) {
  return html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1] ?? html;
}

function findPrimaryUrl(message: string, html?: string | null) {
  const source = `${message}\n${html ?? ""}`;
  const absoluteSource = normalizeCustomerEmailLinks(source);
  return (
    absoluteSource.match(
      /https:\/\/book\.zingara\.co\.za\/(?:ticket|payment|find-booking|book)\/[^\s<"')]+/i,
    )?.[0] ?? null
  );
}

async function loadBrandAttachment() {
  brandAttachmentPromise ??= readFile(
    path.join(process.cwd(), "public", "brand", "wax-seal.png"),
  )
    .then(
      (content) =>
        ({
          cid: brandContentId,
          content,
          contentDisposition: "inline",
          contentType: "image/png",
          filename: "zingara-seal.png",
        }) satisfies EmailAttachment,
    )
    .catch((error) => {
      console.error("[Zingara Email] Brand seal could not be attached", error);
      return null;
    });

  return brandAttachmentPromise;
}

export async function createBrandedCustomerEmail(input: {
  ctaLabel?: string;
  ctaUrl?: string;
  heading?: string;
  html?: string | null;
  message: string;
  subject?: string | null;
}): Promise<BrandedCustomerEmail> {
  const message = normalizeCustomerEmailLinks(
    replaceCustomerTableWithTbc(input.message),
  );
  const suppliedHtml = input.html
    ? normalizeCustomerEmailLinks(replaceCustomerTableWithTbc(input.html))
    : null;
  const content = suppliedHtml
    ? extractBodyContent(suppliedHtml)
    : plainTextToContent(message);
  const primaryUrl = input.ctaUrl
    ? getAbsoluteUrl(input.ctaUrl)
    : findPrimaryUrl(message, suppliedHtml);
  const brandAttachment = await loadBrandAttachment();
  const heading =
    input.heading?.trim() || input.subject?.trim() || "Zingara Guest Update";
  const legalNavigation = legalLinks
    .map(
      ([label, route]) =>
        `<a href="${getAbsoluteUrl(route)}" style="color:#d8c36a;text-decoration:underline;">${escapeHtml(label)}</a>`,
    )
    .join("&nbsp;&nbsp;·&nbsp;&nbsp;");

  return {
    attachments: brandAttachment ? [brandAttachment] : [],
    message,
    html: `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:0;background:#0a0908;color:#fffaf0;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" ${brandedCustomerEmailMarker} style="width:100%;background:#0a0908;">
      <tr><td align="center" style="padding:24px 14px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;max-width:620px;border:1px solid #bda85a;border-radius:20px;background:#15120f;overflow:hidden;">
          <tr><td align="center" style="padding:30px 24px 22px;border-bottom:1px solid #4f4525;">
            ${brandAttachment ? `<img src="cid:${brandContentId}" width="72" height="72" alt="Zingara seal" style="display:block;margin:0 auto 14px;width:72px;height:72px;" />` : ""}
            <div style="color:#f2d66c;font-family:Georgia,'Times New Roman',serif;font-size:30px;line-height:1.05;">ZINGARA</div>
            <div style="margin-top:7px;color:#d8c36a;font-size:12px;letter-spacing:2px;line-height:1.4;">THE ROYAL COUNTESS</div>
            <div style="margin-top:22px;color:#fffaf0;font-family:Georgia,'Times New Roman',serif;font-size:23px;line-height:1.25;">${escapeHtml(heading)}</div>
          </td></tr>
          <tr><td style="padding:26px 24px 10px;">${content}</td></tr>
          ${primaryUrl ? `<tr><td align="center" style="padding:12px 24px 26px;"><a href="${escapeHtml(primaryUrl)}" style="display:block;padding:15px 20px;border-radius:999px;background:#d8c36a;color:#090806;font-size:14px;font-weight:700;line-height:1.2;text-align:center;text-decoration:none;">${escapeHtml(input.ctaLabel ?? "OPEN SECURE ZINGARA LINK")}</a></td></tr>` : ""}
          <tr><td align="center" style="padding:22px 24px;border-top:1px solid #4f4525;color:#a8a29e;font-size:11px;line-height:1.6;">
            This email and any ticket, QR code or secure booking link contained in it are intended for the recipient and should not be shared or forwarded. Tickets and QR codes may provide access to the event and should be kept secure.
            <div style="margin-top:14px;">${legalNavigation}</div>
            <div style="margin-top:14px;">© ${new Date().getFullYear()} House of Zingara. All rights reserved.</div>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`,
  };
}
