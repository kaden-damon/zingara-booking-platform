import type {
  CorporateRequest,
  CorporateRequestStatus,
} from "./zingaraDemo";

export type CorporateWorkspace = "bookings" | "enquiries";
export type CorporateEnquiryLifecycle =
  | "active"
  | "converted"
  | "archived"
  | "all";

export type CorporateEnquiryFilters = {
  consultant: string;
  date: string;
  lifecycle: CorporateEnquiryLifecycle;
  location: string;
  search: string;
  status: CorporateRequestStatus | "all";
};

export function getCorporateEnquiryLifecycle(
  request: CorporateRequest,
): Exclude<CorporateEnquiryLifecycle, "all"> {
  if (request.archivedAt) {
    return "archived";
  }

  return request.status === "converted" ? "converted" : "active";
}

export function getCorporateEnquiryLifecycleCounts(
  requests: CorporateRequest[],
) {
  return requests.reduce(
    (counts, request) => {
      counts[getCorporateEnquiryLifecycle(request)] += 1;
      counts.all += 1;
      return counts;
    },
    { active: 0, all: 0, archived: 0, converted: 0 },
  );
}

function includesNormalized(value: string | undefined, search: string) {
  return (value ?? "").toLowerCase().includes(search);
}

export function filterCorporateEnquiries(
  requests: CorporateRequest[],
  filters: CorporateEnquiryFilters,
) {
  const search = filters.search.trim().toLowerCase();

  return requests.filter((request) => {
    const lifecycle = getCorporateEnquiryLifecycle(request);

    if (filters.lifecycle !== "all" && lifecycle !== filters.lifecycle) {
      return false;
    }

    if (filters.status !== "all" && request.status !== filters.status) {
      return false;
    }

    if (
      filters.location !== "all" &&
      request.locationAcknowledgement !== filters.location
    ) {
      return false;
    }

    if (filters.date !== "all" && request.preferredDate !== filters.date) {
      return false;
    }

    if (
      filters.consultant !== "all" &&
      request.assignedConsultant !== filters.consultant
    ) {
      return false;
    }

    return (
      !search ||
      includesNormalized(request.companyName, search) ||
      includesNormalized(request.contactName, search) ||
      includesNormalized(request.email, search) ||
      includesNormalized(request.contactNumber, search) ||
      includesNormalized(request.linkedBookingReference, search)
    );
  });
}

export function getCorporateFilterOptions(requests: CorporateRequest[]) {
  const unique = (values: Array<string | undefined>) =>
    [...new Set(values.map((value) => value?.trim()).filter(Boolean) as string[])]
      .sort((left, right) => left.localeCompare(right));

  return {
    consultants: unique(requests.map((request) => request.assignedConsultant)),
    dates: unique(requests.map((request) => request.preferredDate)),
    locations: unique(
      requests.map((request) => request.locationAcknowledgement),
    ),
  };
}
