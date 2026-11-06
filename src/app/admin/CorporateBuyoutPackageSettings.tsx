"use client";

import { useEffect, useState } from "react";

import type { CorporateBuyoutPackage } from "@/lib/corporateBuyouts";
import { fetchSupabaseApi } from "@/lib/supabase/apiClient";

type VenueKey = "cape-town" | "johannesburg";
type Payload = { packagesByVenue: Record<VenueKey, CorporateBuyoutPackage[]> };
type Draft = { description: string; displayName: string; totalAmount: string };

const venues: Array<{ key: VenueKey; label: string }> = [
  { key: "cape-town", label: "Cape Town" },
  { key: "johannesburg", label: "Johannesburg" },
];

function draftOf(item: CorporateBuyoutPackage): Draft {
  return {
    description: item.description,
    displayName: item.displayName,
    totalAmount: item.totalAmount.toFixed(2),
  };
}

export default function CorporateBuyoutPackageSettings() {
  const [data, setData] = useState<Payload | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [saving, setSaving] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    fetchSupabaseApi<Payload>("/api/admin/corporate-buyout-packages", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then((payload) => {
        setData(payload);
        setDrafts(Object.fromEntries(
          venues.flatMap(({ key }) =>
            payload.packagesByVenue[key].map((item) => [`${key}:${item.code}`, draftOf(item)]),
          ),
        ));
      })
      .catch((error) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setMessage(error instanceof Error ? error.message : "Buyout packages could not be loaded.");
        }
      });
    return () => controller.abort();
  }, []);

  function update(key: string, patch: Partial<Draft>) {
    setDrafts((current) => ({ ...current, [key]: { ...current[key], ...patch } }));
    setMessage("");
  }

  async function save(venueKey: VenueKey, item: CorporateBuyoutPackage) {
    const key = `${venueKey}:${item.code}`;
    const draft = drafts[key];
    if (!draft) return;
    setSaving(key);
    setMessage("");
    try {
      const next = await fetchSupabaseApi<Payload>("/api/admin/corporate-buyout-packages", {
        body: {
          code: item.code,
          description: draft.description,
          displayName: draft.displayName,
          totalAmount: Number(draft.totalAmount),
          venueKey,
        },
        method: "PUT",
      });
      setData(next);
      const saved = next.packagesByVenue[venueKey].find((candidate) => candidate.code === item.code);
      if (saved) update(key, draftOf(saved));
      setMessage(`${venues.find((venue) => venue.key === venueKey)?.label} package saved.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The Buyout package could not be saved.");
    } finally {
      setSaving("");
    }
  }

  return (
    <section className="mt-4 rounded-xl border border-[#D8C36A]/25 bg-[#D8C36A]/5 p-4">
      <p className="text-sm font-semibold uppercase tracking-[0.14em] text-[#F2D66C]">Buyout Packages</p>
      <p className="mt-1 text-xs leading-5 text-zinc-400">Changes apply to future Buyouts only. Existing bookings keep their agreed snapshot.</p>
      {message && <p role="status" className="mt-3 text-sm text-zinc-200">{message}</p>}
      {!data ? <p className="mt-4 text-sm text-zinc-400">Loading packages...</p> : (
        <div className="mt-4 grid gap-4 xl:grid-cols-2">
          {venues.map(({ key: venueKey, label }) => (
            <fieldset key={venueKey} className="rounded-lg border border-white/10 bg-black/40 p-4">
              <legend className="px-1 font-semibold text-white">{label}</legend>
              <div className="mt-2 space-y-3">
                {data.packagesByVenue[venueKey].map((item) => {
                  const key = `${venueKey}:${item.code}`;
                  const draft = drafts[key] ?? draftOf(item);
                  return <div key={item.code} className="rounded-lg border border-white/10 p-3">
                    <label className="block text-xs font-semibold uppercase text-zinc-400">Name<input value={draft.displayName} onChange={(event) => update(key, { displayName: event.target.value })} className="mt-1 min-h-11 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm font-normal normal-case text-white" /></label>
                    <label className="mt-2 block text-xs font-semibold uppercase text-zinc-400">Description<textarea rows={2} value={draft.description} onChange={(event) => update(key, { description: event.target.value })} className="mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm font-normal normal-case text-white" /></label>
                    <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-end">
                      <label className="flex-1 text-xs font-semibold uppercase text-zinc-400">Package total (R)<input type="number" min="0.01" step="0.01" inputMode="decimal" value={draft.totalAmount} onChange={(event) => update(key, { totalAmount: event.target.value })} className="mt-1 min-h-11 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm font-normal text-white" /></label>
                      <button type="button" disabled={Boolean(saving)} onClick={() => void save(venueKey, item)} className="min-h-11 rounded-full bg-[#D8C36A] px-4 py-2 text-sm font-bold text-black disabled:opacity-45">{saving === key ? "Saving..." : "Save"}</button>
                    </div>
                  </div>;
                })}
              </div>
            </fieldset>
          ))}
        </div>
      )}
    </section>
  );
}
