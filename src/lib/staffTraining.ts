import type { AdminRole } from "@/lib/zingaraAccess";

export const trainingPageSize = 10;

export const trainingStatusLabels = {
  awaiting_confirmation: "Awaiting Confirmation",
  confirmed_understanding: "Confirmed Understanding",
  further_training_required: "Further Training Required",
  proficiency_verified: "Proficiency Verified",
} as const;

export type TrainingStatus = keyof typeof trainingStatusLabels;

export function canManageStaffTraining(role: AdminRole) {
  return ["super-admin", "venue-manager", "box-office-manager"].includes(role);
}

export function getTrainingStatus(input: {
  choice: "further_training" | "understood" | null;
  demonstratedIndependently: boolean;
}): TrainingStatus {
  if (input.choice === "further_training") return "further_training_required";
  if (input.choice === "understood" && input.demonstratedIndependently) {
    return "proficiency_verified";
  }
  if (input.choice === "understood") return "confirmed_understanding";
  return "awaiting_confirmation";
}

export function normalizeCompetencies(values: unknown) {
  if (!Array.isArray(values)) return [];
  return Array.from(
    new Set(
      values
        .map((value) => String(value).trim())
        .filter((value) => value.length > 0 && value.length <= 120),
    ),
  ).slice(0, 30);
}

export function trainingRecordReference(id: string) {
  return `TRAINING-${id.slice(0, 8).toUpperCase()}`;
}
