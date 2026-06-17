import {
  type DemoBooking,
  createTicketCode,
} from "@/lib/zingaraDemo";
import { getSupabaseClient } from "./client";
import { getSupabaseBookingId } from "./bookings";

type SupabaseValidationResult =
  | "already_used"
  | "cancelled"
  | "checked_in"
  | "invalid"
  | "refunded"
  | "valid";

type TicketValidationRecord = {
  bookingReference?: string;
  code?: string;
  deviceLabel?: string;
  id: string;
  notes?: string;
  result: SupabaseValidationResult;
  ticketCode?: string;
  validatedAt: string;
};

type SupabaseTicketValidationRow = {
  booking_id: string;
  device_label: string | null;
  id: string;
  notes: string | null;
  result: SupabaseValidationResult;
  ticket_id: string;
  validated_at: string;
};

type SupabaseTicketRow = {
  booking_id: string;
  id: string;
  ticket_code: string;
};

const localTicketValidationsStorageKey = "zingara-ticket-validations";

function getLocalTicketValidations() {
  if (typeof window === "undefined") {
    return [] as TicketValidationRecord[];
  }

  try {
    const storedValidations = window.localStorage.getItem(
      localTicketValidationsStorageKey,
    );
    const parsedValidations = storedValidations
      ? (JSON.parse(storedValidations) as unknown)
      : [];

    return Array.isArray(parsedValidations)
      ? (parsedValidations as TicketValidationRecord[])
      : [];
  } catch {
    return [];
  }
}

function storeLocalTicketValidation(validation: TicketValidationRecord) {
  if (typeof window === "undefined") {
    return validation;
  }

  const nextValidations = [
    validation,
    ...getLocalTicketValidations().filter(
      (currentValidation) => currentValidation.id !== validation.id,
    ),
  ];

  window.localStorage.setItem(
    localTicketValidationsStorageKey,
    JSON.stringify(nextValidations),
  );

  return validation;
}

function toTicketValidationRecord(
  row: SupabaseTicketValidationRow,
): TicketValidationRecord {
  return {
    deviceLabel: row.device_label ?? undefined,
    id: row.id,
    notes: row.notes ?? undefined,
    result: row.result,
    validatedAt: row.validated_at,
  };
}

async function getTicketRows() {
  const supabase = getSupabaseClient();

  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase
    .from("tickets")
    .select("id,booking_id,ticket_code");

  if (error) {
    console.error(
      "[Zingara Supabase] Failed to load validation tickets",
      error,
    );
    return null;
  }

  return (data ?? []) as SupabaseTicketRow[];
}

async function getTicketForBooking(booking: DemoBooking) {
  const bookingId = await getSupabaseBookingId(booking.reference);
  const ticketRows = await getTicketRows();
  const ticketCode = booking.ticketCode ?? createTicketCode(booking.reference);

  return ticketRows?.find(
    (ticket) =>
      ticket.ticket_code === ticketCode ||
      (!!bookingId && ticket.booking_id === bookingId),
  );
}

async function getTicketValidationRows() {
  const supabase = getSupabaseClient();

  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase
    .from("ticket_validations")
    .select(
      "id,ticket_id,booking_id,result,device_label,notes,validated_at",
    )
    .order("validated_at", { ascending: false });

  if (error) {
    console.error("[Zingara Supabase] Failed to load ticket validations", error);
    return null;
  }

  return (data ?? []) as SupabaseTicketValidationRow[];
}

export async function getTicketValidations() {
  const rows = await getTicketValidationRows();
  const localValidations = getLocalTicketValidations();

  if (!rows) {
    return localValidations;
  }

  return [...rows.map(toTicketValidationRecord), ...localValidations];
}

export async function createTicketValidation({
  booking,
  code,
  deviceLabel = "Box Office",
  notes,
  result,
}: {
  booking?: DemoBooking;
  code?: string;
  deviceLabel?: string;
  notes?: string;
  result: SupabaseValidationResult;
}) {
  const validatedAt = new Date().toISOString();
  const fallbackValidation: TicketValidationRecord = {
    bookingReference: booking?.reference,
    code,
    deviceLabel,
    id: `${booking?.reference ?? code ?? "unknown"}-${result}-${Date.now().toString(36)}`,
    notes,
    result,
    ticketCode: booking?.ticketCode ?? (booking ? createTicketCode(booking.reference) : undefined),
    validatedAt,
  };
  const supabase = getSupabaseClient();

  if (!supabase || !booking) {
    return storeLocalTicketValidation(fallbackValidation);
  }

  const ticket = await getTicketForBooking(booking);

  if (!ticket) {
    return storeLocalTicketValidation(fallbackValidation);
  }

  const { data, error } = await supabase
    .from("ticket_validations")
    .insert({
      booking_id: ticket.booking_id,
      device_label: deviceLabel,
      notes: notes ?? null,
      result,
      ticket_id: ticket.id,
      validated_at: validatedAt,
    })
    .select("id,ticket_id,booking_id,result,device_label,notes,validated_at")
    .maybeSingle();

  if (error) {
    console.error("[Zingara Supabase] Failed to create ticket validation", error);
    return storeLocalTicketValidation(fallbackValidation);
  }

  return data
    ? toTicketValidationRecord(data as SupabaseTicketValidationRow)
    : fallbackValidation;
}
