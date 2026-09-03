export type ComplimentarySubmissionInput = {
  customerDetailsComplete: boolean;
  hasAcceptedTerms: boolean;
  hasAvailableCapacity: boolean;
  hasSelectedShow: boolean;
  hasSelectedZone: boolean;
  isBookingSubmitting: boolean;
  isShowLockReady: boolean;
  isTrustedStaff: boolean;
};

export type ComplimentarySubmissionEligibility = {
  allowed: boolean;
  reason: string;
};

export function getComplimentarySubmissionEligibility(
  input: ComplimentarySubmissionInput,
): ComplimentarySubmissionEligibility {
  if (!input.isTrustedStaff) {
    return {
      allowed: false,
      reason: "An authorised staff session is required.",
    };
  }

  if (!input.hasSelectedShow) {
    return { allowed: false, reason: "Select a valid show to continue." };
  }

  if (!input.isShowLockReady) {
    return {
      allowed: false,
      reason: "The show booking lock must be ready before creating this booking.",
    };
  }

  if (!input.hasSelectedZone) {
    return { allowed: false, reason: "Select a seating zone to continue." };
  }

  if (!input.hasAvailableCapacity) {
    return {
      allowed: false,
      reason: "This seating zone no longer has capacity for the selected guests.",
    };
  }

  if (!input.customerDetailsComplete) {
    return {
      allowed: false,
      reason: "Complete the required customer details to continue.",
    };
  }

  if (!input.hasAcceptedTerms) {
    return {
      allowed: false,
      reason: "Agree to the Royal Decrees before creating the booking.",
    };
  }

  if (input.isBookingSubmitting) {
    return { allowed: false, reason: "The booking is already being created." };
  }

  return { allowed: true, reason: "" };
}
