import {
  formatPublicBookingOpeningDateTime,
  getPublicBookingCountdown,
} from "@/lib/publicBookingSales";

type PublicBookingCountdownProps = {
  now: number;
  opensAt: string;
};

function formatPart(value: number) {
  return String(value).padStart(2, "0");
}

export default function PublicBookingCountdown({
  now,
  opensAt,
}: PublicBookingCountdownProps) {
  const countdown = getPublicBookingCountdown(opensAt, new Date(now));

  if (!countdown) {
    return null;
  }

  const parts = [
    { label: "Hrs", value: countdown.hours },
    { label: "Mins", value: countdown.minutes },
    { label: "Secs", value: countdown.seconds },
  ];

  return (
    <div
      aria-label={`Bookings open ${formatPublicBookingOpeningDateTime(opensAt)} Africa/Johannesburg`}
      className="flex min-h-11 flex-col items-center justify-center rounded-[0.8rem] border border-[#d8c36a]/35 bg-[#d8c36a]/10 px-2 py-1.5 text-[#f2d66c]"
    >
      <p className="text-[0.58rem] font-bold uppercase tracking-[0.13em]">
        Bookings Open In
      </p>
      <div className="mt-0.5 flex items-start justify-center gap-1 whitespace-nowrap tabular-nums">
        {parts.map((part, index) => (
          <div key={part.label} className="contents">
            {index > 0 ? (
              <span aria-hidden="true" className="pt-px text-[1rem] leading-none">
                :
              </span>
            ) : null}
            <span className="grid min-w-[2rem] justify-items-center">
              <span className="text-[1rem] font-semibold leading-none sm:text-[1.08rem]">
                {formatPart(part.value)}
              </span>
              <span className="mt-0.5 text-[0.5rem] font-medium normal-case leading-none text-[#f5f0e7]/80">
                {part.label}
              </span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
