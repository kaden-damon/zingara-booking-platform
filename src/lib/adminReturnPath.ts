const adminFallbackPath = "/admin";
const internalOrigin = "https://admin.zingara.invalid";
const sensitiveAuthParameters = new Set([
  "access_token",
  "code",
  "error",
  "error_code",
  "error_description",
  "expires_at",
  "expires_in",
  "provider_refresh_token",
  "provider_token",
  "refresh_token",
  "returnto",
  "state",
  "token",
  "token_hash",
  "type",
]);

export function sanitizeAdminReturnPath(value?: string | null) {
  const candidate = value?.trim();

  if (
    !candidate ||
    !candidate.startsWith("/") ||
    candidate.startsWith("//") ||
    candidate.includes("\\") ||
    /[\u0000-\u001f\u007f]/.test(candidate)
  ) {
    return adminFallbackPath;
  }

  let url: URL;

  try {
    url = new URL(candidate, internalOrigin);
  } catch {
    return adminFallbackPath;
  }

  if (
    url.origin !== internalOrigin ||
    (url.pathname !== "/admin" && !url.pathname.startsWith("/admin/"))
  ) {
    return adminFallbackPath;
  }

  for (const key of [...url.searchParams.keys()]) {
    if (sensitiveAuthParameters.has(key.toLowerCase())) {
      url.searchParams.delete(key);
    }
  }

  const safeHash = /(?:access_token|refresh_token|token_hash|type=(?:invite|recovery))/i.test(
    url.hash,
  )
    ? ""
    : url.hash;
  const search = url.searchParams.toString();

  return `${url.pathname}${search ? `?${search}` : ""}${safeHash}`;
}

export function getAdminLoginPath(returnPath?: string | null) {
  const safeReturnPath = sanitizeAdminReturnPath(returnPath);

  if (safeReturnPath === adminFallbackPath) {
    return adminFallbackPath;
  }

  return `${adminFallbackPath}?returnTo=${encodeURIComponent(safeReturnPath)}`;
}
