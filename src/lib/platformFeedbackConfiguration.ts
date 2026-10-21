import type { SupabaseClient } from "@supabase/supabase-js";
import {
  defaultPlatformFeedbackEmailTemplate,
  platformFeedbackCampaignKey,
  type PlatformFeedbackEmailTemplate,
} from "./platformFeedback";

export type PlatformFeedbackCampaignConfiguration = {
  automationEnabled: boolean;
  id: string;
  status: string;
  template: PlatformFeedbackEmailTemplate;
  updatedAt: string;
};

export async function loadPlatformFeedbackCampaignConfiguration(
  client: SupabaseClient,
): Promise<PlatformFeedbackCampaignConfiguration> {
  const { data, error } = await client
    .from("platform_feedback_campaigns")
    .select("id,status,automation_enabled,email_subject,email_heading,email_body,email_cta,updated_at")
    .eq("campaign_key", platformFeedbackCampaignKey)
    .single();
  if (error) throw error;
  return {
    automationEnabled: data.automation_enabled === true,
    id: data.id,
    status: data.status,
    template: {
      body: data.email_body || defaultPlatformFeedbackEmailTemplate.body,
      cta: data.email_cta || defaultPlatformFeedbackEmailTemplate.cta,
      heading: data.email_heading || defaultPlatformFeedbackEmailTemplate.heading,
      subject: data.email_subject || defaultPlatformFeedbackEmailTemplate.subject,
    },
    updatedAt: data.updated_at,
  };
}
