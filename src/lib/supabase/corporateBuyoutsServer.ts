import type { SupabaseClient } from "@supabase/supabase-js";

import {
  type CorporateBuyoutPackage,
  type CorporateBuyoutState,
  type CorporateBuyoutSummary,
} from "@/lib/corporateBuyouts";

type PackageRow = {
  active: boolean;
  additional_guest_rate: number | null;
  base_amount: number;
  code: string;
  currency: "ZAR";
  date_hold_hours: number | null;
  display_name: string;
  exclusions: unknown;
  gratuity_amount: number;
  id: string;
  included_guest_count: number;
  inclusions: unknown;
  maximum_guest_count: number | null;
  payment_due_hours: number | null;
  quote_validity_hours: number | null;
  total_amount: number;
  vat_amount: number;
  version: number;
};

type SummaryRow = {
  booking_id: string;
  current_guest_count: number;
  id: string;
  package_snapshot: { displayName?: string } | null;
  revision: number;
  show_id: string;
  state: CorporateBuyoutState;
  unallocated_guest_count: number;
};

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

export function toCorporateBuyoutPackage(row: PackageRow): CorporateBuyoutPackage {
  return {
    active: row.active,
    additionalGuestRate:
      row.additional_guest_rate === null
        ? null
        : Number(row.additional_guest_rate),
    baseAmount: Number(row.base_amount),
    code: row.code,
    currency: row.currency,
    dateHoldHours: row.date_hold_hours,
    displayName: row.display_name,
    exclusions: stringArray(row.exclusions),
    gratuityAmount: Number(row.gratuity_amount),
    id: row.id,
    includedGuestCount: row.included_guest_count,
    inclusions: stringArray(row.inclusions),
    maximumGuestCount: row.maximum_guest_count,
    paymentDueHours: row.payment_due_hours,
    quoteValidityHours: row.quote_validity_hours,
    totalAmount: Number(row.total_amount),
    vatAmount: Number(row.vat_amount),
    version: row.version,
  };
}

export async function loadCorporateBuyoutPackages(
  client: SupabaseClient,
  activeOnly = true,
) {
  let query = client
    .from("corporate_buyout_packages")
    .select(
      "id,code,version,display_name,currency,base_amount,gratuity_amount,vat_amount,total_amount,included_guest_count,maximum_guest_count,additional_guest_rate,quote_validity_hours,date_hold_hours,payment_due_hours,inclusions,exclusions,active",
    )
    .order("display_name", { ascending: true })
    .order("version", { ascending: false });

  if (activeOnly) query = query.eq("active", true);

  const { data, error } = await query;
  if (error) throw error;
  return ((data ?? []) as PackageRow[]).map(toCorporateBuyoutPackage);
}

export async function loadActiveCorporateBuyoutSummaries(
  client: SupabaseClient,
  showIds: string[],
) {
  const ids = [...new Set(showIds)].filter(Boolean);
  if (ids.length === 0) return new Map<string, CorporateBuyoutSummary>();

  const { data, error } = await client
    .from("corporate_buyouts")
    .select(
      "id,show_id,booking_id,state,current_guest_count,unallocated_guest_count,package_snapshot,revision",
    )
    .in("show_id", ids)
    .in("state", ["provisional", "awaiting_payment", "fully_paid", "confirmed"]);
  if (error) throw error;

  const rows = (data ?? []) as SummaryRow[];
  const bookingIds = rows.map((row) => row.booking_id);
  const { data: bookings, error: bookingError } = bookingIds.length
    ? await client
        .from("bookings")
        .select("id,booking_reference,company_name")
        .in("id", bookingIds)
    : { data: [], error: null };
  if (bookingError) throw bookingError;

  const bookingById = new Map(
    (bookings ?? []).map((booking) => [booking.id, booking]),
  );

  return new Map(
    rows.map((row) => {
      const booking = bookingById.get(row.booking_id);
      return [
        row.show_id,
        {
          bookingReference: booking?.booking_reference ?? "",
          companyName: booking?.company_name ?? "Corporate Client",
          currentGuestCount: row.current_guest_count,
          id: row.id,
          packageName:
            row.package_snapshot?.displayName ?? "Full Show Buyout",
          revision: row.revision,
          state: row.state,
          unallocatedGuestCount: row.unallocated_guest_count,
        },
      ];
    }),
  );
}
