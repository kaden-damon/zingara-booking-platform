import type { SupabaseClient } from "@supabase/supabase-js";
import { createBrandedCustomerEmail } from "@/lib/email/customerEmail";
import {
  claimStaffEmailDelivery,
  completeStaffEmailDelivery,
} from "@/lib/email/staffEmailNotifications";
import { sendZingaraEmail } from "@/lib/email/smtp";

type TrainingEmailInput = {
  acknowledgementLabel: string;
  acknowledgementTimestamp: string;
  competencies: string[];
  demonstratedIndependently: boolean;
  durationMinutes: number;
  recordId: string;
  staffEmail: string;
  staffName: string;
  title: string;
  trainerName: string;
  trainingDate: string;
  trainingTime: string;
};

export async function sendTrainingAcknowledgementEmail(
  client: SupabaseClient,
  input: TrainingEmailInput,
) {
  const { data: ccProfiles, error } = await client
    .from("staff_profiles")
    .select("id,full_name,email")
    .eq("active", true)
    .or("full_name.ilike.Tracy Maltman,full_name.ilike.Kaden Damon");
  if (error) throw error;

  const cc = (ccProfiles ?? []).filter((profile) =>
    ["tracy maltman", "kaden damon"].includes(profile.full_name.trim().toLowerCase()),
  );
  const staffProfile = await client
    .from("staff_profiles")
    .select("id")
    .eq("email", input.staffEmail)
    .maybeSingle();
  if (staffProfile.error || !staffProfile.data) {
    throw staffProfile.error ?? new Error("Trained staff profile could not be resolved.");
  }

  const deliveryId = await claimStaffEmailDelivery(client, {
    ccStaffProfileIds: cc.map((profile) => profile.id),
    eventKey: input.recordId,
    notificationKey: "training-acknowledgement",
    toStaffProfileIds: [staffProfile.data.id],
  });
  if (!deliveryId) return { duplicate: true, ok: true } as const;

  const subject = `Zingara | Training Confirmation — ${input.title}`;
  const message = [
    `Hello ${input.staffName.split(" ")[0] || input.staffName},`,
    "",
    `Your Zingara training acknowledgement has been recorded for: ${input.title}.`,
    `Trainer: ${input.trainerName}`,
    `Date and time: ${input.trainingDate} at ${input.trainingTime.slice(0, 5)}`,
    `Duration: ${input.durationMinutes} minutes`,
    `Competencies: ${input.competencies.length ? input.competencies.join("; ") : "No additional competencies listed"}`,
    `Your response: ${input.acknowledgementLabel}`,
    `Trainer assessment: ${input.demonstratedIndependently ? "Demonstrated independently" : "Independent proficiency not yet recorded"}`,
    `Confirmed at: ${new Date(input.acknowledgementTimestamp).toLocaleString("en-ZA", { timeZone: "Africa/Johannesburg" })} SAST`,
    "",
    "This is your confirmation record. No reply is required.",
  ].join("\n");
  const branded = await createBrandedCustomerEmail({
    heading: "Training Confirmation",
    includeAgePolicy: false,
    includePrimaryCta: false,
    message,
    subject,
  });
  const result = await sendZingaraEmail({
    attachments: branded.attachments,
    cc: cc.map((profile) => profile.email),
    html: branded.html,
    message: branded.message,
    subject,
    to: input.staffEmail,
  });
  await completeStaffEmailDelivery(client, deliveryId, {
    error: result.ok ? undefined : result.error,
    status: result.ok ? "sent" : "failed",
  });
  return result;
}
