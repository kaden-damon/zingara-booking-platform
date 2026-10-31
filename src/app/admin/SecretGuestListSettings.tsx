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
      setStatus(`The Secret Guest List is now ${enabled ? "ON" : "OFF"}.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The setting could not be saved.");
    } finally {
      setLoading(false);
    }
  }

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
          aria-checked={feature?.enabled ?? false}
          aria-label="The Secret Guest List"
          disabled={loading || !feature}
          onClick={() => void update(!feature?.enabled)}
          className={`flex h-11 w-24 shrink-0 items-center rounded-full border px-1.5 transition ${
            feature?.enabled
              ? "justify-end border-emerald-300/40 bg-emerald-300/15 text-emerald-100"
              : "justify-start border-white/15 bg-black/40 text-zinc-500"
          } disabled:cursor-not-allowed disabled:opacity-45`}
        >
          <span className="flex h-8 min-w-10 items-center justify-center rounded-full bg-current px-2 text-xs font-bold text-black">
            {feature?.enabled ? "ON" : "OFF"}
          </span>
        </button>
      </div>
      {status && <p role="status" className="mt-3 text-sm text-emerald-200">{status}</p>}
      {error && <p role="alert" className="mt-3 text-sm text-red-200">{error}</p>}
    </section>
  );
}
