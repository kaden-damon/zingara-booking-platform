import type { SupabaseClient } from "@supabase/supabase-js";
import {
  containsHtmlMarkup,
  htmlToPlainText,
  sanitizeEmailHtml,
} from "@/lib/email/html";
import { createBrandedCustomerEmail } from "@/lib/email/customerEmail";
import {
  getZingaraEmailSender,
  sendOperationalCustomerEmail,
  type EmailAttachment,
} from "@/lib/email/smtp";
import {
  claimOneTimeEmailCommunication,
  completeClaimedEmailCommunication,
  findDuplicateSentCommunication,
  insertCommunicationPayload,
  type EmailCommunicationPayload,
} from "@/lib/email/communicationIdempotency";
import {
  getOrCreateVerifiedReviewLink,
  getReviewApplicationOrigin,
} from "@/lib/reviews/reviewServer";
import { getReviewPreviewUrl } from "@/lib/reviews/reviews";
import { normalizeGuestCountGrammar } from "@/lib/guestCountPresentation";

export type AutomatedWorkflowKey = "pre_show_reminder" | "post_show_review";

export type AutomatedWorkflowConfiguration = {
  activatedAt: string | null;
  body: string;
  capeTownReviewUrl: string;
  enabled: boolean;
  id: string | null;
  johannesburgReviewUrl: string;
  subject: string;
  timingOffsetDays: number;
  updatedAt: string | null;
  updatedBy: string | null;
  workflowKey: AutomatedWorkflowKey;
};

export type WorkflowSummary = {
  alreadySent: number;
  attempted: number;
  deduplicated: number;
  eligible: number;
  excluded: number;
  failed: number;
  reasons: Record<string, number>;
  recipientCount: number;
  recipients: string[];
  scanned: number;
  sent: number;
  skipped: number;
  suppressed: number;
  workflowKey: AutomatedWorkflowKey;
};

export type WorkflowRunResult = {
  emailDispatch: "disabled" | "dry-run" | "sent";
  generatedAt: string;
  mode: "dry-run" | "send";
  results: Record<AutomatedWorkflowKey, WorkflowSummary>;
  timezone: "Africa/Johannesburg";
};

type WorkflowConfigRow = {
  activated_at: string | null;
  body: string;
  cape_town_review_url: string | null;
  enabled: boolean;
  id: string;
  johannesburg_review_url: string | null;
  subject: string;
  timing_offset_days: number;
  updated_at: string | null;
  updated_by: string | null;
  workflow_key: AutomatedWorkflowKey;
};

export type WorkflowBookingTemplateContext = {
  amount_paid: number;
  archived_at: string | null;
  balance_outstanding: number;
  booking_reference: string;
  booking_status: string;
  customer_id: string | null;
  guest_count: number;
  id: string;
  payment_status: string;
  section: string | null;
  show_id: string;
  table_id: string | null;
  total_amount: number;
};

type CommunicationRow = {
  booking_id: string | null;
  status: string;
  type: string;
};

type CustomerRow = {
  email: string | null;
  first_name: string | null;
  id: string;
  surname: string | null;
};

export type WorkflowShowTemplateContext = {
  date: string;
  id: string;
  name: string;
  status: string;
  time: string;
  venue: string;
};

type BookingRow = WorkflowBookingTemplateContext;
type ShowRow = WorkflowShowTemplateContext;

type EligibleWorkflowBooking = {
  attachments?: EmailAttachment[];
  booking: BookingRow;
  configuration: AutomatedWorkflowConfiguration;
  customer: CustomerRow;
  html?: string;
  message: string;
  recipient: string;
  redactedRecipient: string;
  show: ShowRow;
  subject: string;
  workflowKey: AutomatedWorkflowKey;
};

export const workflowTimezone = "Africa/Johannesburg" as const;
export const controlledWorkflowRecipient = "kaden@kaden.co.za";
export const workflowDatasetPageSize = 1000;

