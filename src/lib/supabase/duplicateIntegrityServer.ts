import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildDuplicateIntegrityGroups,
  duplicateBookingReviewKey,
  excludeReviewedBookingGroups,
  type DuplicateIntegrityGroup,
  type DuplicateIntegrityRecord,
} from "@/lib/duplicateIntegrity";
import { getImportedCorporateProvenance } from "@/lib/corporateFinancialReconciliation";
import { resolveCorporateEnquiryLocation } from "@/lib/corporateEnquiryRouting";
import { isCorporateBookingSource } from "@/lib/bookingClassification";
import { normalizeShowLocation } from "@/lib/zingaraDemo";
import { normalizeStaffVenueScope } from "@/lib/staffLocations";
import { loadCorporateRequests } from "./corporateRequestsServer";

type BookingRow = {
  amount_paid: number;
  balance_outstanding: number;
  booking_origin: string | null;
  booking_reference: string;
  booking_source: string;
  booking_status: string;
  company_name: string | null;
  corporate_request_id: string | null;
  created_at: string;
  created_by_staff_id: string | null;
  customer_id: string;
  customers: {
    email: string | null;
    first_name: string | null;
    mobile: string | null;
    surname: string | null;
  } | null;
  guest_count: number;
  id: string;
  payment_status: string;
  section: string | null;
  shows: {
    date: string;
    id: string;
    time: string;
    venue: string;
  } | null;
  total_amount: number;
};

