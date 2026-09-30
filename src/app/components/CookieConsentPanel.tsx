"use client";

import { useEffect, useRef, useState } from "react";
import type { CookieConsentConfig } from "../../lib/cookieConsentConfig";

type CookieConsentPanelProps = {
  config: CookieConsentConfig;
  initialChoices?: { analytics: boolean; marketing: boolean };
  onAcknowledge: () => void;
  onSavePreferences?: (choices: { analytics: boolean; marketing: boolean }) => void;
  preview?: boolean;
};

export default function CookieConsentPanel({
  config,
  initialChoices,
  onAcknowledge,
  onSavePreferences,
  preview = false,
}: CookieConsentPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [isManaging, setIsManaging] = useState(false);
  const [analytics, setAnalytics] = useState(initialChoices?.analytics === true);
  const [marketing, setMarketing] = useState(initialChoices?.marketing === true);
  const heading = config.bannerHeading.trim();

  useEffect(() => {
    panelRef.current?.focus();
  }, []);

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label={heading ? undefined : "Cookie notice"}
      aria-labelledby={heading ? "cookie-consent-heading" : undefined}
      aria-describedby="cookie-consent-description"
      aria-modal={preview ? undefined : false}
      tabIndex={-1}
      className="flex max-h-[calc(100dvh-2rem)] w-full flex-col overflow-hidden rounded-3xl border border-[#D8C36A]/45 bg-[#080808]/[0.97] text-left text-white shadow-2xl shadow-black/60 focus:outline-none"
    >
      <div className="overflow-y-auto px-5 pt-5 sm:px-6 sm:pt-6">
        {heading && (
          <h2
            id="cookie-consent-heading"
            className="text-lg font-bold uppercase sm:text-xl"
          >
            {heading}
          </h2>
        )}
        {isManaging ? (
          <div id="cookie-consent-description" className={`${heading ? "mt-3" : ""} space-y-4 text-sm leading-6 text-zinc-300`}>
            <p>{config.essentialDescription}</p>
            <label className="flex items-start gap-3 border-t border-white/10 pt-3">
              <input type="checkbox" checked={analytics} onChange={(event) => setAnalytics(event.target.checked)} className="mt-1 size-4 accent-[#D8C36A]" />
              <span><strong className="block text-white">Analytics</strong>{config.analyticsDescription}</span>
            </label>
            <label className="flex items-start gap-3 border-t border-white/10 pt-3">
              <input type="checkbox" checked={marketing} onChange={(event) => setMarketing(event.target.checked)} className="mt-1 size-4 accent-[#D8C36A]" />
              <span><strong className="block text-white">Marketing</strong>{config.marketingDescription}</span>
            </label>
          </div>
        ) : (
          <p id="cookie-consent-description" className={`${heading ? "mt-3" : ""} text-sm leading-6 text-zinc-300`}>
            {config.bannerDescription}
          </p>
        )}
      </div>

      <div className="shrink-0 px-5 pb-5 pt-4 sm:px-6 sm:pb-6">
        {isManaging ? (
          <button
            type="button"
            onClick={() => onSavePreferences?.({ analytics, marketing })}
            className="min-h-11 w-full rounded-xl border border-[#D8C36A] bg-[#D8C36A] px-4 py-3 text-center text-xs font-bold uppercase text-black transition hover:bg-[#F2D66C] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F2D66C] focus-visible:ring-offset-2 focus-visible:ring-offset-black"
          >
            {config.savePreferencesLabel}
          </button>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={onAcknowledge}
              className="min-h-11 rounded-xl border border-[#D8C36A] bg-[#D8C36A] px-4 py-3 text-center text-xs font-bold uppercase text-black transition hover:bg-[#F2D66C] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F2D66C] focus-visible:ring-offset-2 focus-visible:ring-offset-black"
            >
              {config.acceptAllLabel}
            </button>
            <button
              type="button"
              onClick={() => setIsManaging(true)}
              className="min-h-11 rounded-xl border border-white/20 px-4 py-3 text-center text-xs font-bold uppercase text-white transition hover:border-[#D8C36A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F2D66C] focus-visible:ring-offset-2 focus-visible:ring-offset-black"
            >
              {config.managePreferencesLabel}
            </button>
          </div>
        )}
        <p className="mt-3 text-center text-xs leading-5 text-zinc-500">
          <a
            href="/royal-decrees/cookie-policy"
            className="text-zinc-300 underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F2D66C]"
          >
            Cookie Policy
          </a>
        </p>
      </div>
    </div>
  );
}
