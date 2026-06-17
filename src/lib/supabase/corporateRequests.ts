import {
  type CorporateRequest,
  type CorporateRequestStatus,
  getStoredCorporateRequests,
  storeCorporateRequests,
} from "@/lib/zingaraDemo";
import { getSupabaseClient } from "./client";

type SupabaseCorporateRequestStatus =
  | "archived"
  | "awaiting_acceptance"
  | "awaiting_payment"
  | "cancelled"
  | "confirmed"
  | "converted"
  | "corporate_tentative"
  | "quote_sent";

type SupabaseCorporateRequestType =
  | "agent_contact"
  | "corporate_booking";

type SupabaseCorporateRequestRow = {
  addons: string[];
  alternative_event_date: string | null;
  archived_at: string | null;
  bar_tab: string | null;
  company_name: string;
  contact_name: string;
  contact_number: string | null;
  created_at: string;
  dietary_requirements: string[];
  email: string | null;
  guest_count: number | null;
  id: string;
  linked_booking_reference: string | null;
  notes: string | null;
  occasion: string | null;
  other_description: string | null;
  other_dietary_requirement: string | null;
  preferred_event_date: string | null;
  request_type: SupabaseCorporateRequestType;
  seating_preference: string | null;
  source: string;
  status: SupabaseCorporateRequestStatus;
  updated_at: string;
};

const metadataPrefix = "__zingara_corporate_request_meta__:";

function toSupabaseStatus(
  status: CorporateRequestStatus,
): SupabaseCorporateRequestStatus {
  if (status === "awaiting-acceptance") {
    return "awaiting_acceptance";
  }

  if (status === "awaiting-payment") {
    return "awaiting_payment";
  }

  if (status === "corporate-tentative") {
    return "corporate_tentative";
  }

  if (status === "quote-sent") {
    return "quote_sent";
  }

  return status;
}

function toCorporateRequestStatus(
  status: SupabaseCorporateRequestStatus,
): CorporateRequestStatus {
  if (status === "awaiting_acceptance") {
    return "awaiting-acceptance";
  }

  if (status === "awaiting_payment") {
    return "awaiting-payment";
  }

  if (status === "corporate_tentative" || status === "archived") {
    return "corporate-tentative";
  }

  if (status === "quote_sent") {
    return "quote-sent";
  }

  return status;
}

function toSupabaseRequestType(
  requestType: CorporateRequest["requestType"],
): SupabaseCorporateRequestType {
  return requestType === "agent-contact"
    ? "agent_contact"
    : "corporate_booking";
}

function toCorporateRequestType(
  requestType: SupabaseCorporateRequestType,
): CorporateRequest["requestType"] {
  return requestType === "agent_contact"
    ? "agent-contact"
    : "corporate-booking";
}

function parseCorporateRequestNotes(notes: string | null) {
  if (!notes?.startsWith(metadataPrefix)) {
    return undefined;
  }

  try {
    return JSON.parse(notes.slice(metadataPrefix.length)) as CorporateRequest;
  } catch {
    return undefined;
  }
}

function serializeCorporateRequestNotes(request: CorporateRequest) {
  return `${metadataPrefix}${JSON.stringify(request)}`;
}

function toSupabaseCorporateRequest(request: CorporateRequest) {
  return {
    addons: request.addons,
    alternative_event_date: request.alternativeDate || null,
    archived_at: request.archivedAt ?? null,
    bar_tab: request.barTab || null,
    company_name: request.companyName || "Corporate Request",
    contact_name: request.contactName || "Corporate Contact",
    contact_number: request.contactNumber || null,
    created_at: request.createdAt,
    dietary_requirements: request.dietaryRequirements,
    email: request.email || null,
    guest_count: request.guestCount,
    linked_booking_reference: request.linkedBookingReference ?? null,
    notes: serializeCorporateRequestNotes(request),
    occasion: request.occasion || null,
    other_description: request.otherOccasion || null,
    other_dietary_requirement: request.otherDietaryRequirement || null,
    preferred_event_date: request.preferredDate || null,
    request_type: toSupabaseRequestType(request.requestType),
    seating_preference: request.seatingPreference || null,
    source: request.source,
    status: toSupabaseStatus(request.status),
    updated_at: request.updatedAt,
  };
}

