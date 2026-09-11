"use client";

import { useId, useMemo, useState } from "react";

type ZingaraDatePickerProps = {
  align?: "left" | "right";
  availableDates?: ReadonlySet<string>;
  buttonClassName?: string;
  clearLabel?: string;
  label: string;
  onChange: (date: string) => void;
  placeholder: string;
  showToday?: boolean;
  value: string;
};

const weekdays = ["S", "M", "T", "W", "T", "F", "S"];
const months = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function getSastToday() {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      day: "2-digit",
      month: "2-digit",
      timeZone: "Africa/Johannesburg",
      year: "numeric",
    })
      .formatToParts(new Date())
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function monthKey(date: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date.slice(0, 7) : getSastToday().slice(0, 7);
}

function formatDate(date: string) {
  if (!date) return "";
  return new Intl.DateTimeFormat("en-ZA", {
    day: "2-digit",
    month: "short",
    timeZone: "Africa/Johannesburg",
    year: "numeric",
  }).format(new Date(`${date}T12:00:00+02:00`));
}

export default function ZingaraDatePicker({
  align = "left",
  availableDates,
  buttonClassName,
  clearLabel = "Clear",
  label,
  onChange,
  placeholder,
  showToday = false,
  value,
}: ZingaraDatePickerProps) {
  const popupId = useId();
  const [isOpen, setIsOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => monthKey(value));
  const today = getSastToday();

  const calendar = useMemo(() => {
    const [year, month] = calendarMonth.split("-").map(Number);
    const monthStart = new Date(Date.UTC(year, month - 1, 1));
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    return {
      cells: [
        ...Array.from({ length: monthStart.getUTCDay() }, () => null),
        ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
      ],
      label: `${months[month - 1]} ${year}`,
      month,
      year,
    };
  }, [calendarMonth]);

  function changeMonth(offset: number) {
    const next = new Date(Date.UTC(calendar.year, calendar.month - 1 + offset, 1));
    setCalendarMonth(`${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}`);
  }

  function choose(date: string) {
    onChange(date);
    setIsOpen(false);
  }

  function toggleCalendar() {
    if (!isOpen && value) setCalendarMonth(value.slice(0, 7));
    setIsOpen((current) => !current);
  }

  return (
    <div className="relative min-w-0">
      <button
        type="button"
        aria-controls={popupId}
        aria-expanded={isOpen}
        aria-label={label}
        onClick={toggleCalendar}
        className={buttonClassName ?? "h-11 w-full rounded-full border border-white/15 bg-black/35 px-4 py-2 text-left text-sm font-semibold text-zinc-300 outline-none transition hover:border-[#D8C36A]/50 focus:border-[#D8C36A]/70"}
      >
        {value ? formatDate(value) : placeholder}
      </button>

      {isOpen && (
        <div
          id={popupId}
          className={`absolute top-[calc(100%+0.5rem)] z-50 w-72 max-w-[calc(100vw-2rem)] rounded-[1.5rem] border border-[#D8C36A]/25 bg-zinc-950 p-4 shadow-2xl shadow-black/50 ${align === "right" ? "right-0" : "left-0"}`}
        >
          <div className="mb-3 flex items-center justify-between gap-2">
            <button
              type="button"
              aria-label={`Previous ${label.toLowerCase()} month`}
              onClick={() => changeMonth(-1)}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-white/15 text-xl text-zinc-300 transition hover:border-[#D8C36A] hover:text-[#F2D66C] focus:border-[#D8C36A] focus:outline-none"
            >
              ‹
            </button>
            <p className="text-sm font-semibold text-white">{calendar.label}</p>
            <button
              type="button"
              aria-label={`Next ${label.toLowerCase()} month`}
              onClick={() => changeMonth(1)}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-white/15 text-xl text-zinc-300 transition hover:border-[#D8C36A] hover:text-[#F2D66C] focus:border-[#D8C36A] focus:outline-none"
            >
              ›
            </button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-zinc-500">
            {weekdays.map((weekday, index) => <span key={`${popupId}-${weekday}-${index}`}>{weekday}</span>)}
          </div>
          <div className="mt-2 grid grid-cols-7 gap-1">
            {calendar.cells.map((day, index) => {
              if (!day) return <span key={`${popupId}-empty-${index}`} className="aspect-square" />;
              const date = `${calendar.year}-${String(calendar.month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
              const selectable = !availableDates || availableDates.has(date);
              const selected = value === date;
              const isToday = date === today;
              return (
                <button
                  key={date}
                  type="button"
                  disabled={!selectable}
                  onClick={() => choose(date)}
                  className={`aspect-square rounded-xl text-sm font-semibold transition ${selected ? "bg-[#D8C36A] text-black" : selectable ? "border border-[#D8C36A]/25 bg-[#D8C36A]/10 text-[#F2D66C] hover:bg-[#D8C36A]/20" : "bg-white/[0.03] text-zinc-700"} ${isToday ? "ring-1 ring-white/20" : ""}`}
                >
                  {day}
                </button>
              );
            })}
          </div>
          <div className="mt-4 flex items-center justify-between gap-2 border-t border-white/10 pt-3">
            <button type="button" onClick={() => choose("")} className="rounded-full border border-white/15 px-3 py-1.5 text-xs font-semibold text-zinc-300 transition hover:bg-white hover:text-black">{clearLabel}</button>
            {showToday && <button type="button" onClick={() => choose(getSastToday())} className="rounded-full border border-[#D8C36A]/35 px-3 py-1.5 text-xs font-semibold text-[#F2D66C] transition hover:bg-[#D8C36A] hover:text-black">Today</button>}
          </div>
        </div>
      )}
    </div>
  );
}
