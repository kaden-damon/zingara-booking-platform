import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  CompanyRecord,
  CompanyWriteInput,
  CrmReviewCandidate,
} from "@/lib/companyMaster";

type CompanyRow = {
  archived_at: string | null;
  billing_address_line_1: string | null;
  billing_address_line_2: string | null;
  billing_city: string | null;
  billing_country: string | null;
  billing_email: string | null;
  billing_postal_code: string | null;
  billing_province: string | null;
  billing_suburb: string | null;
  created_at: string;
  id: string;
  legal_name: string;
  merged_into_company_id: string | null;
  phone: string | null;
  physical_address_different: boolean;
  physical_address_line_1: string | null;
  physical_address_line_2: string | null;
  physical_city: string | null;
  physical_country: string | null;
  physical_postal_code: string | null;
  physical_province: string | null;
  physical_suburb: string | null;
  primary_contact_customer_id: string | null;
  registration_number: string | null;
  revision: number;
  trading_name: string | null;
  updated_at: string;
  vat_number: string | null;
};

const companySelect = [
  "id", "legal_name", "trading_name", "registration_number", "vat_number",
  "billing_email", "phone", "billing_address_line_1", "billing_address_line_2",
  "billing_suburb", "billing_city", "billing_province", "billing_postal_code",
  "billing_country", "physical_address_different", "physical_address_line_1",
  "physical_address_line_2", "physical_suburb", "physical_city",
  "physical_province", "physical_postal_code", "physical_country",
  "primary_contact_customer_id", "archived_at", "merged_into_company_id", "revision", "created_at", "updated_at",
].join(",");

function address(input: {
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  country: string | null;
  postalCode: string | null;
  province: string | null;
  suburb: string | null;
}) {
  return {
    addressLine1: input.addressLine1 ?? "",
    addressLine2: input.addressLine2 ?? "",
    city: input.city ?? "",
    country: input.country ?? "",
    postalCode: input.postalCode ?? "",
    province: input.province ?? "",
    suburb: input.suburb ?? "",
  };
}

export async function loadCompanies(
  client: SupabaseClient,
  includeArchived = false,
): Promise<CompanyRecord[]> {
  let query = client.from("companies").select(companySelect).order("legal_name");
  if (!includeArchived) query = query.is("archived_at", null);

  const { data, error } = await query;
  if (error) throw error;
  const rows = (data ?? []) as unknown as CompanyRow[];
  const ids = rows.map((row) => row.id);
  if (ids.length === 0) return [];

  const [contactsResult, bookingsResult, requestsResult] = await Promise.all([
    client
      .from("customers")
      .select("id,company_id,first_name,surname,email,mobile,job_title,crm_revision,updated_at")
      .in("company_id", ids)
      .is("merged_into_customer_id", null)
      .order("surname"),
    client
      .from("bookings")
      .select("company_id,booking_reference,guest_count,booking_status,created_at")
      .in("company_id", ids)
      .order("created_at", { ascending: false }),
    client
      .from("corporate_requests")
      .select("id,company_id,contact_name,status,created_at")
      .in("company_id", ids)
      .order("created_at", { ascending: false }),
  ]);

  if (contactsResult.error) throw contactsResult.error;
  if (bookingsResult.error) throw bookingsResult.error;
  if (requestsResult.error) throw requestsResult.error;

  return rows.map((row) => {
    const contacts = (contactsResult.data ?? [])
      .filter((contact) => contact.company_id === row.id)
      .map((contact) => ({
        crmRevision: Number(contact.crm_revision ?? 1),
        email: contact.email,
        firstName: contact.first_name,
        id: contact.id,
        jobTitle: contact.job_title,
        mobile: contact.mobile,
        surname: contact.surname,
        updatedAt: contact.updated_at,
      }));
    const bookingHistory = (bookingsResult.data ?? [])
      .filter((booking) => booking.company_id === row.id)
      .map((booking) => ({
        bookingReference: booking.booking_reference,
        createdAt: booking.created_at,
        guestCount: Number(booking.guest_count ?? 0),
        status: booking.booking_status,
      }));
    const corporateHistory = (requestsResult.data ?? [])
      .filter((request) => request.company_id === row.id)
      .map((request) => ({
        contactName: request.contact_name,
        createdAt: request.created_at,
        id: request.id,
        status: request.status,
      }));

    return {
      archivedAt: row.archived_at,
      billingAddress: address({
        addressLine1: row.billing_address_line_1,
        addressLine2: row.billing_address_line_2,
        city: row.billing_city,
        country: row.billing_country,
        postalCode: row.billing_postal_code,
        province: row.billing_province,
        suburb: row.billing_suburb,
      }),
      billingEmail: row.billing_email,
      bookingCount: bookingHistory.length,
      bookingHistory,
      contacts,
      corporateHistory,
      corporateRequestCount: corporateHistory.length,
      createdAt: row.created_at,
      id: row.id,
      legalName: row.legal_name,
      mergedIntoCompanyId: row.merged_into_company_id,
      phone: row.phone,
      physicalAddress: row.physical_address_different
        ? address({
            addressLine1: row.physical_address_line_1,
            addressLine2: row.physical_address_line_2,
            city: row.physical_city,
            country: row.physical_country,
            postalCode: row.physical_postal_code,
            province: row.physical_province,
            suburb: row.physical_suburb,
          })
        : null,
      primaryContactCustomerId: row.primary_contact_customer_id,
      registrationNumber: row.registration_number,
      revision: row.revision,
      tradingName: row.trading_name,
      updatedAt: row.updated_at,
      vatNumber: row.vat_number,
    };
  });
}

