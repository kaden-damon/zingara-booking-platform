"use client";

import { useEffect, useMemo, useState } from "react";
import CookieConsentPanel from "../components/CookieConsentPanel";
import {
  defaultCookieConsentConfig,
  getChangedCookieConsentFields,
  normalizeCookieConsentConfig,
  type CookieConsentConfig,
  type CookieConsentTextField,
} from "../../lib/cookieConsentConfig";
import { fetchSupabaseApi } from "../../lib/supabase/apiClient";

type SaveState = "error" | "idle" | "saved" | "saving";

const copyFields: Array<{
  field: CookieConsentTextField;
  label: string;
  multiline?: boolean;
}> = [
  { field: "bannerHeading", label: "Banner Heading (Optional)" },
  { field: "bannerDescription", label: "Banner Description", multiline: true },
  { field: "acceptAllLabel", label: "OKAY Button Label" },
  { field: "essentialDescription", label: "Essential Description", multiline: true },
  { field: "analyticsDescription", label: "Analytics Description", multiline: true },
  { field: "marketingDescription", label: "Marketing Description", multiline: true },
  { field: "preferencesHeading", label: "Advanced Preferences Heading (Optional)" },
  { field: "essentialOnlyLabel", label: "Advanced Essential-Only Label (Optional)" },
  { field: "managePreferencesLabel", label: "Advanced Manage Label (Optional)" },
  { field: "savePreferencesLabel", label: "Advanced Save Label (Optional)" },
  { field: "footerLinkLabel", label: "Advanced Footer Label (Optional)" },
];

