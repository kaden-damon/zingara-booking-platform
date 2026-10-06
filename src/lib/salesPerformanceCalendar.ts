import type { calculateManagementAnalytics } from "@/lib/managementAnalytics";

export type SalesPerformanceRow = ReturnType<
  typeof calculateManagementAnalytics
>["performanceDemand"][number];

export type SalesPerformanceSummary = {
  amountPaid: number;
  bookingValue: number;
  capacity: number;
  guests: number;
  occupancy: number;
  outstanding: number;
  shows: number;
};

export function getCalendarMonthRange(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();

  return {
    from: `${month}-01`,
    to: `${month}-${String(lastDay).padStart(2, "0")}`,
  };
}

export function shiftCalendarMonth(month: string, offset: number) {
  const [year, monthNumber] = month.split("-").map(Number);
  const next = new Date(Date.UTC(year, monthNumber - 1 + offset, 1));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function summarizeSalesPerformance(
  rows: SalesPerformanceRow[],
): SalesPerformanceSummary {
  const totals = rows.reduce(
    (summary, row) => ({
      amountPaid: summary.amountPaid + row.amountPaid,
      bookingValue: summary.bookingValue + row.bookingValue,
      capacity: summary.capacity + row.capacity,
      guests: summary.guests + row.guests,
      outstanding: summary.outstanding + row.outstanding,
    }),
    {
      amountPaid: 0,
      bookingValue: 0,
      capacity: 0,
      guests: 0,
      outstanding: 0,
    },
  );

  return {
    ...totals,
    occupancy: totals.capacity > 0 ? (totals.guests / totals.capacity) * 100 : 0,
    shows: rows.length,
  };
}

export function groupSalesPerformanceByDate(rows: SalesPerformanceRow[]) {
  const groups = new Map<string, SalesPerformanceRow[]>();

  for (const row of rows) {
    groups.set(row.date, [...(groups.get(row.date) ?? []), row]);
  }

  return groups;
}

export function getCalendarGridDates(month: string) {
  const { from, to } = getCalendarMonthRange(month);
  const first = new Date(`${from}T12:00:00Z`);
  const last = new Date(`${to}T12:00:00Z`);
  const mondayOffset = (first.getUTCDay() + 6) % 7;
  const cells = mondayOffset + last.getUTCDate();
  const totalCells = Math.ceil(cells / 7) * 7;

  return Array.from({ length: totalCells }, (_, index) => {
    const day = index - mondayOffset + 1;
    if (day < 1 || day > last.getUTCDate()) return null;
    return `${month}-${String(day).padStart(2, "0")}`;
  });
}
