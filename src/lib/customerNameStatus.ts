export type CustomerNameStatusReason =
  | "complete"
  | "initial_surname"
  | "missing_surname"
  | "placeholder"
  | "malformed";

export type CustomerNameStatus = {
  isComplete: boolean;
  reasons: CustomerNameStatusReason[];
};

export type CustomerNameParts = {
  firstName: string;
  lastName: string;
  isInferredLastName: boolean;
};

const initialSurnamePattern = /^[A-Za-z]\.?$/;
const placeholderNamePattern =
  /^(supabase guest|unknown guest|guest|test guest|unknown|n\/?a|na|none)$/i;

function normalizeWhitespace(value: string | null | undefined) {
  return (value ?? "").trim().replace(/\s+/g, " ");
}

export function getCustomerDisplayName(input: {
  firstName?: string | null;
  lastName?: string | null;
}) {
  return [input.firstName, input.lastName]
    .map(normalizeWhitespace)
    .filter(Boolean)
    .join(" ")
    .trim();
}

export function deriveCustomerNameParts(input: {
  firstName?: string | null;
  lastName?: string | null;
}): CustomerNameParts {
  const firstName = normalizeWhitespace(input.firstName);
  const lastName = normalizeWhitespace(input.lastName);

  if (lastName) {
    return {
      firstName,
      lastName,
      isInferredLastName: false,
    };
  }

  const parts = firstName.split(/\s+/).filter(Boolean);

  if (parts.length <= 1) {
    return {
      firstName,
      lastName: "",
      isInferredLastName: false,
    };
  }

  return {
    firstName: parts.slice(0, -1).join(" "),
    lastName: parts.at(-1) ?? "",
    isInferredLastName: true,
  };
}

export function classifyCustomerName(input: {
  displayName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
}): CustomerNameStatus {
  const { firstName, lastName } = deriveCustomerNameParts(input);
  const displayName =
    normalizeWhitespace(input.displayName) ||
    getCustomerDisplayName({ firstName, lastName });
  const reasons = new Set<CustomerNameStatusReason>();

  if (!lastName) {
    reasons.add("missing_surname");
  } else if (initialSurnamePattern.test(lastName)) {
    reasons.add("initial_surname");
  }

  if (displayName && placeholderNamePattern.test(displayName)) {
    reasons.add("placeholder");
  }

  if (displayName && !/[A-Za-z]/.test(displayName)) {
    reasons.add("malformed");
  }

  const displayParts = displayName.split(/\s+/).filter(Boolean);
  const lastDisplayPart = displayParts.at(-1) ?? "";

  if (
    displayParts.length > 1 &&
    initialSurnamePattern.test(lastDisplayPart)
  ) {
    reasons.add("initial_surname");
  }

  if (reasons.size === 0) {
    return {
      isComplete: true,
      reasons: ["complete"],
    };
  }

  return {
    isComplete: false,
    reasons: [...reasons],
  };
}

export function getCustomerNameStatusLabel(status: CustomerNameStatus) {
  if (status.isComplete) {
    return "Complete";
  }

  const labelByReason: Record<CustomerNameStatusReason, string> = {
    complete: "Complete",
    initial_surname: "Initial surname",
    malformed: "Malformed name",
    missing_surname: "Missing surname",
    placeholder: "Placeholder name",
  };

  return status.reasons.map((reason) => labelByReason[reason]).join(", ");
}
