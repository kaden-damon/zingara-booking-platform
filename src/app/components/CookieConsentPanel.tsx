"use client";

import { useEffect, useRef } from "react";
import type { CookieConsentConfig } from "../../lib/cookieConsentConfig";

type CookieConsentPanelProps = {
  config: CookieConsentConfig;
  onAcknowledge: () => void;
  preview?: boolean;
};

export default function CookieConsentPanel({
  config,
  onAcknowledge,
  preview = false,
}: CookieConsentPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
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
        <p
          id="cookie-consent-description"
          className={`${heading ? "mt-3" : ""} text-sm leading-6 text-zinc-300`}
        >
          {config.bannerDescription}
        </p>
      </div>

      <div className="shrink-0 px-5 pb-5 pt-4 sm:px-6 sm:pb-6">
        <button
          type="button"
          onClick={onAcknowledge}
          className="min-h-11 w-full rounded-xl border border-[#D8C36A] bg-[#D8C36A] px-4 py-3 text-center text-xs font-bold uppercase text-black transition hover:bg-[#F2D66C] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F2D66C] focus-visible:ring-offset-2 focus-visible:ring-offset-black"
        >
          {config.acceptAllLabel}
        </button>
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