function toCorporateRequest(row: SupabaseCorporateRequestRow): CorporateRequest {
  const metadataRequest = parseCorporateRequestNotes(row.notes);

  if (metadataRequest) {
    return {
      ...metadataRequest,
      archivedAt: row.archived_at ?? metadataRequest.archivedAt,
      linkedBookingReference:
        row.linked_booking_reference ??
        metadataRequest.linkedBookingReference,
      status: toCorporateRequestStatus(row.status),
      updatedAt: row.updated_at,
    };
  }

  return {
    addons: row.addons ?? [],
    alternativeDate: row.alternative_event_date ?? "",
    archivedAt: row.archived_at ?? undefined,
    barTab: row.bar_tab ?? "No Bar Tab",
    communicationHistory: [],
    companyName: row.company_name,
    contactName: row.contact_name,
    contactNumber: row.contact_number ?? "",
    createdAt: row.created_at,
    dietaryRequirements: row.dietary_requirements ?? [],
    email: row.email ?? "",
    guestCount: row.guest_count ?? 1,
    id: row.id,
    linkedBookingReference: row.linked_booking_reference ?? undefined,
    notes: row.notes ?? "",
    occasion: row.occasion ?? "",
    otherDietaryRequirement: row.other_dietary_requirement ?? "",
    otherOccasion: row.other_description ?? "",
    preferredDate: row.preferred_event_date ?? "",
    requestType: toCorporateRequestType(row.request_type),
    seatingPreference: row.seating_preference ?? "",
    source: "Corporate Direct",
    status: toCorporateRequestStatus(row.status),
    updatedAt: row.updated_at,
  };
}

async function getCorporateRequestRows() {
  const supabase = getSupabaseClient();

  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase
    .from("corporate_requests")
    .select(
      "id,request_type,status,company_name,contact_name,contact_number,email,preferred_event_date,alternative_event_date,guest_count,seating_preference,occasion,other_description,dietary_requirements,other_dietary_requirement,bar_tab,addons,notes,source,archived_at,linked_booking_reference,created_at,updated_at",
    )
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[Zingara Supabase] Failed to load corporate requests", error);
    return null;
  }

  return (data ?? []) as SupabaseCorporateRequestRow[];
}

async function persistCorporateRequestsToSupabase(
  requests: CorporateRequest[],
) {
  const supabase = getSupabaseClient();

  if (!supabase) {
    return requests;
  }

  const existingRows = (await getCorporateRequestRows()) ?? [];

  await Promise.all(
    requests.map(async (request) => {
      const payload = toSupabaseCorporateRequest(request);
      const existingRow = existingRows.find(
        (row) =>
          row.id === request.id ||
          parseCorporateRequestNotes(row.notes)?.id === request.id ||
          row.linked_booking_reference === request.linkedBookingReference,
      );

      if (existingRow) {
        const { error } = await supabase
          .from("corporate_requests")
          .update(payload)
          .eq("id", existingRow.id);

        if (error) {
          console.error(
            "[Zingara Supabase] Failed to update corporate request",
            error,
          );
        }

        return;
      }

      const { error } = await supabase
        .from("corporate_requests")
        .insert(payload);

      if (error) {
        console.error(
          "[Zingara Supabase] Failed to create corporate request",
          error,
        );
      }
    }),
  );

  return requests;
}

export async function getCorporateRequests() {
  const fallbackRequests = getStoredCorporateRequests();
  const rows = await getCorporateRequestRows();

  if (!rows) {
    return fallbackRequests;
  }

  if (rows.length === 0) {
    await persistCorporateRequestsToSupabase(fallbackRequests);

    return fallbackRequests;
  }

  const supabaseRequests = rows.map(toCorporateRequest);
  const supabaseIds = new Set(supabaseRequests.map((request) => request.id));

  return [
    ...supabaseRequests,
    ...fallbackRequests.filter((request) => !supabaseIds.has(request.id)),
  ];
}

export async function getCorporateRequest(id: string) {
  const requests = await getCorporateRequests();

  return requests.find((request) => request.id === id);
}

export async function createCorporateRequest(request: CorporateRequest) {
  const nextRequests = [request, ...getStoredCorporateRequests()];

  storeCorporateRequests(nextRequests);
  await persistCorporateRequestsToSupabase(nextRequests);

  return request;
}

export async function updateCorporateRequest(request: CorporateRequest) {
  const nextRequests = getStoredCorporateRequests().map((currentRequest) =>
    currentRequest.id === request.id ? request : currentRequest,
  );

  storeCorporateRequests(nextRequests);
  await persistCorporateRequestsToSupabase(nextRequests);

  return request;
}

export async function saveCorporateRequests(requests: CorporateRequest[]) {
  storeCorporateRequests(requests);
  await persistCorporateRequestsToSupabase(requests);

  return getCorporateRequests();
}
