"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import {
  acknowledgeStaffTour,
  getAdminAuthSession,
} from "@/lib/supabase/auth";
import {
  hasAcknowledgedStaffTour,
  latestStaffTourVersion,
  staffTourOpenEvent,
  staffTourPages,
  type StaffTourAcknowledgement,
} from "@/lib/staffOnboarding";

export function StaffOnboardingTour() {
  const [isOpen, setIsOpen] = useState(false);
  const [pageIndex, setPageIndex] = useState(0);
  const [saveError, setSaveError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const openTour = () => {
      setPageIndex(0);
      setSaveError("");
      setIsOpen(true);
    };

    window.addEventListener(staffTourOpenEvent, openTour);

    const automaticOpenTimer = window.setTimeout(() => {
      void getAdminAuthSession().then((authSession) => {
        const operationalDialogIsOpen = document.querySelector(
          '[role="dialog"]',
        );

        if (
          !cancelled &&
          authSession &&
          !operationalDialogIsOpen &&
          !hasAcknowledgedStaffTour(authSession.user)
        ) {
          openTour();
        }
      });
    }, 600);

    return () => {
      cancelled = true;
      window.clearTimeout(automaticOpenTimer);
      window.removeEventListener(staffTourOpenEvent, openTour);
    };
  }, []);

  if (!isOpen) return null;

  const page = staffTourPages[pageIndex];
  const isLastPage = pageIndex === staffTourPages.length - 1;

  async function finishTour(acknowledgement: StaffTourAcknowledgement) {
    setIsSaving(true);
    setSaveError("");
    const result = await acknowledgeStaffTour(
      latestStaffTourVersion,
      acknowledgement,
    );
    setIsSaving(false);

    if (result.error) {
      setSaveError("Your acknowledgement could not be saved. Please retry Skip or Got It; your work remains unchanged.");
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
            NEW FEATURE WALKTHROUGH
          </p>
          <button
            className="min-h-10 shrink-0 rounded-full border border-white/15 px-4 text-xs font-semibold uppercase text-zinc-300 transition hover:border-white/40 hover:text-white disabled:opacity-60"
            disabled={isSaving}
            onClick={() => void finishTour("skipped")}
            type="button"
          >
            {isSaving ? "Saving..." : "Skip"}
          </button>
        </div>

        <div className="mt-4 min-h-56 sm:mt-5">
          {page.id === "quote-invoice-overview" && (
            <div className="mb-5 flex items-center gap-3">
              <Image src="/brand/zingara-logo-landing.svg" alt="Zingara" width={142} height={34} className="h-8 w-auto" />
              <span aria-hidden="true" className="text-xl text-[#D8C36A]">→</span>
              <Image src="/brand/xero-logo.png" alt="Xero" width={163} height={32} className="h-8 w-auto" />
            </div>
          )}
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
                void finishTour("completed");
              } else {
                setPageIndex((current) => current + 1);
              }
            }}
            type="button"
          >
            {isLastPage ? (isSaving ? "Saving..." : "GOT IT") : "Next"}
          </button>
        </div>
      </section>
    </div>
  );
}
