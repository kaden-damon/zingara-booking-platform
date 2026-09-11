import type { SupabaseClient } from "@supabase/supabase-js";

import type { DemoVenueSettings, EntryLocationKey } from "./zingaraDemo";
import { normalizeShowLocation } from "./zingaraDemo";
import { notifyAppleWalletTickets } from "./appleWalletSync";
import {
  resolveScheduledSecretPassword,
  type ResolvedSecretPassword,
  type SecretPasswordSchedule,
  type SecretPasswordScope,
} from "./secretPasswordResolution";
export type { ResolvedSecretPassword, SecretPasswordSchedule, SecretPasswordScope } from "./secretPasswordResolution";

type SecretPasswordScheduleRow = {
  created_at?: string;
  enabled: boolean;
  end_date: string;
  end_time: string | null;
  id: string;
  phrase: string;
  scope_type: SecretPasswordScope;
  show_id: string | null;
  start_date: string;
  start_time: string | null;
  updated_at?: string;
  venue_location: EntryLocationKey;
};

export function toSecretPasswordSchedule(
  row: SecretPasswordScheduleRow,
): SecretPasswordSchedule {
  return {
    createdAt: row.created_at,
    enabled: row.enabled,
    endDate: row.end_date,
    endTime: row.end_time?.slice(0, 5) ?? null,
    id: row.id,
    phrase: row.phrase,
    scopeType: row.scope_type,
    showId: row.show_id,
    startDate: row.start_date,
    startTime: row.start_time?.slice(0, 5) ?? null,
    updatedAt: row.updated_at,
    venueLocation: row.venue_location,
  };
}

export function resolveSecretPasswordFromSchedules(input: {
  settings: DemoVenueSettings;
  show: { date: string; id: string; time: string };
  schedules: SecretPasswordSchedule[];
  venueLocation: EntryLocationKey;
}): ResolvedSecretPassword | null {
  const configuration =
    input.settings.operationalSettings?.secretPasswordExperience?.[
      input.venueLocation
    ];

  if (!configuration) return null;

  return resolveScheduledSecretPassword({
    configuration,
    show: input.show,
    schedules: input.schedules,
    venueLocation: input.venueLocation,
  });
}

export async function resolveServerSecretPassword(input: {
  client: SupabaseClient;
  settings: DemoVenueSettings;
  show: { date: string; id: string; time: string };
  venueLocation: EntryLocationKey;
}) {
  const configuration =
    input.settings.operationalSettings?.secretPasswordExperience?.[
      input.venueLocation
    ];
  if (!configuration?.enabled) return null;

  const { data, error } = await input.client
    .from("venue_secret_password_schedules")
    .select("id,venue_location,scope_type,show_id,start_date,end_date,start_time,end_time,phrase,enabled,created_at,updated_at")
    .eq("venue_location", input.venueLocation)
    .eq("enabled", true)
    .or(
      `show_id.eq.${input.show.id},and(show_id.is.null,start_date.lte.${input.show.date},end_date.gte.${input.show.date})`,
    );

  if (error) throw error;

  return resolveSecretPasswordFromSchedules({
    settings: input.settings,
    show: input.show,
    schedules: (data ?? []).map((row) =>
      toSecretPasswordSchedule(row as SecretPasswordScheduleRow),
    ),
    venueLocation: input.venueLocation,
  });
}

export async function resolveOptionalServerSecretPassword(
  input: Parameters<typeof resolveServerSecretPassword>[0],
) {
  try {
    return await resolveServerSecretPassword(input);
  } catch (error) {
    console.error(
      "[Zingara Secret Password] Optional guest enrichment failed.",
      error,
    );
    return null;
  }
}

export function shouldIncludeSecretPasswordInCommunications(
  settings: DemoVenueSettings,
  venueLocation: EntryLocationKey,
) {
  return Boolean(
    settings.operationalSettings?.secretPasswordExperience?.[venueLocation]
      ?.includeInCommunications,
  );
}

export async function notifySecretPasswordWalletUpdates(input: {
  client: SupabaseClient;
  endDate: string;
  showId?: string | null;
  startDate: string;
  venueLocation: EntryLocationKey;
}) {
  try {
    let query = input.client
      .from("shows")
      .select("id,venue")
      .gte("date", input.startDate)
      .lte("date", input.endDate);
    if (input.showId) query = query.eq("id", input.showId);
    const { data: shows, error: showError } = await query;
    if (showError) throw showError;
    const showIds = (shows ?? [])
      .filter((show) => normalizeShowLocation(show.venue) === input.venueLocation)
      .map((show) => show.id as string);
    if (showIds.length === 0) return { attempted: 0, delivered: 0 };

    const { data: bookings, error: bookingError } = await input.client
      .from("bookings")
      .select("id")
      .in("show_id", showIds);
    if (bookingError) throw bookingError;
    const bookingIds = (bookings ?? []).map((booking) => booking.id as string);
    if (bookingIds.length === 0) return { attempted: 0, delivered: 0 };

    const { data: tickets, error: ticketError } = await input.client
      .from("tickets")
      .select("id")
      .in("booking_id", bookingIds);
    if (ticketError) throw ticketError;
    return notifyAppleWalletTickets(
      input.client,
      (tickets ?? []).map((ticket) => ticket.id as string),
    );
  } catch {
    console.error("[Zingara Secret Password] Wallet update notification failed.");
    return { attempted: 0, delivered: 0 };
  }
}
