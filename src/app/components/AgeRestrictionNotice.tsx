"use client";

import { useId, useState } from "react";

import { ageRestrictionPolicy } from "../../lib/ageRestrictionPolicy";

export default function AgeRestrictionNotice({
  className = "",
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const explanationId = useId();

  return (
    <aside
      aria-label={ageRestrictionPolicy.label}
      className={`relative rounded-xl border border-[#D8C36A]/30 bg-[#1A1208]/70 ${compact ? "p-3" : "p-4"} ${className}`}
    >
      <div className="flex items-center gap-2">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#F2D66C]">
          {ageRestrictionPolicy.label}
        </p>
        <button
          type="button"
          aria-controls={explanationId}
          aria-expanded={open}
          aria-label="Why is there an age restriction?"
          onClick={() => setOpen((current) => !current)}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#D8C36A]/55 text-sm font-bold text-[#F2D66C] outline-none transition hover:bg-[#D8C36A] hover:text-black focus-visible:ring-2 focus-visible:ring-[#F2D66C]"
        >
          ?
        </button>
      </div>
      <p className="mt-2 text-sm leading-6 text-zinc-200">
        {ageRestrictionPolicy.policy}
      </p>
      {open && (
        <div
          id={explanationId}
          role="dialog"
          aria-modal="false"
          aria-labelledby={`${explanationId}-heading`}
          className="mt-3 rounded-xl border border-[#D8C36A]/35 bg-black/90 p-4 shadow-2xl"
        >
          <div className="flex items-start justify-between gap-4">
            <p
              id={`${explanationId}-heading`}
              className="text-xs font-bold uppercase tracking-[0.14em] text-[#F2D66C]"
            >
              {ageRestrictionPolicy.explanationHeading}
            </p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close age restriction explanation"
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/20 text-lg text-white outline-none hover:border-[#D8C36A] focus-visible:ring-2 focus-visible:ring-[#F2D66C]"
            >
              X
            </button>
          </div>
          <p className="mt-3 text-sm leading-6 text-zinc-200">
            {ageRestrictionPolicy.explanation}
          </p>
        </div>
      )}
    </aside>
  );
}
