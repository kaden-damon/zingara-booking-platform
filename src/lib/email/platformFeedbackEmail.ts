import { createBrandedCustomerEmail } from "./customerEmail";
import {
  platformFeedbackCta,
  platformFeedbackHeading,
  platformFeedbackMessage,
  platformFeedbackSubject,
  type PlatformFeedbackEmailTemplate,
} from "../platformFeedback";

export async function createPlatformFeedbackEmail(input: {
  feedbackUrl: string;
  firstName?: string | null;
  template?: PlatformFeedbackEmailTemplate;
}) {
  const subject = input.template?.subject ?? platformFeedbackSubject;
  const heading = input.template?.heading ?? platformFeedbackHeading;
  const cta = input.template?.cta ?? platformFeedbackCta;
  const message = platformFeedbackMessage(input.firstName, input.feedbackUrl, input.template?.body);
  return {
    ...(await createBrandedCustomerEmail({
      ctaLabel: cta,
      ctaUrl: input.feedbackUrl,
      heading,
      hidePrimaryUrlInHtml: true,
      includeAgePolicy: false,
      includeSecurityNotice: false,
      message,
      subject,
    })),
    subject,
  };
}
