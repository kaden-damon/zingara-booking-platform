import {
  getCustomerExperienceTimes,
  type CustomerExperienceTimes,
  type ExperienceLocation,
} from "@/lib/experienceTimes";
import type { DemoVenueSettings } from "@/lib/zingaraDemo";

export default function YourEvening({
  compact = false,
  className = "",
  location,
  settings,
  times: suppliedTimes,
}: {
  compact?: boolean;
  className?: string;
  location?: ExperienceLocation | null;
  settings?: DemoVenueSettings;
  times?: CustomerExperienceTimes | null;
}) {
  const times = suppliedTimes ?? (settings ? getCustomerExperienceTimes(settings, location) : null);

  if (!times) return null;

  return (
    <section
      aria-label="Your Evening"
      className={`rounded-2xl border border-[#D8C36A]/30 bg-black/35 ${compact ? "p-3" : "p-4 sm:p-5"} ${className}`}
    >
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#D8C36A]">
        Your Evening
      </p>
      <dl className="mt-3 grid grid-cols-1 gap-2 min-[390px]:grid-cols-3">
        <div>
          <dt className="text-[0.62rem] font-semibold uppercase tracking-[0.12em] text-zinc-500">
            Grounds Open
          </dt>
          <dd className="mt-1 font-semibold text-white">{times.groundsOpen}</dd>
        </div>
        <div>
          <dt className="text-[0.62rem] font-semibold uppercase tracking-[0.12em] text-zinc-500">
            Guest Seating
          </dt>
          <dd className="mt-1 font-semibold text-white">{times.guestSeating}</dd>
        </div>
        <div>
          <dt className="text-[0.62rem] font-semibold uppercase tracking-[0.12em] text-[#D8C36A]">
            Show Starts
          </dt>
          <dd className="mt-1 text-lg font-bold text-[#F2D66C]">{times.showStarts}</dd>
        </div>
      </dl>
    </section>
  );
}
