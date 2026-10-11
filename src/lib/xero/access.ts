export function canCreateXeroQuote(permissions: string[]) {
  return permissions.includes("bookings:manage");
}

export function canCreateXeroInvoice(input: { permissions: string[]; roleName: string }) {
  return input.permissions.includes("bookings:reconcile") || input.roleName.trim().toLowerCase() === "finance";
}
