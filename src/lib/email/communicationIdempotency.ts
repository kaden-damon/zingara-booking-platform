import type { SupabaseClient } from "@supabase/supabase-js";

export type EmailCommunicationPayload = {
  batch_id?: string | null;
  booking_id: string | null;
  channel: string;
  customer_id: string | null;
  message: string;
  sent_at: string | null;
  show_id: string | null;
  status: "failed" | "sent" | "suppressed";
  subject: string | null;
  type: string;
};

export type CommunicationRow = {
  batch_id: string | null;
  booking_id: string | null;
  channel: string;
  created_at: string;
  customer_id: string | null;
  id: string;
  message: string;
  sent_at: string | null;
  show_id: string | null;
  status: string;
  subject: string | null;
  type: string;
};

const communicationSelect =
  "id,customer_id,booking_id,show_id,batch_id,type,channel,subject,message,status,sent_at,created_at";

const oneTimeCommunicationTypes = new Set([
  "booking_confirmation",
  "complimentary_booking",
  "corporate_tentative_booking",
  "payment_confirmation",
  "post_show_review",
  "refund_notice",
  "reservation_confirmed",
  "reservation_pending",
  "show_reminder",
]);

function isMeaningful(value: string | null | undefined) {
  return Boolean(value?.trim());
}

function sameNullableValue(left: string | null, right: string | null) {
  return (left ?? null) === (right ?? null);
}

function applyNullableFilter<
  Query extends {
    eq: (column: string, value: string) => Query;
    is: (column: string, value: null) => Query;
  },
>(query: Query, column: string, value: string | null) {
  return value ? query.eq(column, value) : query.is(column, null);
}

function isRecentReplay(
  row: CommunicationRow,
  replayWindowMs: number,
  now = Date.now(),
) {
  const rowTime = new Date(row.sent_at ?? row.created_at).getTime();

  return Number.isFinite(rowTime) && now - rowTime <= replayWindowMs;
}

function isDuplicateCommunication(
  row: CommunicationRow,
  payload: EmailCommunicationPayload,
  replayWindowMs: number,
) {
  if (
    !sameNullableValue(row.booking_id, payload.booking_id) ||
    row.channel !== payload.channel ||
    !sameNullableValue(row.customer_id, payload.customer_id) ||
    (row.status !== "sent" &&
      !(oneTimeCommunicationTypes.has(payload.type) && row.status === "suppressed")) ||
    row.type !== payload.type
  ) {
    return false;
  }

  if (oneTimeCommunicationTypes.has(payload.type)) {
    return true;
  }

  if (
    row.message !== payload.message ||
    !sameNullableValue(row.subject, payload.subject)
  ) {
    return false;
  }

  if (isMeaningful(payload.sent_at) && row.sent_at === payload.sent_at) {
    return true;
  }

  return isRecentReplay(row, replayWindowMs);
}

export async function findDuplicateSentCommunication(
  supabase: SupabaseClient,
  payload: EmailCommunicationPayload,
  options: {
    replayWindowMs?: number;
  } = {},
) {
  const replayWindowMs = options.replayWindowMs ?? 60_000;
  let query = supabase
    .from("communications")
    .select(communicationSelect)
    .eq("channel", payload.channel)
    .in("status", ["sent", "suppressed"])
    .eq("type", payload.type)
    .order("created_at", { ascending: false })
    .limit(25);

  query = applyNullableFilter(query, "booking_id", payload.booking_id);
  query = applyNullableFilter(query, "customer_id", payload.customer_id);

  if (!oneTimeCommunicationTypes.has(payload.type)) {
    query = query.eq("message", payload.message);

    if (payload.subject) {
      query = query.eq("subject", payload.subject);
    } else {
      query = query.is("subject", null);
    }
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return (
    ((data ?? []) as CommunicationRow[]).find((row) =>
      isDuplicateCommunication(row, payload, replayWindowMs),
    ) ?? null
  );
}

export async function insertCommunicationPayload(
  supabase: SupabaseClient,
  payload: EmailCommunicationPayload,
) {
  const { data, error } = await supabase
    .from("communications")
    .insert(payload)
    .select(communicationSelect)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data as CommunicationRow | null;
}
