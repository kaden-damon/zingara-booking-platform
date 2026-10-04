import type { User } from "@supabase/supabase-js";

export const staffSessionValidAfterMetadataKey = "zingara_staff_sessions_valid_after";

function getAccessTokenIssuedAt(request: Request) {
  const accessToken = request.headers
    .get("authorization")
    ?.replace(/^Bearer\s+/i, "");

  if (!accessToken) return null;

  try {
    const payload = JSON.parse(
      Buffer.from(accessToken.split(".")[1] ?? "", "base64url").toString("utf8"),
    ) as { iat?: unknown };

    return typeof payload.iat === "number" ? payload.iat : null;
  } catch {
    return null;
  }
}

export function isStaffSessionCurrent(request: Request, user: User) {
  const validAfter = user.app_metadata?.[staffSessionValidAfterMetadataKey];

  if (typeof validAfter !== "number") return true;

  const issuedAt = getAccessTokenIssuedAt(request);
  return issuedAt !== null && issuedAt >= validAfter;
}
