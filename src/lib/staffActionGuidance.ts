export type StaffActionGuidanceStatus =
  | "blocked"
  | "error"
  | "success"
  | "warning";

export type StaffActionGuidanceTarget =
  | {
      bookingReference: string;
      destination: "booking" | "customer" | "payment-controls";
    }
  | {
      destination: "floor" | "show";
      showId: string;
    };

export type StaffActionGuidance = {
  action?: {
    label: string;
    target: StaffActionGuidanceTarget;
  };
  message: string;
  nextStep?: string;
  status: StaffActionGuidanceStatus;
  technicalCode?: string;
  title: string;
};

type AuthoritativeOutcome = {
  code?: string;
  explanation?: string;
  message: string;
};

type GuidanceFallback = Omit<StaffActionGuidance, "status"> & {
  status?: StaffActionGuidanceStatus;
};

function readAuthoritativeOutcome(error: unknown): AuthoritativeOutcome {
  if (error instanceof Error) {
    const structured = error as Error & {
      code?: string;
      explanation?: string;
    };
    return {
      code: structured.code,
      explanation: structured.explanation,
      message: error.message,
    };
  }

  if (typeof error === "object" && error) {
    const structured = error as {
      code?: unknown;
      error?: unknown;
      explanation?: unknown;
      message?: unknown;
    };
    return {
      code: typeof structured.code === "string" ? structured.code : undefined,
      explanation:
        typeof structured.explanation === "string"
          ? structured.explanation
          : undefined,
      message:
        typeof structured.message === "string"
          ? structured.message
          : typeof structured.error === "string"
            ? structured.error
            : "",
    };
  }

  return { message: "" };
}

export function resolveStaffActionGuidance(
  error: unknown,
  fallback: GuidanceFallback,
): StaffActionGuidance {
  try {
    const outcome = readAuthoritativeOutcome(error);
    const searchable = `${outcome.code ?? ""} ${outcome.message} ${outcome.explanation ?? ""}`.toLowerCase();
    const message = outcome.explanation || outcome.message || fallback.message;

    if (/email recipient is missing|email address required|without an email/.test(searchable)) {
      return {
        ...fallback,
        message: "This booking is linked to a customer without an email address.",
        nextStep: "Add an email address to the customer profile, then retry the action.",
        status: "blocked",
        technicalCode: outcome.code ?? "CUSTOMER_EMAIL_REQUIRED",
        title: "Email address required",
      };
    }

    if (/public_zone_sales_closed|closed for public sales/.test(searchable)) {
      return {
        ...fallback,
        message: "This seating zone is closed for public sales on this performance.",
        nextStep: "Review the zone in Show & Availability Management. Floor operations remain available.",
        status: "blocked",
        technicalCode: outcome.code ?? "PUBLIC_ZONE_SALES_CLOSED",
        title: "Public sales are closed",
      };
    }

    if (/effective operational capacity|operational capacity|zone_capacity_exceeded/.test(searchable)) {
      return {
        ...fallback,
        message,
        nextStep: outcome.explanation
          ? undefined
          : "Add operational capacity from Floor or choose another seating zone.",
        status: "blocked",
        technicalCode: outcome.code,
        title: "Operational capacity prevents this action",
      };
    }

    if (/public sellable|public capacity/.test(searchable)) {
      return {
        ...fallback,
        message,
        nextStep: "Choose another seating zone or review public availability for the performance.",
        status: "blocked",
        technicalCode: outcome.code,
        title: "Public capacity prevents this action",
      };
    }

    if (/no suitable existing table|table fit|cannot seat|can't seat|combined-table capacity/.test(searchable)) {
      return {
        ...fallback,
        message,
        nextStep: "Create, merge, or select an operational table that can seat the complete party.",
        status: "blocked",
        technicalCode: outcome.code,
        title: "No suitable table is available",
      };
    }

    if (/inactive show|inactive performance|closed show|show status|performance is closed/.test(searchable)) {
      return {
        ...fallback,
        message,
        nextStep: "Review the performance status before retrying this action.",
        status: "blocked",
        technicalCode: outcome.code,
        title: "Performance status prevents this action",
      };
    }

    if (/stale|changed before|refresh and retry|already claimed|not available/.test(searchable)) {
      return {
        ...fallback,
        message,
        nextStep: "Refresh the current record, review the latest state, and retry if it is still valid.",
        status: "warning",
        technicalCode: outcome.code,
        title: "The record changed before it was saved",
      };
    }

    if (/provider|could not be sent|could not be delivered|delivery failed/.test(searchable)) {
      return {
        ...fallback,
        message,
        nextStep: "Confirm the customer destination and communication history before retrying.",
        status: "error",
        technicalCode: outcome.code,
        title: "Communication wasn't sent",
      };
    }

    return {
      ...fallback,
      message,
      status: fallback.status ?? "error",
      technicalCode: outcome.code,
    };
  } catch {
    return {
      ...fallback,
      status: fallback.status ?? "error",
    };
  }
}

export function getMissingEmailGuidance(
  bookingReference: string,
  actionTitle = "Communication wasn't sent",
): StaffActionGuidance {
  return {
    action: {
      label: "Open Customer",
      target: { bookingReference, destination: "customer" },
    },
    message: "This booking is linked to a customer without an email address.",
    nextStep: "Add an email address to the customer profile, then retry the action.",
    status: "blocked",
    technicalCode: "CUSTOMER_EMAIL_REQUIRED",
    title: actionTitle,
  };
}

export function getCommunicationFailureGuidance(
  error: unknown,
  bookingReference: string,
  title = "Communication wasn't sent",
): StaffActionGuidance {
  return resolveStaffActionGuidance(error, {
    action: {
      label: "Open Customer",
      target: { bookingReference, destination: "customer" },
    },
    message: "The communication provider did not confirm delivery.",
    nextStep: "Confirm the customer destination and communication history before retrying.",
    status: "error",
    title,
  });
}

export function getUnverifiedBulkDeliveryGuidance(): StaffActionGuidance {
  return {
    message: "This bulk control does not have authoritative customer-delivery confirmation, so no message was recorded as sent.",
    nextStep: "Use the communication action in Booking Details, where delivery is confirmed by the existing provider pathway.",
    status: "blocked",
    technicalCode: "AUTHORITATIVE_DELIVERY_UNAVAILABLE",
    title: "Communication wasn't sent",
  };
}