export async function collectWorkflowRows<T>(
  fetchPage: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: { message?: string } | null }>,
  pageSize = workflowDatasetPageSize,
) {
  const rows: T[] = [];

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await fetchPage(from, from + pageSize - 1);

    if (error) {
      throw new Error(error.message ?? "Workflow dataset could not be loaded.");
    }

    const page = data ?? [];
    rows.push(...page);

    if (page.length < pageSize) return rows;
  }
}

export const defaultWorkflowConfigurations: AutomatedWorkflowConfiguration[] = [
  {
    activatedAt: null,
    body: `Dear {{customerName}},

The curtain is almost ready to rise — your Zingara experience is just around the corner.

We look forward to welcoming you to {{showName}} on {{showDate}} at {{showTime}}.

Your booking details

Booking reference: {{bookingRef}}
Location: {{location}}
Guests: {{guest_count}}
Seating zone: {{seatingZone}}

Everything you need for the evening is available on your digital ticket:

{{ticketUrl}}

Please note:

Beverages are charged separately.

A 12.5% gratuity will be applied to beverages and the dinner portion of your tickets for bookings of 6 or more.

We can't wait to welcome you into the world of Zingara.

The Zingara Team`,
    capeTownReviewUrl: "",
    enabled: false,
    id: null,
    johannesburgReviewUrl: "",
    subject: "Your Zingara experience is almost here ✨",
    timingOffsetDays: 7,
    updatedAt: null,
    updatedBy: null,
    workflowKey: "pre_show_reminder",
  },
  {
    activatedAt: null,
    body: `Dear {{customerName}},

Thank you for joining us for {{showName}}.

We hope your evening with Zingara was filled with a little magic, a little mischief, and plenty to remember.

We'd love to hear about your experience. Your feedback means a great deal to our team and helps us continue creating unforgettable evenings for our guests.

Rate your Zingara experience:

{{reviewUrl}}

Thank you for being part of the Zingara experience. We hope to welcome you back again soon.

The Zingara Team`,
    capeTownReviewUrl: "",
    enabled: false,
    id: null,
    johannesburgReviewUrl: "",
    subject: "Rate your Zingara experience",
    timingOffsetDays: 1,
    updatedAt: null,
    updatedBy: null,
    workflowKey: "post_show_review",
  },
];

function toConfiguration(row: WorkflowConfigRow): AutomatedWorkflowConfiguration {
  return {
    activatedAt: row.activated_at,
    body: row.body,
    capeTownReviewUrl: row.cape_town_review_url ?? "",
    enabled: row.enabled,
    id: row.id,
    johannesburgReviewUrl: row.johannesburg_review_url ?? "",
    subject: row.subject,
    timingOffsetDays: row.timing_offset_days,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
    workflowKey: row.workflow_key,
  };
}

function toPayload(
  config: AutomatedWorkflowConfiguration,
  updatedBy?: string | null,
) {
  return {
    activated_at: config.activatedAt,
    body: config.body.trim(),
    cape_town_review_url: config.capeTownReviewUrl.trim() || null,
    enabled: config.enabled,
    johannesburg_review_url: config.johannesburgReviewUrl.trim() || null,
    subject: config.subject.trim(),
    timing_offset_days: config.timingOffsetDays,
    updated_at: new Date().toISOString(),
    updated_by: updatedBy ?? null,
    workflow_key: config.workflowKey,
  };
}

export function getWorkflowCommunicationType(key: AutomatedWorkflowKey) {
  return key === "pre_show_reminder" ? "show_reminder" : "post_show_review";
}

export function mergeWorkflowConfigurations(
  rows: WorkflowConfigRow[] | null | undefined,
) {
  const byKey = new Map((rows ?? []).map((row) => [row.workflow_key, row]));

  return defaultWorkflowConfigurations.map((defaultConfig) => {
    const row = byKey.get(defaultConfig.workflowKey);

    return row ? toConfiguration(row) : defaultConfig;
  });
}

