"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  acknowledgeStaffTour,
  getAdminAuthSession,
} from "@/lib/supabase/auth";
import {
  hasAcknowledgedStaffTour,
  latestStaffTourVersion,
  staffTourPages,
} from "@/lib/staffOnboarding";

export function StaffOnboardingTour() {
  const [isOpen, setIsOpen] = useState(false);
  const [pageIndex, setPageIndex] = useState(0);
  const [saveError, setSaveError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void getAdminAuthSession().then((authSession) => {
      if (!cancelled && authSession && !hasAcknowledgedStaffTour(authSession.user)) {
        setIsOpen(true);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  if (!isOpen) return null;

  const page = staffTourPages[pageIndex];
  const isLastPage = pageIndex === staffTourPages.length - 1;

  async function finishTour() {
    setIsSaving(true);
    setSaveError("");
    const result = await acknowledgeStaffTour(latestStaffTourVersion);
    setIsSaving(false);

    if (result.error) {
      setSaveError("Your progress could not be saved. You can close this and keep working.");
      return;
    }

    setIsOpen(false);
  }

  return (
    <div className="fixed inset-0 z-[220] flex items-center justify-center bg-black/80 p-3 text-white backdrop-blur-md sm:p-6">
      <section
        aria-describedby="staff-tour-description"
        aria-labelledby="staff-tour-title"
        aria-modal="true"
        className="w-full max-w-xl rounded-2xl border border-[#D8C36A]/35 bg-zinc-950 p-5 shadow-2xl shadow-black/60 sm:p-8"
        role="dialog"
      >
        <div className="flex items-start justify-between gap-4">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#D8C36A]">
            What&apos;s New
          </p>
          <button
            aria-label="Close onboarding tour"
            className="flex size-10 shrink-0 items-center justify-center rounded-full border border-white/15 text-xl text-zinc-300 transition hover:border-white/40 hover:text-white"
            onClick={() => setIsOpen(false)}
            type="button"
          >
            x
          </button>
        </div>

        <div className="mt-5 min-h-64">
          <h2 className="text-2xl font-bold sm:text-3xl" id="staff-tour-title">
            {page.title}
          </h2>
          <p className="mt-4 text-base leading-7 text-zinc-300" id="staff-tour-description">
            {page.body}
          </p>
          {page.examples && (
            <div className="mt-6 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {page.examples.map((example) => (
                <div className="rounded-lg border border-white/10 bg-black/40 px-4 py-3 text-sm font-semibold" key={example}>
                  {example}
                </div>
              ))}
            </div>
          )}
          {page.supporting && (
            <p className="mt-5 text-sm font-semibold text-[#F2D66C]">{page.supporting}</p>
          )}
          {isLastPage && (
            <Link
              className="mt-5 inline-flex min-h-11 items-center text-sm font-semibold text-[#F2D66C] underline underline-offset-4"
              href="/admin?section=academy"
              onClick={() => setIsOpen(false)}
            >
              Open Academy
            </Link>
          )}
        </div>

        {saveError && <p className="mt-3 text-sm text-red-200">{saveError}</p>}

        <div aria-label="Tour progress" className="mt-6 flex gap-2">
          {staffTourPages.map((tourPage, index) => (
            <span
              className={`h-1.5 flex-1 rounded-full ${index <= pageIndex ? "bg-[#D8C36A]" : "bg-white/15"}`}
              key={tourPage.id}
            />
          ))}
        </div>

        <div className="mt-6 flex items-center justify-between gap-3">
          <button
            className="min-h-11 rounded-full border border-white/15 px-5 text-sm font-semibold disabled:invisible"
            disabled={pageIndex === 0}
            onClick={() => setPageIndex((current) => Math.max(0, current - 1))}
            type="button"
          >
            Back
          </button>
          <span className="text-xs text-zinc-500">
            {pageIndex + 1} of {staffTourPages.length}
          </span>
          <button
            className="min-h-11 rounded-full bg-[#D8C36A] px-5 text-sm font-bold text-black transition hover:bg-[#F2D66C] disabled:opacity-60"
            disabled={isSaving}
            onClick={() => {
              if (isLastPage) {
                void finishTour();
              } else {
                setPageIndex((current) => current + 1);
              }
            }}
            type="button"
          >
            {isLastPage ? (isSaving ? "Saving..." : "Got it") : "Next"}
          </button>
        </div>
      </section>
    </div>
  );
}