function canonical(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function bookingIdentity(row: BookingRow) {
  return [
    row.customer_id,
    canonical(row.customers?.email),
    (row.customers?.mobile ?? "").replace(/\D/g, ""),
  ].join("|");
}

function showLabel(row: BookingRow) {
  if (!row.shows) return "Unknown performance";
  const venue = normalizeShowLocation(row.shows.venue);
  return `${venue === "cape-town" ? "Cape Town" : "Johannesburg"} · ${row.shows.date} · ${row.shows.time.slice(0, 5)}`;
}

async function getBookingRecords(
  serviceClient: SupabaseClient,
  allowedLocations: string[],
  corporateRequests: Awaited<ReturnType<typeof loadCorporateRequests>>,
) {
  const rows: BookingRow[] = [];
  const pageSize = 1000;

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await serviceClient
      .from("bookings")
      .select(
        "id,booking_reference,booking_source,booking_origin,booking_status,payment_status,company_name,corporate_request_id,customer_id,guest_count,section,total_amount,amount_paid,balance_outstanding,created_at,created_by_staff_id,customers(first_name,surname,email,mobile),shows(id,date,time,venue)",
      )
      .order("created_at", { ascending: false })
      .range(from, from + pageSize - 1);

    if (error) throw error;
    const page = (data ?? []) as unknown as BookingRow[];
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  const requestIds = Array.from(
    new Set(rows.map((row) => row.corporate_request_id).filter(Boolean)),
  ) as string[];
  const staffIds = Array.from(
    new Set(rows.map((row) => row.created_by_staff_id).filter(Boolean)),
  ) as string[];
  const staffResult = await (staffIds.length
      ? serviceClient
          .from("staff_profiles")
          .select("id,full_name")
          .in("id", staffIds)
      : Promise.resolve({ data: [], error: null }));
  const requestIdSet = new Set(requestIds);
  const fingerprints = new Map(
    corporateRequests
      .filter((request) => requestIdSet.has(request.id))
      .map((request) => [
        request.id,
        getImportedCorporateProvenance(request)?.fingerprint ?? null,
      ]),
  );
  const staffNames = new Map(
    (staffResult.data ?? []).map((profile) => [
      String(profile.id),
      String(profile.full_name),
    ]),
  );

  return rows
    .filter((row) => {
      const location = normalizeShowLocation(row.shows?.venue ?? "");
      return (
        allowedLocations.includes("all") ||
        Boolean(location && allowedLocations.includes(location))
      );
    })
    .map((row): DuplicateIntegrityRecord => ({
      amount: Number(row.total_amount) || 0,
      amountPaid: Number(row.amount_paid) || 0,
      bookingStatus: row.booking_status,
      capacityPax: row.guest_count,
      company: row.company_name ?? "",
      corporateImportFingerprint: row.corporate_request_id
        ? fingerprints.get(row.corporate_request_id)
        : null,
      createdAt: row.created_at,
      createdBy: row.created_by_staff_id
        ? staffNames.get(row.created_by_staff_id) ?? "Staff"
        : row.booking_origin === "customer_public"
          ? "Public Online"
          : "Not recorded",
      customer: [row.customers?.first_name, row.customers?.surname]
        .filter(Boolean)
        .join(" "),
      customerIdentity: bookingIdentity(row),
      email: row.customers?.email ?? "",
      id: row.id,
      importSource: row.booking_origin === "data_import" ? "Data Import" : null,
      mobile: row.customers?.mobile ?? "",
      outstanding: Number(row.balance_outstanding) || 0,
      pax: row.guest_count,
      recordType: isCorporateBookingSource(row.booking_source)
        ? "corporate-booking"
        : "standard-booking",
      reference: row.booking_reference,
      seatingZone: row.section ?? "Not recorded",
      showId: row.shows?.id ?? "",
      showLabel: showLabel(row),
      source: row.booking_origin ?? row.booking_source,
      status: row.payment_status,
      tableAssignments: [],
      ticketCount: 0,
    }));
}

async function getEnquiryRecords(
  allowedLocations: string[],
  requests: Awaited<ReturnType<typeof loadCorporateRequests>>,
) {
  return requests
    .filter((request) => {
      const location = resolveCorporateEnquiryLocation(
        request.locationAcknowledgement,
      );
      return (
        allowedLocations.includes("all") ||
        Boolean(location && allowedLocations.includes(location))
      );
    })
    .map((request): DuplicateIntegrityRecord => {
      const provenance = getImportedCorporateProvenance(request);
      const location = resolveCorporateEnquiryLocation(
        request.locationAcknowledgement,
      );
      const identity = [
        canonical(request.email),
        request.contactNumber.replace(/\D/g, ""),
        canonical(request.companyName),
        canonical(request.contactName),
      ].join("|");

      return {
        amount: request.financialReconciliation?.totalObligation ?? 0,
        amountPaid: request.financialReconciliation?.amountPaid ?? 0,
        bookingStatus: request.status,
        capacityPax: 0,
        company: request.companyName,
        createdAt: request.createdAt,
        createdBy: request.source,
        customer: request.contactName,
        customerIdentity: identity,
        email: request.email,
        id: request.id,
        importFingerprint: provenance?.fingerprint ?? null,
        importSource: provenance
          ? `${provenance.sourceFile} · row ${provenance.sourceRow}`
          : null,
        mobile: request.contactNumber,
        outstanding:
          request.financialReconciliation?.outstandingAmount ?? 0,
        pax: request.guestCount ?? 0,
        recordType: "corporate-enquiry",
        reference: request.id,
        seatingZone: request.seatingPreference || "Not recorded",
        showId: request.preferredDate,
        showLabel: `${location === "cape-town" ? "Cape Town" : location === "johannesburg" ? "Johannesburg" : "Venue not recorded"} · ${request.preferredDate || "Date not recorded"}`,
        source: request.source,
        status: request.status,
        tableAssignments: [],
        ticketCount: 0,
      };
    });
}

async function enrichCandidateRecords(
  serviceClient: SupabaseClient,
  records: DuplicateIntegrityRecord[],
) {
  const bookingIds = records
    .filter((record) => record.recordType !== "corporate-enquiry")
    .map((record) => record.id);
  if (bookingIds.length === 0) return records;

  const [{ data: tickets }, { data: tables }] = await Promise.all([
    serviceClient.from("tickets").select("booking_id").in("booking_id", bookingIds),
    serviceClient
      .from("show_tables")
      .select("booking_id,table_code")
      .in("booking_id", bookingIds),
  ]);
  const ticketCounts = new Map<string, number>();
  const tableCodes = new Map<string, string[]>();

  for (const ticket of tickets ?? []) {
    const id = String(ticket.booking_id);
    ticketCounts.set(id, (ticketCounts.get(id) ?? 0) + 1);
  }
  for (const table of tables ?? []) {
    const id = String(table.booking_id);
    tableCodes.set(id, [...(tableCodes.get(id) ?? []), String(table.table_code)]);
  }

  return records.map((record) => ({
    ...record,
    tableAssignments: tableCodes.get(record.id) ?? record.tableAssignments,
    ticketCount: ticketCounts.get(record.id) ?? record.ticketCount,
  }));
}

export async function loadPotentialDuplicateGroups(
  serviceClient: SupabaseClient,
  allowedLocations: string[],
): Promise<DuplicateIntegrityGroup[]> {
  const normalizedLocations = normalizeStaffVenueScope(allowedLocations);
  const corporateRequests = await loadCorporateRequests(serviceClient);
  const [bookings, enquiries] = await Promise.all([
    getBookingRecords(serviceClient, normalizedLocations, corporateRequests),
    getEnquiryRecords(normalizedLocations, corporateRequests),
  ]);
  const initialGroups = buildDuplicateIntegrityGroups([...bookings, ...enquiries]);
  const bookingReviewKeys = initialGroups
    .map((group) => duplicateBookingReviewKey(group.records))
    .filter((key): key is string => Boolean(key));
  const { data: dispositions, error: dispositionError } = bookingReviewKeys.length
    ? await serviceClient
        .from("duplicate_booking_review_dispositions")
        .select("review_key")
        .in("review_key", bookingReviewKeys)
    : { data: [], error: null };

  if (dispositionError) throw dispositionError;

  const unresolvedGroups = excludeReviewedBookingGroups(
    initialGroups,
    new Set((dispositions ?? []).map((row) => String(row.review_key))),
  );
  const candidateIds = new Set(
    unresolvedGroups.flatMap((group) =>
      group.records.map((record) => record.id),
    ),
  );
  const enriched = await enrichCandidateRecords(
    serviceClient,
    [...bookings, ...enquiries].filter((record) => candidateIds.has(record.id)),
  );
  const enrichedById = new Map(enriched.map((record) => [record.id, record]));

  return unresolvedGroups.map((group) => ({
    ...group,
    records: group.records.map((record) => enrichedById.get(record.id) ?? record),
  }));
}

export async function findPotentialInternalBookingDuplicates(
  serviceClient: SupabaseClient,
  input: {
    amount: number;
    customerEmail?: string;
    customerMobile?: string;
    pax: number;
    showId: string;
    zone: string;
  },
) {
  const email = canonical(input.customerEmail);
  const mobile = (input.customerMobile ?? "").replace(/\D/g, "");
  let customersQuery = serviceClient
    .from("customers")
    .select("id,first_name,surname,email,mobile")
    .limit(20);

  if (email) {
    customersQuery = customersQuery.ilike("email", email);
  } else if (mobile) {
    customersQuery = customersQuery.ilike("mobile", `%${mobile.slice(-9)}`);
  } else {
    return [];
  }

  const { data: customers, error: customerError } = await customersQuery;
  if (customerError) throw customerError;
  const customerIds = (customers ?? []).map((customer) => String(customer.id));
  if (customerIds.length === 0) return [];

  const { data, error } = await serviceClient
    .from("bookings")
    .select(
      "id,booking_reference,customer_id,guest_count,section,total_amount,booking_status,created_at",
    )
    .eq("show_id", input.showId)
    .in("customer_id", customerIds)
    .in("booking_status", ["new", "confirmed", "pending_payment", "checked_in"])
    .order("created_at", { ascending: false })
    .limit(10);

  if (error) throw error;

  return (data ?? []).filter(
    (row) =>
      Number(row.guest_count) === input.pax &&
      canonical(String(row.section ?? "")) === canonical(input.zone) &&
      Math.abs(Number(row.total_amount ?? 0) - input.amount) < 0.01,
  );
}