export async function loadWorkflowConfigurations(
  supabase: SupabaseClient,
) {
  const { data, error } = await supabase
    .from("workflow_configurations")
    .select(
      "id,workflow_key,enabled,timing_offset_days,activated_at,subject,body,cape_town_review_url,johannesburg_review_url,updated_at,updated_by",
    )
    .order("workflow_key", { ascending: true });

  if (error) {
    throw error;
  }

  return mergeWorkflowConfigurations((data ?? []) as WorkflowConfigRow[]);
}

export async function saveWorkflowConfigurations(
  supabase: SupabaseClient,
  configurations: AutomatedWorkflowConfiguration[],
  updatedBy?: string | null,
) {
  const payload = configurations.map((config) => toPayload(config, updatedBy));
  const { data, error } = await supabase
    .from("workflow_configurations")
    .upsert(payload, { onConflict: "workflow_key" })
    .select(
      "id,workflow_key,enabled,timing_offset_days,activated_at,subject,body,cape_town_review_url,johannesburg_review_url,updated_at,updated_by",
    );

  if (error) {
    throw error;
  }

  return mergeWorkflowConfigurations((data ?? []) as WorkflowConfigRow[]);
}

function increment(reasons: Record<string, number>, reason: string) {
  reasons[reason] = (reasons[reason] ?? 0) + 1;
}

function redactEmail(email: string) {
  const [localPart, domain = ""] = email.split("@");
  const visible = localPart.slice(0, 2);

  return `${visible}${"*".repeat(Math.max(localPart.length - 2, 3))}@${domain}`;
}

function getShowDateTime(show: ShowRow) {
  const date = show.date;
  const time = show.time.length >= 5 ? show.time.slice(0, 5) : "00:00";
  return new Date(`${date}T${time}:00+02:00`);
}

function differenceInDays(left: Date, right: Date) {
  return Math.floor((left.getTime() - right.getTime()) / 86_400_000);
}

function formatDate(show: ShowRow) {
  return new Intl.DateTimeFormat("en-ZA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: workflowTimezone,
    year: "numeric",
  }).format(getShowDateTime(show));
}

function formatTime(show: ShowRow) {
  return show.time.slice(0, 5);
}

function getLocationLabel(show: ShowRow) {
  return show.venue === "johannesburg"
    ? "Johannesburg — The Spring Court"
    : "Cape Town — The Night Court";
}

function hasSuccessfulCommunication(
  booking: BookingRow,
  communications: CommunicationRow[],
  type: string,
) {
  return communications.some(
    (communication) =>
      communication.booking_id === booking.id &&
      communication.type === type &&
      communication.status === "sent",
  );
}

function getRecipient(
  booking: BookingRow,
  customers: Map<string, CustomerRow>,
) {
  return booking.customer_id
    ? customers.get(booking.customer_id)?.email?.trim().toLowerCase() ?? ""
    : "";
}

function getCustomerName(customer: CustomerRow) {
  return [customer.first_name, customer.surname].filter(Boolean).join(" ").trim();
}

function isBookingOperationallyExcluded(booking: BookingRow) {
  if (/^(qa|test|demo)[-_]/i.test(booking.booking_reference.trim())) {
    return "synthetic_booking";
  }

  if (booking.archived_at) {
    return "archived";
  }

  if (
    ["cancelled", "refunded", "waitlisted", "no_show"].includes(
      booking.booking_status,
    )
  ) {
    return booking.booking_status;
  }

  if (["cancelled", "refunded"].includes(booking.payment_status)) {
    return booking.payment_status;
  }

  return null;
}

export function isReviewPerformanceAfterActivation(
  performance: Date,
  activatedAt: Date,
) {
  return performance >= activatedAt;
}

function renderWorkflowTemplate(
  template: string,
  booking: BookingRow,
  customer: CustomerRow,
  show: ShowRow,
  extras: Record<string, string | number> = {},
) {
  const variables: Record<string, string | number> = {
    bookingRef: booking.booking_reference,
    customerName: getCustomerName(customer),
    date: formatDate(show),
    guest_count: booking.guest_count,
    guest_name: getCustomerName(customer),
    location: getLocationLabel(show),
    partySize: booking.guest_count,
    reviewUrl: extras.reviewUrl ?? "",
    seatingZone: booking.section ?? "Not recorded",
    section: booking.section ?? "Not recorded",
    showDate: formatDate(show),
    showName: show.name,
    showTime: formatTime(show),
    ticketUrl: `/ticket/${encodeURIComponent(booking.booking_reference)}`,
    time: formatTime(show),
    ...extras,
  };

  return normalizeGuestCountGrammar(
    template.replaceAll(
      /\{\{\s*([\w]+)\s*\}\}/g,
      (match, variableName: string) =>
        variables[variableName] === undefined
          ? match
          : String(variables[variableName]),
    ),
    booking.guest_count,
  );
}

