export type OperationalReportType = "bookings" | "check-ins" | "guest-list";

export type OperationalReportRow = Record<string, string | number>;

export const operationalReportLabels: Record<OperationalReportType, string> = {
  bookings: "Booking Manifest",
  "check-ins": "Guest Check-In Sheet",
  "guest-list": "Guest List",
};

export const operationalReportColumns: Record<OperationalReportType, string[]> = {
  bookings: [
    "Booking Ref", "Customer", "Email", "Phone", "Guests", "Zone", "Table",
    "Booking Status", "Payment Status", "Booking Value", "Paid", "Outstanding", "Notes",
  ],
  "check-ins": [
    "Booking Ref", "Customer", "Phone", "Guests", "Zone", "Table", "Booking Status",
    "Arrival Time", "Checked In", "Signature",
  ],
  "guest-list": ["Customer", "Email", "Phone", "Guests", "Zone", "Table", "Notes"],
};

export function isOperationalReportType(value: string): value is OperationalReportType {
  return value === "bookings" || value === "check-ins" || value === "guest-list";
}

export function escapeReportHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
