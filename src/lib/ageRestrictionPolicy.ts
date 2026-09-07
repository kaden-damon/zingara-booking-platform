export const ageRestrictionPolicy = {
  acknowledgement:
    "I acknowledge that no children under 13 will be admitted and guests aged 13–18 require parental guidance.",
  explanation:
    "The Royal Countess is an adult-oriented dinner show and may include strong language, sexual innuendo and mature themes. To ensure the experience is appropriate and comfortable for all guests, children under 13 cannot be admitted, including when accompanied by an adult. Guests aged 13–18 should attend with parental guidance.",
  explanationHeading: "Why is there an age restriction?",
  label: "Age Restriction",
  policy:
    "No children under 13 will be admitted. Guests aged 13–18 require parental guidance.",
  version: "royal-countess-age-policy-2026-09-07",
} as const;

export type AgePolicyAcknowledgement = {
  acknowledged: true;
  acknowledgedAt: string;
  policyVersion: typeof ageRestrictionPolicy.version;
};

export function createAgePolicyAcknowledgement(
  acknowledgedAt = new Date().toISOString(),
): AgePolicyAcknowledgement {
  return {
    acknowledged: true,
    acknowledgedAt,
    policyVersion: ageRestrictionPolicy.version,
  };
}

export function hasValidAgePolicyAcknowledgement(
  value: unknown,
): value is AgePolicyAcknowledgement {
  if (!value || typeof value !== "object") return false;

  const candidate = value as Partial<AgePolicyAcknowledgement>;

  return (
    candidate.acknowledged === true &&
    candidate.policyVersion === ageRestrictionPolicy.version &&
    typeof candidate.acknowledgedAt === "string" &&
    Number.isFinite(Date.parse(candidate.acknowledgedAt))
  );
}
