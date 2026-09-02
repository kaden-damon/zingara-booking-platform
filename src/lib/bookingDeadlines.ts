import type { DemoVenueSettings, EntryLocationKey } from "@/lib/zingaraDemo";

const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export function isValidOperationalTime(value: string) {
  return timePattern.test(value);
}

export function getJohannesburgTimestamp(date: string, time: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !isValidOperationalTime(time)) {
    return Number.NaN;
  }

  return Date.parse(`${date}T${time}:00+02:00`);
}

export function getPublicBookingCutoff(input: {
  date: string;
  location: EntryLocationKey;
  now?: Date;
  settings: DemoVenueSettings;
}) {
  const configuration =
    input.settings.operationalSettings.publicBookings[input.location];

  if (!configuration.sameDayCutoffEnabled) {
    return { closed: false, cutoffAt: null } as const;
  }

  const cutoffTimestamp = getJohannesburgTimestamp(
    input.date,
    configuration.sameDayCutoffTime,
  );

  if (!Number.isFinite(cutoffTimestamp)) {
    return { closed: true, cutoffAt: null } as const;
  }

  return {
    closed: (input.now ?? new Date()).getTime() >= cutoffTimestamp,
    cutoffAt: new Date(cutoffTimestamp).toISOString(),
  } as const;
}

export function calculateCorporatePaymentDeadline(input: {
  createdAt: Date;
  durationDays: number;
  reminderDaysBefore: number;
  showDate: string;
  showTime: string;
}) {
  const durationDeadline =
    input.createdAt.getTime() + input.durationDays * 24 * 60 * 60 * 1000;
  const showDeadline = getJohannesburgTimestamp(
    input.showDate,
    input.showTime.slice(0, 5),
  );
  const deadline = Math.min(durationDeadline, showDeadline);
  const reminderAt = Math.max(
    input.createdAt.getTime(),
    deadline - input.reminderDaysBefore * 24 * 60 * 60 * 1000,
  );

  return {
    deadline: new Date(deadline).toISOString(),
    reminderAt: new Date(reminderAt).toISOString(),
  };
}

export function getCorporatePaymentHoldStatus(input: {
  amountPaid: number;
  deadline?: string;
  expiredAt?: string;
  now?: Date;
}) {
  if (!input.deadline) return "not-applicable" as const;
  if (input.amountPaid > 0) return "payment-received" as const;
  if (input.expiredAt || (input.now ?? new Date()).getTime() >= Date.parse(input.deadline)) {
    return "expired" as const;
  }
  return "awaiting-payment" as const;
}
