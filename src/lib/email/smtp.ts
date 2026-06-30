import nodemailer from "nodemailer";

type EmailSendInput = {
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
  const fromName = process.env.EMAIL_FROM_NAME || "Zingara Bookings";
  const fromAddress =
    process.env.EMAIL_FROM_ADDRESS || "bookings@zingara.co.za";

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
      from: {
        address: config.fromAddress,
        name: config.fromName,
      },
      html: toHtmlMessage(message),
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
