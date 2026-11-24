import { normalizePhoneForComparison } from "./phone.ts";

type Contact = { email?: string | null; mobile?: string | null; first_name?: string | null; surname?: string | null };
const normalName = (value: string) => value.trim().replace(/\s+/g, " ").toLowerCase();

export function findBookingCustomer<T extends Contact>(rows: T[], input: { email?: string; name?: string; phone?: string }) {
  const email = input.email?.trim().toLowerCase();
  const emailMatches = email ? rows.filter((row) => row.email?.trim().toLowerCase() === email) : [];
  if (emailMatches.length) return emailMatches.length === 1 ? emailMatches[0] : undefined;
  const phone = normalizePhoneForComparison(input.phone);
  if (!phone || !input.name?.trim()) return undefined;
  const matches = rows.filter((row) => {
    if (email && row.email && row.email.trim().toLowerCase() !== email) return false;
    return normalizePhoneForComparison(row.mobile) === phone &&
      normalName([row.first_name, row.surname].filter(Boolean).join(" ")) === normalName(input.name || "");
  });
  return matches.length === 1 ? matches[0] : undefined;
}
