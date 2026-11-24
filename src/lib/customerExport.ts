import { normalizeStaffVenueScope } from "./staffLocations";

export const customerExportColumns = {
  id: "Customer ID", name: "Customer name", email: "Email", mobile: "Mobile",
  company: "Company", jobTitle: "Job title", createdAt: "Customer created",
  vip: "VIP tags", notes: "Relationship notes", dietary: "Dietary requirements",
  marketing: "Marketing preference (unverified)", archived: "Customer archived",
  bookings: "Booking count", guests: "Booked guests", firstShow: "First performance",
  lastShow: "Last performance", venues: "Venues", kinds: "Booking types",
  value: "Non-cancelled booking value (ZAR)", recordedPaid: "Recorded booking paid (ZAR)",
  payments: "Successful payment entries (ZAR)", refunds: "Accepted refunds (ZAR)",
  netPayments: "Net payment entries (ZAR)", outstanding: "Outstanding (ZAR)",
  unitemised: "Paid without matching payment entries (ZAR)",
} as const;
export type CustomerExportColumn = keyof typeof customerExportColumns;
export const defaultCustomerExportColumns: CustomerExportColumn[] = ["name", "email", "mobile", "company", "bookings", "value", "payments", "refunds", "outstanding"];
export type CustomerExportOptions = {
  action: "export"; columns: CustomerExportColumn[]; format: "csv" | "xlsx";
  search: string; archived: "active" | "archived" | "all";
  venue: "all" | "cape-town" | "johannesburg"; from: string; to: string;
  kind: "all" | "standard" | "corporate" | "buyout" | "comp";
  selectedIds: string[] | null; marketing: boolean;
};
export class CustomerExportError extends Error {
  status: number;
  constructor(message: string, status = 400) { super(message); this.status = status; }
}
export function canExportCustomerFields(permissions: string[], options: Pick<CustomerExportOptions, "columns" | "marketing">) {
  return permissions.includes("bookings:manage") &&
    (!options.columns.some(c => c === "notes" || c === "dietary") || permissions.includes("crm:read")) &&
    (!options.marketing || (permissions.includes("crm:read") && permissions.includes("communications:manage")));
}
const dateValid = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime()) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;

export function parseCustomerExportOptions(input: unknown): CustomerExportOptions {
  const b = input as Partial<CustomerExportOptions> | null;
  if (!b || b.action !== "export" || !Array.isArray(b.columns) || !b.columns.length ||
    b.columns.length > Object.keys(customerExportColumns).length || b.columns.some(c => !Object.hasOwn(customerExportColumns, c)) ||
    !["csv", "xlsx"].includes(b.format ?? "") || !["active", "archived", "all"].includes(b.archived ?? "") ||
    !["all", "cape-town", "johannesburg"].includes(b.venue ?? "") ||
    !["all", "standard", "corporate", "buyout", "comp"].includes(b.kind ?? "") ||
    typeof b.search !== "string" || b.search.length > 200 || typeof b.from !== "string" || typeof b.to !== "string" ||
    (b.from && !dateValid(b.from)) || (b.to && !dateValid(b.to)) || (b.from && b.to && b.from > b.to) || typeof b.marketing !== "boolean" ||
    (b.selectedIds !== null && (!Array.isArray(b.selectedIds) || !b.selectedIds.length || b.selectedIds.length > 20000 ||
      b.selectedIds.some(id => typeof id !== "string" || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(id))))) {
    throw new CustomerExportError("Check the selected fields, customers, format and date range.");
  }
  return { ...b, columns: [...new Set(b.columns)], selectedIds: b.selectedIds === null ? null : [...new Set(b.selectedIds)] } as CustomerExportOptions;
}

export function customerExportVenues(scope: string[], venue: CustomerExportOptions["venue"]) {
  const allowed = normalizeStaffVenueScope(scope);
  if (!allowed.length || (venue !== "all" && !allowed.includes("all") && !allowed.includes(venue))) {
    throw new CustomerExportError("You cannot export customers for this venue.", 403);
  }
  return venue === "all" ? (allowed.includes("all") ? ["cape-town", "johannesburg"] : allowed) : [venue];
}

export function deduplicateMarketingCustomers<T extends { id: string; email: string | null; verifiedConsent: boolean }>(rows: T[]) {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const email = row.email?.trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) continue;
    const group = groups.get(email) ?? []; group.push(row); groups.set(email, group);
  }
  return [...groups.values()].filter(group => group.every(r => r.verifiedConsent))
    .map(group => [...group].sort((a, b) => a.id.localeCompare(b.id))[0]);
}
