export type WebsiteConversionDailyRow = {
  abandoned_holds: number;
  active_incomplete_bookings: number;
  completed_booking_value: number;
  completed_bookings: number;
  completed_guests: number;
  guest_details_reached: number;
  payment_started: number;
  performance_selected: number;
  recorded_journey_starts: number;
  report_date: string;
  seating_selected: number;
  sessions: number;
  site_views: number;
  visitors: number;
};

export type WebsiteConversionTotals = Omit<
  WebsiteConversionDailyRow,
  "report_date"
> & {
  payment_completed: number;
  session_completed_bookings: number;
  visitor_completed_bookings: number;
};

export type WebsiteConversionReport = {
  asOf: string;
  daily: WebsiteConversionDailyRow[];
  devices: Array<{ label: string; value: number }>;
  from: string;
  legacyFunnelAvailableFrom: string | null;
  sessionTrackingAvailableFrom: string | null;
  sources: Array<{ label: string; value: number }>;
  to: string;
  totals: WebsiteConversionTotals;
  venue: "all" | "cape-town" | "johannesburg";
  visitorTrackingAvailableFrom: string | null;
};

export function percentage(numerator: number, denominator: number) {
  return denominator > 0 ? (numerator / denominator) * 100 : null;
}