function renderWorkflowEmailContent(
  template: string,
  booking: BookingRow,
  customer: CustomerRow,
  show: ShowRow,
  extras: Record<string, string | number> = {},
) {
  const rendered = renderWorkflowTemplate(template, booking, customer, show, extras);

  if (!containsHtmlMarkup(rendered)) {
    return { html: undefined, message: rendered };
  }

  const html = sanitizeEmailHtml(rendered);

  return {
    html,
    message: htmlToPlainText(html),
  };
}

export async function renderConfiguredWorkflowEmail(input: {
  booking: WorkflowBookingTemplateContext;
  configuration: AutomatedWorkflowConfiguration;
  recipientName: string;
  reviewUrl?: string;
  show: WorkflowShowTemplateContext;
}) {
  const customer: CustomerRow = {
    email: null,
    first_name: null,
    id: input.booking.customer_id ?? "workflow-preview",
    surname: null,
  };
  const extras: Record<string, string> = {
    customerName: input.recipientName,
  };

  if (input.configuration.workflowKey === "post_show_review") {
    extras.reviewUrl = input.reviewUrl ?? "";
  }

  const content = renderWorkflowEmailContent(
    input.configuration.body,
    input.booking,
    customer,
    input.show,
    extras,
  );
  const subject = renderWorkflowTemplate(
    input.configuration.subject,
    input.booking,
    customer,
    input.show,
    extras,
  );
  const isReview = input.configuration.workflowKey === "post_show_review";
  const branded = await createBrandedCustomerEmail({
    ctaLabel: isReview ? "RATE YOUR EXPERIENCE" : undefined,
    ctaUrl: isReview ? input.reviewUrl : undefined,
    heading: subject,
    hidePrimaryUrlInHtml: isReview,
    html: content.html,
    includeAgePolicy: !isReview,
    message: content.message,
    subject,
  });

  return {
    attachments: branded.attachments,
    from: getZingaraEmailSender(isReview ? "review" : "application"),
    html: branded.html,
    message: branded.message,
    subject,
  };
}

function createSummary(workflowKey: AutomatedWorkflowKey): WorkflowSummary {
  return {
    alreadySent: 0,
    attempted: 0,
    deduplicated: 0,
    eligible: 0,
    excluded: 0,
    failed: 0,
    reasons: {},
    recipientCount: 0,
    recipients: [],
    scanned: 0,
    sent: 0,
    skipped: 0,
    suppressed: 0,
    workflowKey,
  };
}

