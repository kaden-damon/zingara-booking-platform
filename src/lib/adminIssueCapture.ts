export const adminOperationErrorEvent = "zingara-admin-operation-error";

export type AdminIssueTechnicalContext = {
  action?: string;
  adminPath?: string;
  applicationVersion?: string;
  bookingReference?: string;
  browser?: string;
  device?: string;
  errorCode?: string;
  errorMessage?: string;
  guestCountAfter?: number;
  guestCountBefore?: number;
  module?: string;
  performanceDate?: string;
  requestId?: string;
  showId?: string;
  status?: number;
  timestampSast?: string;
  venue?: string;
  viewport?: string;
};

const sensitiveKeyPattern =
  /authorization|cookie|password|token|secret|card|cvv|bank|account|payment.?credential/i;
const bookingReferencePattern = /^(?:ZNG|DP)-[A-Z0-9-]{4,30}$/i;

function shortText(value: unknown, limit = 240) {
  if (typeof value !== "string") return undefined;
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized ? normalized.slice(0, limit) : undefined;
}

function safeNumber(value: unknown) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) && number >= 0 ? number : undefined;
}

function readWhitelistedValue(
  body: unknown,
  keys: string[],
  depth = 0,
): unknown {
  if (!body || typeof body !== "object" || depth > 2) return undefined;

  for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
    if (sensitiveKeyPattern.test(key)) continue;
    if (keys.includes(key) && value !== null && value !== "") return value;
  }

  for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
    if (sensitiveKeyPattern.test(key)) continue;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const nested = readWhitelistedValue(value, keys, depth + 1);
      if (nested !== undefined) return nested;
    }
  }

  return undefined;
}

function describeAdminPath(path: string) {
  const pathname = path.split("?")[0] ?? path;
  const segments = pathname.split("/").filter(Boolean);
  const area = segments[2] ?? "admin";
  const moduleLabel = area
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
  const methodAction: Record<string, string> = {
    bookings: "save booking changes",
    payments: "process a payment action",
    refunds: "process a refund action",
    tables: "save a seating change",
    tickets: "process a ticket action",
  };

  return {
    action:
      methodAction[area] ?? `complete ${moduleLabel.toLowerCase()} action`,
    module: moduleLabel,
  };
}

export function createAdminOperationErrorContext(input: {
  body?: unknown;
  code?: unknown;
  explanation?: unknown;
  message?: unknown;
  method?: string;
  path: string;
  requestId?: string | null;
  status: number;
}): AdminIssueTechnicalContext {
  const route = describeAdminPath(input.path);
  const reference = shortText(
    readWhitelistedValue(input.body, [
      "bookingReference",
      "booking_reference",
      "reference",
    ]),
    40,
  );
  const bookingReference =
    reference && bookingReferencePattern.test(reference) ? reference : undefined;

  return {
    action: route.action,
    bookingReference,
    errorCode: shortText(input.code, 80),
    errorMessage:
      shortText(input.message, 300) ??
      shortText(input.explanation, 300) ??
      "The operation was rejected.",
    guestCountAfter: safeNumber(
      readWhitelistedValue(input.body, [
        "requestedGuestCount",
        "newGuestCount",
        "guestCount",
        "guest_count",
      ]),
    ),
    guestCountBefore: safeNumber(
      readWhitelistedValue(input.body, [
        "currentGuestCount",
        "previousGuestCount",
        "originalGuestCount",
      ]),
    ),
    module: route.module,
    performanceDate: shortText(
      readWhitelistedValue(input.body, ["performanceDate", "showDate", "date"]),
      40,
    ),
    requestId: shortText(input.requestId, 120),
    showId: shortText(
      readWhitelistedValue(input.body, ["showId", "show_id"]),
      80,
    ),
    status: input.status,
    venue: shortText(
      readWhitelistedValue(input.body, ["venue", "venueName", "location"]),
      80,
    ),
  };
}

export function dispatchAdminOperationError(
  context: AdminIssueTechnicalContext,
) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<AdminIssueTechnicalContext>(adminOperationErrorEvent, {
      detail: context,
    }),
  );
}

export function buildQuickIssueDescription(
  context?: AdminIssueTechnicalContext | null,
) {
  if (!context?.errorMessage) return "I encountered an issue while using Admin.";

  const target = context.bookingReference
    ? ` for booking ${context.bookingReference}`
    : "";
  const guestChange =
    context.guestCountBefore !== undefined && context.guestCountAfter !== undefined
      ? ` from ${context.guestCountBefore} to ${context.guestCountAfter} guests`
      : "";

  return `I tried to ${context.action ?? "complete an Admin action"}${target}${guestChange}. The system returned: ${context.errorMessage}`;
}

export function sanitizeAdminIssueTechnicalContext(
  value: unknown,
): AdminIssueTechnicalContext | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  const context: AdminIssueTechnicalContext = {
    action: shortText(source.action, 160),
    adminPath: shortText(source.adminPath, 300),
    applicationVersion: shortText(source.applicationVersion, 120),
    bookingReference: shortText(source.bookingReference, 40),
    browser: shortText(source.browser, 300),
    device: shortText(source.device, 80),
    errorCode: shortText(source.errorCode, 80),
    errorMessage: shortText(source.errorMessage, 500),
    guestCountAfter: safeNumber(source.guestCountAfter),
    guestCountBefore: safeNumber(source.guestCountBefore),
    module: shortText(source.module, 120),
    performanceDate: shortText(source.performanceDate, 80),
    requestId: shortText(source.requestId, 120),
    showId: shortText(source.showId, 80),
    status: safeNumber(source.status),
    timestampSast: shortText(source.timestampSast, 80),
    venue: shortText(source.venue, 80),
    viewport: shortText(source.viewport, 40),
  };

  if (
    context.bookingReference &&
    !bookingReferencePattern.test(context.bookingReference)
  ) {
    delete context.bookingReference;
  }

  const filtered = Object.fromEntries(
    Object.entries(context).filter(([, item]) => item !== undefined),
  ) as AdminIssueTechnicalContext;

  return Object.keys(filtered).length ? filtered : null;
}
