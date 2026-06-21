import {
  type CorporateRequest,
  type CorporateRequestStatus,
} from "@/lib/zingaraDemo";
import { getServiceClient } from "./serverAdmin";

type ServiceClient = NonNullable<ReturnType<typeof getServiceClient>>;

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
const corporateRequestSelect =
  "id,request_type,status,company_name,contact_name,contact_number,email,preferred_event_date,alternative_event_date,guest_count,seating_preference,occasion,other_description,dietary_requirements,other_dietary_requirement,bar_tab,addons,notes,source,archived_at,linked_booking_reference,created_at,updated_at";

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

async function getCorporateRequestRows(serviceClient: ServiceClient) {
  const { data, error } = await serviceClient
    .from("corporate_requests")
    .select(corporateRequestSelect)
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return (data ?? []) as SupabaseCorporateRequestRow[];
}

export async function loadCorporateRequests(serviceClient: ServiceClient) {
  const rows = await getCorporateRequestRows(serviceClient);

  return rows.map(toCorporateRequest);
}

export async function persistCorporateRequests(
  serviceClient: ServiceClient,
  requests: CorporateRequest[],
  options: { replace?: boolean } = {},
) {
  const existingRows = await getCorporateRequestRows(serviceClient);
  const requestIds = new Set(requests.map((request) => request.id));

  await Promise.all(
    requests.map(async (request) => {
      const payload = toSupabaseCorporateRequest(request);
      const existingRow = existingRows.find(
        (row) =>
          parseCorporateRequestNotes(row.notes)?.id === request.id ||
          row.linked_booking_reference === request.linkedBookingReference,
      );

      if (existingRow) {
        const { error } = await serviceClient
          .from("corporate_requests")
          .update(payload)
          .eq("id", existingRow.id);

        if (error) {
          throw error;
        }

        return;
      }

      const { error } = await serviceClient
        .from("corporate_requests")
        .insert(payload);

      if (error) {
        throw error;
      }
    }),
  );

  if (options.replace) {
    await Promise.all(
      existingRows.map(async (row) => {
        const metadataRequest = parseCorporateRequestNotes(row.notes);

        if (!metadataRequest || requestIds.has(metadataRequest.id)) {
          return;
        }

        const { error } = await serviceClient
          .from("corporate_requests")
          .delete()
          .eq("id", row.id);

        if (error) {
          throw error;
        }
      }),
    );
  }

  return loadCorporateRequests(serviceClient);
}