export default function CookiePrivacyPreferences({
  isSuperAdmin,
}: {
  isSuperAdmin: boolean;
}) {
  const [savedConfig, setSavedConfig] = useState(defaultCookieConsentConfig);
  const [draft, setDraft] = useState(defaultCookieConsentConfig);
  const [revision, setRevision] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [error, setError] = useState("");
  const [showPreview, setShowPreview] = useState(false);
  const changedFields = useMemo(
    () => getChangedCookieConsentFields(savedConfig, draft),
    [draft, savedConfig],
  );
  const isDirty = changedFields.length > 0;

  useEffect(() => {
    let active = true;

    void fetchSupabaseApi<{
      config: unknown;
      revision: number;
    }>("/api/admin/system-preferences/cookie-consent")
      .then((payload) => {
        if (!active) return;
        const config = normalizeCookieConsentConfig(payload.config);
        setSavedConfig(config);
        setDraft(config);
        setRevision(payload.revision ?? 0);
      })
      .catch((loadError) => {
        if (!active) return;
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Cookie & Privacy preferences could not be loaded.",
        );
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  function updateDraft<Key extends keyof CookieConsentConfig>(
    field: Key,
    value: CookieConsentConfig[Key],
  ) {
    if (!isSuperAdmin) return;
    setDraft((current) => ({ ...current, [field]: value }));
    setSaveState("idle");
    setError("");
  }

  async function persistConfig(
    config: CookieConsentConfig,
    consentVersionReset = false,
  ) {
    if (!isSuperAdmin || saveState === "saving") return;

    setSaveState("saving");
    setError("");

    try {
      const payload = await fetchSupabaseApi<{
        config: unknown;
        revision: number;
      }>("/api/admin/system-preferences/cookie-consent", {
        body: { config, consentVersionReset },
        method: "PUT",
      });
      const persisted = normalizeCookieConsentConfig(payload.config);
      setSavedConfig(persisted);
      setDraft(persisted);
      setRevision(payload.revision);
      setSaveState("saved");
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Cookie & Privacy preferences could not be saved.",
      );
      setSaveState("error");
    }
  }

  function requireConsentAgain() {
    if (!isSuperAdmin) return;

    const confirmed = window.confirm(
      "This will ask returning visitors to review their cookie preferences again.",
    );

    if (!confirmed) return;

    void persistConfig(
      { ...draft, consentVersion: Math.max(draft.consentVersion + 1, 2) },
      true,
    );
  }

  if (isLoading) {
    return (
      <section className="rounded-lg border border-white/10 bg-zinc-950 p-5 text-sm text-zinc-400">
        Loading Cookie & Privacy preferences...
      </section>
    );
  }

  return (
    <section className="space-y-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#D8C36A]">
            System Preferences
          </p>
          <h2 className="mt-2 text-3xl font-bold text-white">Cookie & Privacy</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">
            Configure the public consent experience. Legal policies remain controlled in the Legal Centre source.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span
            role="status"
            aria-live="polite"
            className={`text-sm ${saveState === "error" ? "text-red-300" : saveState === "saved" ? "text-emerald-300" : "text-zinc-400"}`}
          >
            {saveState === "saving"
              ? "Saving..."
              : saveState === "saved"
                ? "Saved ✓"
                : saveState === "error"
                  ? "Save Failed"
                  : isDirty
                    ? "Unsaved changes"
                    : "Saved"}
          </span>
          <button
            type="button"
            onClick={() => void persistConfig(draft)}
            disabled={!isSuperAdmin || !isDirty || saveState === "saving"}
            className="min-h-11 rounded-lg bg-[#D8C36A] px-4 py-2 text-sm font-semibold text-black transition hover:bg-[#F2D66C] disabled:cursor-not-allowed disabled:opacity-45"
          >
            Save Preferences
          </button>
        </div>
      </div>

      {!isSuperAdmin && (
        <p className="rounded-lg border border-amber-300/25 bg-amber-950/15 p-4 text-sm text-amber-100">
          Cookie & Privacy configuration is read-only. Super Admin access is required to make changes.
        </p>
      )}
      {error && (
        <p className="rounded-lg border border-red-300/25 bg-red-950/20 p-4 text-sm text-red-100">
          {error}
        </p>
      )}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[0.72fr_1.28fr]">
        <div className="space-y-5">
          <section className="rounded-lg border border-white/10 bg-zinc-950 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold text-white">Cookie Consent</h3>
                <p className="mt-1 text-sm text-zinc-500">
                  Controls the public prompt only. Disabled never grants optional consent.
                </p>
              </div>
              <label className="flex min-h-11 items-center gap-3 text-sm font-semibold text-white">
                <input
                  type="checkbox"
                  checked={draft.enabled}
                  disabled={!isSuperAdmin}
                  onChange={(event) => updateDraft("enabled", event.target.checked)}
                  className="h-5 w-5 accent-[#D8C36A]"
                />
                {draft.enabled ? "Enabled" : "Disabled"}
              </label>
            </div>
          </section>

          <section className="rounded-lg border border-white/10 bg-zinc-950 p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#D8C36A]">
              Category Semantics
            </p>
            <div className="mt-4 space-y-3">
              {[
                ["Essential", "Always Active", "Locked"],
                ["Analytics", "Optional", "Off by default"],
                ["Marketing", "Optional", "Off by default"],
              ].map(([category, state, guard]) => (
                <div key={category} className="rounded-lg border border-white/10 bg-black/40 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <strong className="uppercase text-white">{category}</strong>
                    <span className="text-xs font-semibold uppercase text-zinc-500">{guard}</span>
                  </div>
                  <p className="mt-1 text-sm text-zinc-400">{state}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-lg border border-white/10 bg-zinc-950 p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#D8C36A]">
              Consent Version
            </p>
            <p className="mt-2 text-3xl font-bold text-white">{draft.consentVersion}</p>
            <p className="mt-2 text-sm text-zinc-500">Configuration revision {revision}</p>
            <button
              type="button"
              onClick={requireConsentAgain}
              disabled={!isSuperAdmin || saveState === "saving"}
              className="mt-4 min-h-11 rounded-lg border border-amber-300/35 px-4 py-2 text-xs font-bold uppercase text-amber-200 transition hover:bg-amber-300 hover:text-black disabled:opacity-45"
            >
              Require Consent Again
            </button>
          </section>
        </div>

        <section className="rounded-lg border border-white/10 bg-zinc-950 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#D8C36A]">Public Copy</p>
              <p className="mt-1 text-sm text-zinc-500">
                The public notice uses the description and OKAY label. Advanced
                fields remain available for future optional preferences. Changes
                remain drafts until saved.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setShowPreview(true);
              }}
              className="min-h-11 rounded-lg border border-white/20 px-4 py-2 text-xs font-bold uppercase text-white transition hover:bg-white/10"
            >
              Preview
            </button>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
            {copyFields.map(({ field, label, multiline }) => (
              <label
                key={field}
                className={`text-sm text-zinc-400 ${multiline ? "md:col-span-2" : ""}`}
              >
                {label}
                {multiline ? (
                  <textarea
                    rows={3}
                    value={draft[field]}
                    disabled={!isSuperAdmin}
                    onChange={(event) => updateDraft(field, event.target.value)}
                    className="mt-2 w-full rounded-lg border border-white/15 bg-black px-3 py-3 text-white disabled:opacity-60"
                  />
                ) : (
                  <input
                    value={draft[field]}
                    disabled={!isSuperAdmin}
                    onChange={(event) => updateDraft(field, event.target.value)}
                    className="mt-2 w-full rounded-lg border border-white/15 bg-black px-3 py-3 text-white disabled:opacity-60"
                  />
                )}
              </label>
            ))}
          </div>
        </section>
      </div>

      {showPreview && (
        <div className="rounded-lg border border-[#D8C36A]/30 bg-black/45 p-3 sm:p-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#D8C36A]">Preview · No consent is saved</p>
            <button
              type="button"
              onClick={() => setShowPreview(false)}
              className="min-h-11 rounded-lg border border-white/15 px-3 py-2 text-xs font-bold uppercase text-zinc-300"
            >
              Close Preview
            </button>
          </div>
          <div className="mx-auto max-w-xl">
            <CookieConsentPanel
              config={draft}
              onAcknowledge={() => undefined}
              preview
            />
          </div>
        </div>
      )}
    </section>
  );
}
