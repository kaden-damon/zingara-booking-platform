import type { SupabaseClient } from "@supabase/supabase-js";

import {
  formatBookingExportFloorState,
  formatBookingExportPaymentStatus,
  formatBookingExportSeating,
  formatBookingExportSource,
  formatBookingExportStatus,
  getBookingExportAttention,
  getBookingExportType,
  type BookingExportZoneEntitlement,
  type BookingsExportRow,
} from "@/lib/bookingsExport";
import { normalizeStaffVenueScope } from "@/lib/staffLocations";
import { normalizeShowLocation } from "@/lib/zingaraDemo";

const batchSize = 200;

type BookingRow = {
  amount_paid: number;
  archive_reason: string | null;
  archived_at: string | null;
  balance_outstanding: number;
  booking_origin: string | null;
  booking_reference: string;
  booking_source: string | null;
  booking_status: string;
  company_id: string | null;
  company_name: string | null;
  corporate_request_id: string | null;
  created_at: string;
  created_by_staff_id: string | null;
  customer_id: string | null;
  guest_count: number;
  id: string;
  notes: string | null;
  payment_status: string;
  public_checkout_superseded_by: string | null;
  section: string | null;
  show_id: string;
  table_id: string | null;
  total_amount: number;
  updated_at: string;
  zone_entitlements: BookingExportZoneEntitlement[] | null;
};

export class BookingsExportError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

function chunks<T>(values: T[]) {
  return Array.from({ length: Math.ceil(values.length / batchSize) }, (_, index) =>
    values.slice(index * batchSize, (index + 1) * batchSize),
  );
}

function customerName(customer?: {
  first_name: string | null;
  surname: string | null;
}) {
  return [customer?.first_name, customer?.surname]
    .filter(Boolean)
    .join(" ")
    .trim() || "Guest";
}

function venueLabel(venue: string) {
  return normalizeShowLocation(venue) === "johannesburg" ? "JHB" : "CPT";
}

function cancellationReason(notes: string | null, archiveReason: string | null) {
  if (notes?.startsWith("__zingara_booking_meta__:")) {
    try {
      const metadata = JSON.parse(notes.slice("__zingara_booking_meta__:".length)) as {
        cancellationReason?: string;
      };
      if (metadata.cancellationReason?.trim()) return metadata.cancellationReason.trim();
    } catch {
      // Legacy notes can be non-JSON; the archive reason remains authoritative fallback.
    }
  }
  return archiveReason?.trim() ?? "";
}

