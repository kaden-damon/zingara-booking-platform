"use client";

import { useCallback, useEffect, useState } from "react";
import { getAdminAuthSession } from "@/lib/supabase/auth";

type FeatureState = {
  enabled: boolean;
  updatedAt?: string;
};

async function requestFeatureState(init?: RequestInit) {
  const auth = await getAdminAuthSession();
  if (!auth) throw new Error("Your Admin session has expired. Sign in again.");

  const response = await fetch("/api/admin/secret-guest-list", {
    ...init,
    cache: "no-store",
    headers: {
      ...init?.headers,
      Authorization: `Bearer ${auth.session.access_token}`,
      "Content-Type": "application/json",
    },
  });
  const payload = (await response.json()) as FeatureState & { error?: string };

  if (!response.ok) {
    throw new Error(payload.error ?? "The Secret Guest List setting could not be loaded.");
  }

  return payload;
}

export default function SecretGuestListSettings() {
  const [feature, setFeature] = useState<FeatureState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setFeature(await requestFeatureState());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The setting could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function update(enabled: boolean) {
    setLoading(true);
    setError("");
    setStatus("");
    try {
      const next = await requestFeatureState({
        body: JSON.stringify({ enabled }),
        method: "PATCH",
      });
      setFeature(next);
      setStatus(`The Secret Guest List is now ${next.enabled ? "ON" : "OFF"}.`);
    } catch (caught) {
      const saveError =
        caught instanceof Error ? caught.message : "The setting could not be saved.";

      try {
        setFeature(await requestFeatureState());
        setError(`${saveError} The saved setting has been restored.`);
      } catch {
        setFeature(null);
        setError(`${saveError} Refresh the page to reload the saved setting.`);
      }
    } finally {
      setLoading(false);
    }
  }

  const enabled = feature?.enabled === true;
  const ready = feature !== null;

  return (
    <section className="mb-5 rounded-lg border border-[#D8C36A]/30 bg-zinc-950/80 p-4 sm:p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase text-[#D8C36A]">Public Booking</p>
          <h2 className="mt-1 text-xl font-bold text-white">The Secret Guest List</h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-zinc-400">
            Show or hide the sold-out enquiry option. Standard Waitlist remains available.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-busy={loading}
          aria-checked={enabled}
          aria-label={`The Secret Guest List is ${ready ? (enabled ? "ON" : "OFF") : "loading"}`}
          disabled={loading || !ready}
          onClick={() => void update(!enabled)}
          className={`relative h-12 w-28 shrink-0 rounded-full border-2 p-1 text-white shadow-sm transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F2D66C] focus-visible:ring-offset-2 focus-visible:ring-offset-black ${
            ready
              ? enabled
                ? "border-emerald-300 bg-emerald-600"
                : "border-zinc-400 bg-zinc-600"
              : "border-zinc-700 bg-zinc-800"
          } disabled:cursor-not-allowed disabled:opacity-65`}
        >
          <span
            aria-hidden="true"
            className={`absolute left-1 top-1 h-9 w-9 rounded-full bg-white shadow-md transition-transform duration-200 ${
              enabled ? "translate-x-16" : "translate-x-0"
            }`}
          />
          <span
            className={`absolute inset-0 flex items-center text-xs font-extrabold tracking-[0.12em] ${
              enabled ? "justify-start pl-4" : "justify-end pr-4"
            }`}
          >
            {ready ? (enabled ? "ON" : "OFF") : "..."}
          </span>
        </button>
      </div>
      {status && <p role="status" className="mt-3 text-sm text-emerald-200">{status}</p>}
      {error && <p role="alert" className="mt-3 text-sm text-red-200">{error}</p>}
    </section>
  );
}