function evaluateWorkflow(
  workflowKey: AutomatedWorkflowKey,
  bookings: BookingRow[],
  configs: Map<AutomatedWorkflowKey, AutomatedWorkflowConfiguration>,
  shows: Map<string, ShowRow>,
  customers: Map<string, CustomerRow>,
  communications: CommunicationRow[],
  reviewedBookingIds: Set<string>,
  now: Date,
) {
  const config = configs.get(workflowKey);
  const summary = createSummary(workflowKey);
  const eligible: EligibleWorkflowBooking[] = [];

  for (const booking of bookings) {
    summary.scanned += 1;
    const show = shows.get(booking.show_id);
    const sent = hasSuccessfulCommunication(
      booking,
      communications,
      getWorkflowCommunicationType(workflowKey),
    );

    if (sent) {
      summary.alreadySent += 1;
      increment(summary.reasons, "already_sent");
      continue;
    }

    if (!config?.enabled) {
      summary.excluded += 1;
      increment(summary.reasons, "workflow_disabled");
      continue;
    }

    if (!config.activatedAt) {
      summary.excluded += 1;
      increment(summary.reasons, "missing_activation_boundary");
      continue;
    }

    const operationalExclusion = isBookingOperationallyExcluded(booking);

    if (operationalExclusion) {
      summary.excluded += 1;
      increment(summary.reasons, operationalExclusion);
      continue;
    }

    if (!show) {
      summary.excluded += 1;
      increment(summary.reasons, "missing_show");
      continue;
    }

    const customer = booking.customer_id
      ? customers.get(booking.customer_id)
      : undefined;
    const recipient = customer ? getRecipient(booking, customers) : "";

    if (!customer || !recipient) {
      summary.excluded += 1;
      increment(summary.reasons, "missing_recipient_email");
      continue;
    }

    const showDateTime = getShowDateTime(show);
    const activationDate = new Date(config.activatedAt);

    if (workflowKey === "pre_show_reminder") {
      if (!["confirmed", "checked_in", "completed"].includes(booking.booking_status)) {
        summary.excluded += 1;
        increment(summary.reasons, "not_confirmed_attendance");
        continue;
      }

      if (
        !["deposit_paid", "fully_paid", "comp_vip"].includes(
          booking.payment_status,
        )
      ) {
        summary.excluded += 1;
        increment(summary.reasons, "payment_not_confirmed");
        continue;
      }

      if (showDateTime <= now) {
        summary.excluded += 1;
        increment(summary.reasons, "show_not_upcoming");
        continue;
      }

      if (differenceInDays(showDateTime, now) !== config.timingOffsetDays) {
        summary.excluded += 1;
        increment(summary.reasons, "outside_reminder_window");
        continue;
      }

      if (now < activationDate) {
        summary.excluded += 1;
        increment(summary.reasons, "before_activation_boundary");
        continue;
      }
    } else {
      if (reviewedBookingIds.has(booking.id)) {
        summary.excluded += 1;
        increment(summary.reasons, "already_reviewed");
        continue;
      }

      if (differenceInDays(now, showDateTime) !== config.timingOffsetDays) {
        summary.excluded += 1;
        increment(summary.reasons, "outside_review_window");
        continue;
      }

      if (!isReviewPerformanceAfterActivation(showDateTime, activationDate)) {
        summary.excluded += 1;
        increment(summary.reasons, "before_activation_boundary");
        continue;
      }
    }

    const extras: Record<string, string | number> =
      workflowKey === "post_show_review"
        ? { reviewUrl: getReviewPreviewUrl(getReviewApplicationOrigin()) }
        : {};

    const emailContent = renderWorkflowEmailContent(
      config.body,
      booking,
      customer,
      show,
      extras,
    );

    eligible.push({
      booking,
      configuration: config,
      customer,
      html: emailContent.html,
      message: emailContent.message,
      recipient,
      redactedRecipient: redactEmail(recipient),
      show,
      subject: renderWorkflowTemplate(
        config.subject,
        booking,
        customer,
        show,
        extras,
      ),
      workflowKey,
    });
    summary.eligible += 1;
    summary.recipientCount += 1;
    summary.recipients.push(redactEmail(recipient));
    increment(summary.reasons, "eligible");
  }

  summary.deduplicated = summary.alreadySent;
  summary.skipped = summary.excluded + summary.alreadySent;
  return { eligible, summary };
}

