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
        message: "There aren't enough approved seats available for this change.",
        nextStep: "Choose another seating section or ask an authorised manager to review Extra seating.",
        status: "blocked",
        technicalCode: outcome.code,
        title: "Not enough approved seats",
      };
    }

    if (/public sellable|public capacity/.test(searchable)) {
      return {
        ...fallback,
        message: "There aren't enough Public seats available for this booking.",
        nextStep: "Choose another seating zone or review public availability for the performance.",
        status: "blocked",
        technicalCode: outcome.code,
        title: "Not enough Public seats",
      };
    }

    if (/no suitable existing table|table fit|cannot seat|can't seat|combined-table capacity/.test(searchable)) {
      return {
        ...fallback,
        message: "This table doesn't fit this booking.",
        nextStep: "Choose another table or use Find tables.",
        status: "blocked",
        technicalCode: outcome.code,
        title: "No table fits this group",
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

    if (/booking_already_paid|already fully paid/.test(searchable)) {
      return {
        ...fallback,
        message: outcome.explanation || "This booking is already fully paid.",
        nextStep: "Review Payment Controls before recording any further financial action.",
        status: "blocked",
        technicalCode: outcome.code ?? "BOOKING_ALREADY_PAID",
        title: "Booking already paid",
      };
    }

    if (/corporate_reinstatement_payment_required|record the verified eft payment/.test(searchable)) {
      return {
        ...fallback,
        message: outcome.explanation || "Record the verified EFT payment before reinstating this booking.",
        nextStep: "Use Mark Paid with the verified EFT or manual payment evidence, then reopen Reinstate Booking.",
        status: "blocked",
        technicalCode: outcome.code ?? "CORPORATE_REINSTATEMENT_PAYMENT_REQUIRED",
        title: "Payment required",
      };
    }

    if (/corporate_reinstatement_not_eligible|not eligible for corporate reinstatement/.test(searchable)) {
      return {
        ...fallback,
        message,
        nextStep: "Use the controlled cancellation or refund management process for this booking.",
        status: "blocked",
        technicalCode: outcome.code ?? "CORPORATE_REINSTATEMENT_NOT_ELIGIBLE",
        title: "Reinstatement is not available",
      };
    }

    if (/mark_paid_not_allowed|cannot be manually marked paid/.test(searchable)) {
      return {
        ...fallback,
        message,
        nextStep: "Review the booking lifecycle and payment evidence before choosing another action.",
        status: "blocked",
        technicalCode: outcome.code ?? "MARK_PAID_NOT_ALLOWED",
        title: "Mark Paid is not available",
      };
    }

    if (/payment.*changed|stale.*payment|payment.*revision/.test(searchable)) {
      return {
        ...fallback,
        message: "The payment details changed while you were working.",
        nextStep: "Refresh before continuing.",
        status: "warning",
        technicalCode: outcome.code,
        title: "Payment details changed",
      };
    }

    if (/permission|forbidden|not authorised|not authorized|access denied/.test(searchable)) {
      return {
        ...fallback,
        message: "You don't have access to do this.",
        nextStep: "Ask an authorised manager if this action is required.",
        status: "blocked",
        technicalCode: outcome.code,
        title: "Access needed",
      };
    }

    if (/stale|changed before|refresh and retry|already claimed|not available/.test(searchable)) {
      return {
        ...fallback,
        message: "Someone else changed this record while you were working.",
        nextStep: "Refresh, check the latest details, and try again.",
        status: "warning",
        technicalCode: outcome.code,
        title: "Changed elsewhere",
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
    message: "Delivery could not be confirmed, so no message was recorded as sent.",
    nextStep: "Use the communication action in Booking Details, where delivery is confirmed by the existing provider pathway.",
    status: "blocked",
    technicalCode: "AUTHORITATIVE_DELIVERY_UNAVAILABLE",
    title: "Communication wasn't sent",
  };
}
