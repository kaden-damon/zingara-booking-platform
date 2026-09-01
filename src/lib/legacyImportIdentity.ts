function normalizeIdentity(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFKC")
    .toLocaleLowerCase("en-ZA")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function emailLocalPart(value: string | null | undefined) {
  const normalized = (value ?? "").trim().toLocaleLowerCase("en-ZA");
  const separator = normalized.indexOf("@");

  if (separator <= 0) {
    return "";
  }

  return normalized.slice(0, separator).replace(/[._+-]+/g, " ");
}

export function getLegacyImportCustomerIdentityCandidates(input: {
  email?: string | null;
  firstName?: string | null;
  metadataName?: string | null;
  surname?: string | null;
}) {
  const candidates = new Set<string>();
  const surname = input.surname?.trim() ?? "";

  for (const value of [
    input.metadataName,
    [input.firstName, surname].filter(Boolean).join(" "),
  ]) {
    const normalized = normalizeIdentity(value);

    if (normalized) {
      candidates.add(normalized);
    }
  }

  for (const value of [input.firstName, input.email]) {
    const localPart = emailLocalPart(value);
    const normalized = normalizeIdentity(
      [localPart, surname].filter(Boolean).join(" "),
    );

    if (normalized) {
      candidates.add(normalized);
    }
  }

  return [...candidates];
}