async function loadWorkflowDataset(supabase: SupabaseClient) {
  const [
    configurations,
    bookingRows,
    showRows,
    customerRows,
    communicationRows,
    reviewRows,
  ] = await Promise.all([
    loadWorkflowConfigurations(supabase),
    collectWorkflowRows<BookingRow>((from, to) =>
      supabase
        .from("bookings")
        .select(
          "id,customer_id,show_id,booking_reference,booking_status,payment_status,guest_count,section,total_amount,amount_paid,balance_outstanding,archived_at,table_id",
        )
        .range(from, to),
    ),
    collectWorkflowRows<ShowRow>((from, to) =>
      supabase
        .from("shows")
        .select("id,name,date,time,venue,status")
        .range(from, to),
    ),
    collectWorkflowRows<CustomerRow>((from, to) =>
      supabase
        .from("customers")
        .select("id,email,first_name,surname")
        .range(from, to),
    ),
    collectWorkflowRows<CommunicationRow>((from, to) =>
      supabase
        .from("communications")
        .select("booking_id,type,status")
        .in("type", ["show_reminder", "post_show_review"])
        .range(from, to),
    ),
    collectWorkflowRows<{ booking_id: string }>((from, to) =>
      supabase.from("guest_reviews").select("booking_id").range(from, to),
    ),
  ]);

  return {
    bookings: bookingRows,
    communications: communicationRows,
    configurations,
    customers: new Map(
      customerRows.map((customer) => [
        customer.id,
        customer,
      ]),
    ),
    reviewedBookingIds: new Set(
      (reviewRows ?? []).map((review) => review.booking_id as string),
    ),
    shows: new Map(showRows.map((show) => [show.id, show])),
  };
}

async function insertWorkflowCommunication(
  supabase: SupabaseClient,
  item: EligibleWorkflowBooking,
  status: "failed" | "sent" | "suppressed",
) {
  const payload: EmailCommunicationPayload = {
    booking_id: item.booking.id,
    channel: "email",
    customer_id: item.booking.customer_id,
    message: item.message,
    sent_at: new Date().toISOString(),
    show_id: item.booking.show_id,
    status,
    subject: item.subject,
    type: getWorkflowCommunicationType(item.workflowKey),
  };
  const duplicate = await findDuplicateSentCommunication(supabase, payload);

  if (duplicate) {
    return { deduped: true, row: duplicate };
  }

  return {
    deduped: false,
    row: await insertCommunicationPayload(supabase, payload),
  };
}