export async function loadBookingsExportRows(
  client: SupabaseClient,
  references: string[],
  staffVenueScope: string[],
): Promise<BookingsExportRow[]> {
  const bookings: BookingRow[] = [];
  for (const batch of chunks(references)) {
    const { data, error } = await client
      .from("bookings")
      .select("id,customer_id,company_id,show_id,table_id,booking_reference,booking_source,booking_origin,corporate_request_id,created_by_staff_id,company_name,guest_count,booking_status,payment_status,section,zone_entitlements,total_amount,amount_paid,balance_outstanding,notes,archived_at,archive_reason,created_at,updated_at,public_checkout_superseded_by")
      .in("booking_reference", batch);
    if (error) throw error;
    bookings.push(...((data ?? []) as BookingRow[]));
  }

  if (bookings.length !== references.length) {
    throw new BookingsExportError(
      "The booking list changed while the workbook was being prepared. Refresh and try again.",
      409,
    );
  }

  const bookingIds = bookings.map((booking) => booking.id);
  const customerIds = [...new Set(bookings.flatMap((booking) => booking.customer_id ? [booking.customer_id] : []))];
  const companyIds = [...new Set(bookings.flatMap((booking) => booking.company_id ? [booking.company_id] : []))];
  const showIds = [...new Set(bookings.map((booking) => booking.show_id))];
  const staffIds = [...new Set(bookings.flatMap((booking) => booking.created_by_staff_id ? [booking.created_by_staff_id] : []))];

  const customers: Array<{ email: string | null; first_name: string | null; id: string; mobile: string | null; surname: string | null }> = [];
  for (const batch of chunks(customerIds)) {
    const { data, error } = await client.from("customers").select("id,first_name,surname,email,mobile").in("id", batch);
    if (error) throw error;
    customers.push(...(data ?? []));
  }

  const companies: Array<{ id: string; legal_name: string; trading_name: string | null }> = [];
  for (const batch of chunks(companyIds)) {
    const { data, error } = await client.from("companies").select("id,legal_name,trading_name").in("id", batch);
    if (error) throw error;
    companies.push(...(data ?? []));
  }

  const shows: Array<{ date: string; id: string; time: string; venue: string }> = [];
  for (const batch of chunks(showIds)) {
    const { data, error } = await client.from("shows").select("id,date,time,venue").in("id", batch);
    if (error) throw error;
    shows.push(...(data ?? []));
  }

  const staff: Array<{ full_name: string; id: string }> = [];
  for (const batch of chunks(staffIds)) {
    const { data, error } = await client.from("staff_profiles").select("id,full_name").in("id", batch);
    if (error) throw error;
    staff.push(...(data ?? []));
  }

  const tables: Array<{ booking_id: string; status: string; table_code: string }> = [];
  for (const batch of chunks(bookingIds)) {
    const { data, error } = await client
      .from("show_tables")
      .select("booking_id,table_code,status")
      .in("booking_id", batch)
      .in("status", ["booked", "merged"]);
    if (error) throw error;
    tables.push(...(data ?? []));
  }

  const duplicateDispositions: Array<{ authoritative_booking_id: string; residue_booking_ids: string[] }> = [];
  for (const batch of chunks(bookingIds)) {
    const { data, error } = await client
      .from("duplicate_booking_review_dispositions")
      .select("authoritative_booking_id,residue_booking_ids")
      .eq("decision", "confirmed_duplicate_resolved")
      .overlaps("residue_booking_ids", batch);
    if (error) throw error;
    duplicateDispositions.push(...(data ?? []));
  }

  const duplicateReplacementById = new Map<string, string>();
  for (const disposition of duplicateDispositions) {
    for (const residueId of disposition.residue_booking_ids ?? []) {
      duplicateReplacementById.set(residueId, disposition.authoritative_booking_id);
    }
  }
  const replacementIds = [...new Set(bookings.flatMap((booking) => {
    const replacementId = booking.public_checkout_superseded_by ?? duplicateReplacementById.get(booking.id);
    return replacementId ? [replacementId] : [];
  }))];
  const replacementRows: Array<{ booking_reference: string; id: string }> = [];
  for (const batch of chunks(replacementIds)) {
    const { data, error } = await client.from("bookings").select("id,booking_reference").in("id", batch);
    if (error) throw error;
    replacementRows.push(...(data ?? []));
  }

  const scope = normalizeStaffVenueScope(staffVenueScope ?? []);
  const canSeeAll = scope.includes("all");
  const showMap = new Map(shows.map((show) => [show.id, show]));
  for (const booking of bookings) {
    const location = normalizeShowLocation(showMap.get(booking.show_id)?.venue);
    if (!location || (!canSeeAll && !scope.includes(location))) {
      throw new BookingsExportError(
        "This export includes a booking outside your assigned location.",
        403,
      );
    }
  }

  const bookingMap = new Map(bookings.map((booking) => [booking.booking_reference, booking]));
  const customerMap = new Map(customers.map((customer) => [customer.id, customer]));
  const companyMap = new Map(companies.map((company) => [company.id, company]));
  const staffMap = new Map(staff.map((profile) => [profile.id, profile.full_name]));
  const replacementMap = new Map(replacementRows.map((booking) => [booking.id, booking.booking_reference]));
  const tableCodesByBooking = new Map<string, string[]>();
  for (const table of tables) {
    tableCodesByBooking.set(table.booking_id, [
      ...(tableCodesByBooking.get(table.booking_id) ?? []),
      table.table_code,
    ]);
  }

  return references.map((reference) => {
    const booking = bookingMap.get(reference)!;
    const show = showMap.get(booking.show_id)!;
    const customer = booking.customer_id ? customerMap.get(booking.customer_id) : undefined;
    const company = booking.company_id ? companyMap.get(booking.company_id) : undefined;
    const replacementId = booking.public_checkout_superseded_by ?? duplicateReplacementById.get(booking.id) ?? "";
    const replacementReference = replacementId ? replacementMap.get(replacementId) ?? "" : "";
    const floorState = formatBookingExportFloorState({
      bookingStatus: booking.booking_status,
      hasStoredTable: Boolean(booking.table_id),
      tableCodes: tableCodesByBooking.get(booking.id) ?? [],
    });
    const outstanding = Number(booking.balance_outstanding) || 0;

    return {
      amountPaid: Number(booking.amount_paid) || 0,
      archiveState: booking.archived_at ? "Archived" : "Active",
      attention: getBookingExportAttention({
        bookingStatus: booking.booking_status,
        floorState,
        outstanding,
        replacementReference,
      }),
      bookingReference: booking.booking_reference,
      bookingSource: formatBookingExportSource(booking.booking_source),
      bookingStatus: formatBookingExportStatus(booking.booking_status),
      bookingType: getBookingExportType({
        bookingOrigin: booking.booking_origin,
        bookingSource: booking.booking_source,
        corporateRequestId: booking.corporate_request_id,
      }),
      bookingValue: Number(booking.total_amount) || 0,
      cancellationReason: cancellationReason(booking.notes, booking.archive_reason),
      company: booking.company_name?.trim() || company?.trading_name?.trim() || company?.legal_name?.trim() || "",
      complimentary: booking.payment_status === "comp_vip" ? "Yes" : "No",
      createdAt: booking.created_at,
      createdBy: booking.created_by_staff_id ? staffMap.get(booking.created_by_staff_id) ?? "Staff record unavailable" : "Not recorded",
      customerName: customerName(customer),
      email: customer?.email ?? "",
      floorState,
      guestCount: Number(booking.guest_count) || 0,
      lastUpdated: booking.updated_at,
      mobile: customer?.mobile ?? "",
      outstanding,
      paymentStatus: formatBookingExportPaymentStatus(booking.payment_status),
      performanceDate: show.date,
      replacementReference,
      seatingSection: formatBookingExportSeating(booking.section, booking.zone_entitlements),
      showTime: show.time.slice(0, 5),
      venue: venueLabel(show.venue),
    } satisfies BookingsExportRow;
  });
}