export function toCompanyRpcPayload(values: CompanyWriteInput) {
  return {
    archiveReason: values.archiveReason ?? "",
    archived: Boolean(values.archived),
    billingAddressLine1: values.billingAddressLine1 ?? "",
    billingAddressLine2: values.billingAddressLine2 ?? "",
    billingCity: values.billingCity ?? "",
    billingCountry: values.billingCountry ?? "South Africa",
    billingEmail: values.billingEmail ?? "",
    billingPostalCode: values.billingPostalCode ?? "",
    billingProvince: values.billingProvince ?? "",
    billingSuburb: values.billingSuburb ?? "",
    legalName: values.legalName,
    phone: values.phone ?? "",
    physicalAddressDifferent: Boolean(values.physicalAddressDifferent),
    physicalAddressLine1: values.physicalAddressLine1 ?? "",
    physicalAddressLine2: values.physicalAddressLine2 ?? "",
    physicalCity: values.physicalCity ?? "",
    physicalCountry: values.physicalCountry ?? "",
    physicalPostalCode: values.physicalPostalCode ?? "",
    physicalProvince: values.physicalProvince ?? "",
    physicalSuburb: values.physicalSuburb ?? "",
    primaryContactCustomerId: values.primaryContactCustomerId ?? "",
    registrationNumber: values.registrationNumber ?? "",
    tradingName: values.tradingName ?? "",
    vatNumber: values.vatNumber ?? "",
  };
}

export async function loadCrmReviewCandidates(
  client: SupabaseClient,
): Promise<CrmReviewCandidate[]> {
  const { data, error } = await client
    .from("crm_data_review_candidates")
    .select("id,candidate_type,subject_ids,display_names,reason,evidence,status,created_at")
    .eq("status", "pending")
    .order("created_at", { ascending: false });
  if (error) throw error;

  return (data ?? []).map((row) => ({
    candidateType: row.candidate_type,
    createdAt: row.created_at,
    displayNames: row.display_names ?? [],
    evidence: row.evidence ?? {},
    id: row.id,
    reason: row.reason,
    status: row.status,
    subjectIds: row.subject_ids ?? [],
  }));
}