export async function runAutomatedWorkflows(
  supabase: SupabaseClient,
  options: {
    allowedRecipient?: string;
    mode?: "dry-run" | "send";
    now?: Date;
    reviewOrigin?: string;
    workflowKey?: AutomatedWorkflowKey;
  } = {},
): Promise<WorkflowRunResult> {
  const now = options.now ?? new Date();
  const mode = options.mode ?? "dry-run";
  const dataset = await loadWorkflowDataset(supabase);
  const configMap = new Map(
    dataset.configurations.map((configuration) => [
      configuration.workflowKey,
      configuration,
    ]),
  );
  const workflowKeys: AutomatedWorkflowKey[] = options.workflowKey
    ? [options.workflowKey]
    : ["post_show_review", "pre_show_reminder"];
  const results: Record<AutomatedWorkflowKey, WorkflowSummary> = {
    post_show_review: createSummary("post_show_review"),
    pre_show_reminder: createSummary("pre_show_reminder"),
  };
  const eligibleItems: EligibleWorkflowBooking[] = [];

  for (const workflowKey of workflowKeys) {
    const result = evaluateWorkflow(
      workflowKey,
      dataset.bookings,
      configMap,
      dataset.shows,
      dataset.customers,
      dataset.communications,
      dataset.reviewedBookingIds,
      now,
    );

    results[workflowKey] = result.summary;
    eligibleItems.push(...result.eligible);
  }

  if (mode === "send" && eligibleItems.length > 0) {
    const allowedRecipient = options.allowedRecipient?.trim().toLowerCase();
    const unexpectedRecipients = allowedRecipient
      ? eligibleItems.filter((item) => item.recipient !== allowedRecipient)
      : [];

    if (unexpectedRecipients.length > 0) {
      throw new Error(
        `Workflow send blocked because ${unexpectedRecipients.length} eligible recipient does not match the controlled recipient.`,
      );
    }

    for (const item of eligibleItems) {
      let deliveryItem = item;

      const duplicate = await findDuplicateSentCommunication(supabase, {
        booking_id: item.booking.id,
        channel: "email",
        customer_id: item.booking.customer_id,
        message: item.message,
        sent_at: null,
        show_id: item.booking.show_id,
        status: "sent",
        subject: item.subject,
        type: getWorkflowCommunicationType(item.workflowKey),
      });

      if (duplicate) {
        results[item.workflowKey].alreadySent += 1;
        results[item.workflowKey].deduplicated += 1;
        results[item.workflowKey].skipped += 1;
        continue;
      }

      const customerId = item.booking.customer_id;
      if (!customerId) {
        await insertWorkflowCommunication(supabase, item, "failed");
        results[item.workflowKey].failed += 1;
        continue;
      }

      const reviewClaim = item.workflowKey === "post_show_review"
        ? await claimOneTimeEmailCommunication(supabase, {
            booking_id: item.booking.id,
            channel: "email",
            customer_id: customerId,
            message: item.message,
            show_id: item.booking.show_id,
            subject: item.subject,
            type: getWorkflowCommunicationType(item.workflowKey),
          })
        : null;

      if (item.workflowKey === "post_show_review" && !reviewClaim) {
        results[item.workflowKey].deduplicated += 1;
        results[item.workflowKey].skipped += 1;
        continue;
      }

      results[item.workflowKey].attempted += 1;

      if (item.workflowKey === "post_show_review") {
        try {
          const invitation = await getOrCreateVerifiedReviewLink(
            supabase,
            item.booking.id,
            { now, origin: options.reviewOrigin },
          );
          const rendered = await renderConfiguredWorkflowEmail({
            booking: item.booking,
            configuration: item.configuration,
            recipientName: getCustomerName(item.customer),
            reviewUrl: invitation.url,
            show: item.show,
          });
          deliveryItem = {
            ...item,
            attachments: rendered.attachments,
            html: rendered.html,
            message: rendered.message,
            subject: rendered.subject,
          };
        } catch (error) {
          console.error("[Zingara Workflows] Verified review link could not be created", {
            bookingId: item.booking.id,
            message: error instanceof Error ? error.message : "Unknown error",
          });
          await completeClaimedEmailCommunication(supabase, reviewClaim!.id, {
            message: "Review request was not sent because its verified link could not be created.",
            status: "failed",
            subject: item.subject,
          });
          results[item.workflowKey].failed += 1;
          continue;
        }
      }

      const sendResult = await sendOperationalCustomerEmail({
        attachments: deliveryItem.attachments,
        ctaLabel:
          deliveryItem.workflowKey === "post_show_review"
            ? "RATE YOUR EXPERIENCE"
            : undefined,
        customerId,
        hidePrimaryUrlInHtml: deliveryItem.workflowKey === "post_show_review",
        kind:
          deliveryItem.workflowKey === "pre_show_reminder"
            ? "show_reminder"
            : "post_show_review",
        html: deliveryItem.html,
        message: deliveryItem.message,
        subject: deliveryItem.subject,
        to: deliveryItem.recipient,
      });

      const deliveryStatus = sendResult.ok
        ? "sent"
        : sendResult.suppressed
          ? "suppressed"
          : "failed";

      if (reviewClaim) {
        await completeClaimedEmailCommunication(supabase, reviewClaim.id, {
          message: deliveryItem.message,
          status: deliveryStatus,
          subject: deliveryItem.subject,
        });
      } else {
        await insertWorkflowCommunication(supabase, deliveryItem, deliveryStatus);
      }

      if (sendResult.ok) {
        results[item.workflowKey].sent += 1;
      } else if (sendResult.suppressed) {
        results[item.workflowKey].suppressed += 1;
      } else {
        results[item.workflowKey].failed += 1;
      }
    }
  }

  return {
    emailDispatch:
      mode === "send" && eligibleItems.length > 0 ? "sent" : "dry-run",
    generatedAt: now.toISOString(),
    mode,
    results,
    timezone: workflowTimezone,
  };
}

export async function runAutomatedWorkflowDryRun(
  supabase: SupabaseClient,
  now = new Date(),
): Promise<WorkflowRunResult> {
  return runAutomatedWorkflows(supabase, { mode: "dry-run", now });
}

export function isHttpsUrl(value: string) {
  if (!value.trim()) {
    return true;
  }

  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}
