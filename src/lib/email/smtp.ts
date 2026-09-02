import nodemailer from "nodemailer";
import {
  brandedCustomerEmailMarker,
  createBrandedCustomerEmail,
  type EmailAttachment,
} from "@/lib/email/customerEmail";
import { sanitizeEmailHtml } from "@/lib/email/html";
import {
  checkCustomerOperationalCommunication,
} from "@/lib/supabase/customerCommunicationSuppression";
import type { OperationalCommunicationKind } from "@/lib/customerCommunicationPreferences";
import { getServiceClient } from "@/lib/supabase/serverAdmin";

const APPLICATION_EMAIL_SENDER = {
  address: "bookings@zingara.co.za",
  name: "Zingara Bookings",
} as const;

export type { EmailAttachment } from "@/lib/email/customerEmail";

type EmailSendInput = {
  attachments?: EmailAttachment[];
  html?: string | null;
  message: string;
  subject?: string | null;
  to?: string | null;
};

type EmailSendResult =
  | {
      error?: never;
      ok: true;
    }
  | {
      error: string;
      ok: false;
      suppressed?: false;
    }
  | {
      error: string;
      ok: false;
      suppressed: true;
    };

type OperationalCustomerEmailInput = EmailSendInput & {
  customerId: string;
  kind: OperationalCommunicationKind;
};

function parseBoolean(value: string | undefined, fallback: boolean) {
  if (value === undefined) {
    return fallback;
  }

  return ["1", "true", "yes"].includes(value.trim().toLowerCase());
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function toHtmlMessage(message: string) {
  return escapeHtml(message).replace(/\r?\n/g, "<br />");
}

function getEmailConfig() {
  const host = process.env.EMAIL_HOST || "smtp.office365.com";
  const port = Number(process.env.EMAIL_PORT || 587);
  const secure = parseBoolean(process.env.EMAIL_SECURE, false);
  const username = process.env.EMAIL_USERNAME;
  const password = process.env.EMAIL_PASSWORD;
  const fromName = APPLICATION_EMAIL_SENDER.name;
  const fromAddress = APPLICATION_EMAIL_SENDER.address;

  return {
    configured: Boolean(host && port && username && password && fromAddress),
    fromAddress,
    fromName,
    host,
    password,
    port,
    secure,
    username,
  };
}

export async function sendZingaraEmail({
  attachments,
  html,
  message,
  subject,
  to,
}: EmailSendInput): Promise<EmailSendResult> {
  const config = getEmailConfig();
  const recipient = to?.trim();

  if (!recipient) {
    return {
      error: "Email recipient is missing.",
      ok: false,
    };
  }

  if (!config.configured) {
    return {
      error: "Microsoft 365 SMTP environment variables are not configured.",
      ok: false,
    };
  }

  try {
    const transporter = nodemailer.createTransport({
      auth: {
        pass: config.password,
        user: config.username,
      },
      host: config.host,
      port: config.port,
      requireTLS: true,
      secure: config.secure,
    });

    await transporter.sendMail({
      attachments,
      from: {
        address: config.fromAddress,
        name: config.fromName,
      },
      html: html ? sanitizeEmailHtml(html) : toHtmlMessage(message),
      subject: subject?.trim() || "Zingara booking update",
      text: message,
      to: recipient,
    });

    return { ok: true };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown SMTP send failure.";

    console.error("[Zingara Email] Microsoft 365 SMTP send failed", {
      error: errorMessage,
      to: recipient,
    });

    return {
      error: errorMessage,
      ok: false,
    };
  }
}

export async function sendOperationalCustomerEmail({
  customerId,
  kind,
  ...email
}: OperationalCustomerEmailInput): Promise<EmailSendResult> {
  const serviceClient = getServiceClient();

  if (!serviceClient) {
    return {
      error: "Customer communication eligibility could not be verified.",
      ok: false,
    };
  }

  try {
    const eligibility = await checkCustomerOperationalCommunication(
      serviceClient,
      {
        channel: "email",
        customerId,
        kind,
      },
    );

    if (!eligibility.allowed) {
      return {
        error:
          eligibility.reason ??
          "Customer operational updates are temporarily paused.",
        ok: false,
        suppressed: true,
      };
    }
  } catch (error) {
    console.error(
      "[Zingara Email] Customer communication eligibility check failed",
      error,
    );
    return {
      error: "Customer communication eligibility could not be verified.",
      ok: false,
    };
  }

  if (email.html?.includes(brandedCustomerEmailMarker)) {
    return sendZingaraEmail(email);
  }

  const branded = await createBrandedCustomerEmail(email);

  return sendZingaraEmail({
    ...email,
    attachments: [...branded.attachments, ...(email.attachments ?? [])],
    html: branded.html,
    message: branded.message,
  });
}
