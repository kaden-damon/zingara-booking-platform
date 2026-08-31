"use client";

import { useEffect, useRef } from "react";
import type { CookieConsentConfig } from "../../lib/cookieConsentConfig";

type CookieConsentPanelProps = {
  analytics: boolean;
  config: CookieConsentConfig;
  marketing: boolean;
  mode: "banner" | "preferences";
  onAcceptAll: () => void;
  onAnalyticsChange: (value: boolean) => void;
  onCancel: () => void;
  onEssentialOnly: () => void;
  onManage: () => void;
  onMarketingChange: (value: boolean) => void;
  onSave: () => void;
  preview?: boolean;
};

const actionClass =
  "min-h-11 rounded-lg border border-[#D8C36A]/55 px-4 py-3 text-center text-xs font-bold uppercase tracking-[0.08em] text-[#F2D66C] transition hover:bg-[#D8C36A] hover:text-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F2D66C] focus-visible:ring-offset-2 focus-visible:ring-offset-black";

export default function CookieConsentPanel({
  analytics,
  config,
  marketing,
  mode,
  onAcceptAll,
  onAnalyticsChange,
  onCancel,
  onEssentialOnly,
  onManage,
  onMarketingChange,
  onSave,
  preview = false,
}: CookieConsentPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    panelRef.current?.focus();
  }, [mode]);

  if (mode === "banner") {
    return (
      <div
        ref={panelRef}
        role="dialog"
        aria-labelledby="cookie-consent-heading"
        aria-describedby="cookie-consent-description"
        tabIndex={-1}
        className="w-full rounded-lg border border-[#D8C36A]/40 bg-[#080808] p-4 text-left text-white shadow-2xl shadow-black/60 focus:outline-none sm:p-5"
      >
        <p className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-[#D8C36A]">
          Privacy choices
        </p>
        <h2
          id="cookie-consent-heading"
          className="mt-2 text-xl font-bold uppercase sm:text-2xl"
        >
          {config.bannerHeading}
        </h2>
        <p
          id="cookie-consent-description"
          className="mt-3 text-sm leading-6 text-zinc-300"
        >
          {config.bannerDescription}
        </p>
        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <button type="button" onClick={onAcceptAll} className={actionClass}>
            {config.acceptAllLabel}
          </button>
          <button
            type="button"
            onClick={onEssentialOnly}
            className={actionClass}
          >
            {config.essentialOnlyLabel}
          </button>
          <button
            type="button"
            onClick={onManage}
            className="min-h-11 rounded-lg border border-white/20 px-4 py-3 text-xs font-bold uppercase tracking-[0.08em] text-white transition hover:border-white/45 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white sm:col-span-2"
          >
            {config.managePreferencesLabel}
          </button>
        </div>
        <p className="mt-3 text-xs leading-5 text-zinc-500">
          Optional choices never affect your ability to book. Read our{" "}
          <a
            href="/royal-decrees/cookie-policy"
            className="text-zinc-300 underline underline-offset-2"
          >
            Cookie Policy
          </a>
          .
        </p>
      </div>
    );
  }

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal={preview ? undefined : true}
      aria-labelledby="cookie-preferences-heading"
      tabIndex={-1}
      className="flex max-h-[min(42rem,calc(100dvh-2rem))] w-full flex-col overflow-hidden rounded-lg border border-[#D8C36A]/40 bg-[#080808] text-left text-white shadow-2xl shadow-black/60 focus:outline-none"
    >
      <div className="flex items-start justify-between gap-4 border-b border-white/10 p-4 sm:p-5">
        <div>
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-[#D8C36A]">
            Privacy choices
          </p>
          <h2
            id="cookie-preferences-heading"
            className="mt-2 text-xl font-bold uppercase sm:text-2xl"
          >
            {config.preferencesHeading}
          </h2>
        </div>
        <button
          type="button"
          onClick={onCancel}
          aria-label="Close cookie preferences"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-white/15 text-2xl text-zinc-300 transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
        >
          ×
        </button>
      </div>

      <div className="space-y-3 overflow-y-auto p-4 sm:p-5">
        <section className="rounded-lg border border-emerald-300/25 bg-emerald-950/15 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="font-bold uppercase text-white">Essential</h3>
              <p className="mt-1 text-xs font-semibold uppercase tracking-[0.1em] text-emerald-300">
                Always Active
              </p>
            </div>
            <span className="rounded-full border border-emerald-300/30 px-3 py-1 text-[0.65rem] font-bold uppercase text-emerald-200">
              Locked
            </span>
          </div>
          <p className="mt-3 text-sm leading-6 text-zinc-300">
            {config.essentialDescription}
          </p>
        </section>

        <ConsentToggle
          checked={analytics}
          description={config.analyticsDescription}
          label="Analytics"
          onChange={onAnalyticsChange}
        />
        <ConsentToggle
          checked={marketing}
          description={config.marketingDescription}
          label="Marketing"
          onChange={onMarketingChange}
        />
        <p className="text-xs leading-5 text-zinc-500">
          Read the{" "}
          <a
            href="/royal-decrees/cookie-policy"
            className="text-zinc-300 underline underline-offset-2"
          >
            Cookie Policy
          </a>{" "}
          and{" "}
          <a
            href="/royal-decrees/privacy-policy"
            className="text-zinc-300 underline underline-offset-2"
          >
            Privacy Policy
          </a>
          .
        </p>
      </div>

      <div className="grid grid-cols-1 gap-2 border-t border-white/10 p-4 sm:grid-cols-2 sm:p-5">
        <button type="button" onClick={onSave} className={actionClass}>
          {config.savePreferencesLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="min-h-11 rounded-lg border border-white/20 px-4 py-3 text-xs font-bold uppercase tracking-[0.08em] text-white transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
        >
          CANCEL
        </button>
      </div>
    </div>
  );
}

function ConsentToggle({
  checked,
  description,
  label,
  onChange,
}: {
  checked: boolean;
  description: string;
  label: string;
  onChange: (value: boolean) => void;
}) {
  const id = `cookie-${label.toLowerCase()}`;

  return (
    <section className="rounded-lg border border-white/12 bg-zinc-950 p-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="font-bold uppercase text-white">{label}</h3>
          <p className="mt-1 text-xs font-semibold uppercase tracking-[0.1em] text-zinc-500">
            Optional
          </p>
        </div>
        <label className="relative inline-flex min-h-11 min-w-16 cursor-pointer items-center justify-end">
          <span className="sr-only">Allow {label.toLowerCase()}</span>
          <input
            id={id}
            type="checkbox"
            checked={checked}
            onChange={(event) => onChange(event.target.checked)}
            className="peer sr-only"
          />
          <span className="h-7 w-12 rounded-full border border-white/20 bg-zinc-800 transition peer-checked:border-[#D8C36A] peer-checked:bg-[#D8C36A] peer-focus-visible:ring-2 peer-focus-visible:ring-[#F2D66C] peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-black after:absolute after:ml-1 after:mt-1 after:h-5 after:w-5 after:rounded-full after:bg-white after:transition peer-checked:after:translate-x-5" />
        </label>
      </div>
      <p className="mt-3 text-sm leading-6 text-zinc-300">{description}</p>
    </section>
  );
}
