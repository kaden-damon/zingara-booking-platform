import crypto from "node:crypto";

const context = "zingara-pre-show-attendance-v1";

type TokenEnvelope = {
  ciphertext: string;
  iv: string;
  tag: string;
  version: 1;
};

function getEncryptionKey(secret = process.env.SUPABASE_SERVICE_ROLE_KEY) {
  if (!secret) throw new Error("Attendance-link protection is not configured.");
  return crypto.createHash("sha256").update(`${context}:${secret}`).digest();
}

export function createAttendanceToken() {
  return crypto.randomBytes(32).toString("base64url");
}

export function hashAttendanceToken(token: string) {
  return crypto.createHash("sha256").update(token, "utf8").digest("hex");
}

export function sealAttendanceToken(token: string, secret?: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getEncryptionKey(secret), iv);
  cipher.setAAD(Buffer.from(context));
  const ciphertext = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);

  return {
    ciphertext: ciphertext.toString("base64url"),
    iv: iv.toString("base64url"),
    tag: cipher.getAuthTag().toString("base64url"),
    version: 1,
  } satisfies TokenEnvelope;
}

export function openAttendanceToken(value: unknown, secret?: string) {
  if (!value || typeof value !== "object") return null;
  const envelope = value as Partial<TokenEnvelope>;
  if (
    envelope.version !== 1 ||
    typeof envelope.ciphertext !== "string" ||
    typeof envelope.iv !== "string" ||
    typeof envelope.tag !== "string"
  ) return null;

  try {
    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      getEncryptionKey(secret),
      Buffer.from(envelope.iv, "base64url"),
    );
    decipher.setAAD(Buffer.from(context));
    decipher.setAuthTag(Buffer.from(envelope.tag, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(envelope.ciphertext, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return null;
  }
}

export function buildAttendanceUrl(
  origin: string,
  token: string,
  response: "confirmed" | "declined",
) {
  const base = origin.replace(/\/$/, "");
  return `${base}/attendance/${encodeURIComponent(token)}?response=${response}`;
}
