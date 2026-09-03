import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createBrandedCustomerEmail,
  type BrandedCustomerEmail,
} from "@/lib/email/customerEmail";
import {
  insertCommunicationPayload,
  type EmailCommunicationPayload,
} from "@/lib/email/communicationIdempotency";
import {
  sendOperationalCustomerEmail,
  sendZingaraEmail,
} from "@/lib/email/smtp";
import type {
  CommunicationRecord,
  CorporateRequest,
  DemoVenueSettings,
} from "@/lib/zingaraDemo";
import {
  createCorporateEnquiryNotificationMessage,
  getCorporateEnquiryRecipient,
} from "@/lib/corporateEnquiryRouting";

async function findExistingCustomerId(
  supabase: SupabaseClient,
  request: CorporateRequest,
) {
  const email = request.email?.trim().toLowerCase();
  const mobile = request.contactNumber?.trim();

  for (const [column, value] of [
    ["email", email],
    ["mobile", mobile],
  ] as const) {
    if (!value) continue;

    const { data, error } = await supabase
      .from("customers")
      .select("id")
      .eq(column, value)
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    if (data?.id) return data.id as string;
  }

  return null;
}

async function hasMatchingCommunication(
  supabase: SupabaseClient,
  payload: EmailCommunicationPayload,
) {
  let query = supabase
    .from("communications")
    .select("id")
    .eq("channel", payload.channel)
    .eq("type", payload.type)
    .eq("message", payload.message)
    .limit(1);

  query = payload.customer_id
    ? query.eq("customer_id", payload.customer_id)
    : query.is("customer_id", null);

  const { data, error } = await query.maybeSingle();

  if (error) throw error;
  return Boolean(data?.id);
}

async function sendAndLog(
  supabase: SupabaseClient,
  input: {
    branded: BrandedCustomerEmail;
    customerId: string | null;
    message: string;
    recipient: string | null | undefined;
    sentAt: string;
    subject: string;
    type: "corporate_tentative_booking" | "custom_message";
  },
) {
  const payload: EmailCommunicationPayload = {
    booking_id: null,
    channel: "email",
    customer_id: input.customerId,
    message: input.message,
    sent_at: input.sentAt,
    show_id: null,
    status: "sent",
    subject: input.subject,
    type: input.type,
  };

  if (await hasMatchingCommunication(supabase, payload)) return;

  const result = input.customerId
    ? await sendOperationalCustomerEmail({
        attachments: input.branded.attachments,
        customerId: input.customerId,
        html: input.branded.html,
        kind: "booking_update",
        message: input.message,
        subject: input.subject,
        to: input.recipient,
      })
    : await sendZingaraEmail({
        attachments: input.branded.attachments,
        html: input.branded.html,
        message: input.message,
        subject: input.subject,
        to: input.recipient,
      });

  await insertCommunicationPayload(supabase, {
    ...payload,
    status: result.ok ? "sent" : result.suppressed ? "suppressed" : "failed",
  });
}

export async function sendCorporateEnquiryEmails(
  supabase: SupabaseClient,
  request: CorporateRequest,
  settings: DemoVenueSettings,
) {
  const recipient = getCorporateEnquiryRecipient(request, settings);

  if (!recipient) {
    throw new Error("Corporate enquiry venue is not authoritative.");
  }

  const location = request.locationAcknowledgement?.trim() ?? "Corporate";
  const internalSubject = `New ${location} Corporate enquiry · ${request.id}`;
  const internalMessage = createCorporateEnquiryNotificationMessage(request);
  const internalBranded = await createBrandedCustomerEmail({
    heading: `New ${location} Corporate Enquiry`,
    message: internalMessage,
    subject: internalSubject,
  });

  await sendAndLog(supabase, {
    branded: internalBranded,
    customerId: null,
    message: internalMessage,
    recipient,
    sentAt: request.createdAt,
    subject: internalSubject,
    type: "custom_message",
  });

  const acknowledgement = (request.communicationHistory ?? []).find(
    (record): record is CommunicationRecord =>
      record.channel === "email" &&
      record.trigger === "corporate-tentative-booking",
  );

  if (!acknowledgement) return;

  const customerId = await findExistingCustomerId(supabase, request);
  const acknowledgementSubject =
    acknowledgement.subject ?? "Your Zingara corporate booking enquiry";
  const acknowledgementBranded = await createBrandedCustomerEmail({
    heading: acknowledgementSubject,
    message: acknowledgement.message,
    subject: acknowledgementSubject,
  });

  await sendAndLog(supabase, {
    branded: acknowledgementBranded,
    customerId,
    message: acknowledgement.message,
    recipient: request.email,
    sentAt: acknowledgement.sentAt,
    subject: acknowledgementSubject,
    type: "corporate_tentative_booking",
  });
}
