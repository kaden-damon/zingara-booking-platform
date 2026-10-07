"use client";

import { useState } from "react";

import {
  getCorporateBuyoutBootstrap,
  releaseCorporateBuyout,
  type CorporateBuyoutBootstrap,
  type CorporateBuyoutShowOption,
} from "@/lib/supabase/corporateBuyouts";

type Props = { onChanged?: () => Promise<unknown> | void };

function showLabel(show: CorporateBuyoutShowOption) {
  return `${show.venue} · ${show.date} · ${show.time.slice(0, 5)}`;
}

export default function CorporateBuyoutManager({ onChanged }: Props) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<CorporateBuyoutBootstrap | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [releaseTarget, setReleaseTarget] =
    useState<CorporateBuyoutShowOption | null>(null);
  const [releaseReason, setReleaseReason] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      setData(await getCorporateBuyoutBootstrap());
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Full Show Buyouts could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function releaseBuyout() {
    const buyout = releaseTarget?.activeBuyout;
    if (!buyout || !releaseReason.trim()) return;
    setSaving(true);
    setError("");
    try {
      await releaseCorporateBuyout({
        buyoutId: buyout.id,
        expectedRevision: buyout.revision,
        reason: releaseReason.trim(),
      });
      setReleaseTarget(null);
      setReleaseReason("");
      await onChanged?.();
      await load();
    } catch (releaseError) {
      setError(
        releaseError instanceof Error
          ? releaseError.message
          : "The Full Show Buyout could not be released.",
      );
    } finally {
      setSaving(false);
    }
  }

  const activeShows =
    data?.shows.filter((show) => Boolean(show.activeBuyout)) ?? [];

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          void load();
        }}
        className="min-h-11 rounded-full border border-[#D8C36A]/45 px-4 py-2 text-sm font-semibold text-[#F2D66C] transition hover:bg-[#D8C36A] hover:text-black"
      >
        Manage Buyouts
      </button>

      {open && (
        <div className="fixed inset-0 z-[170] flex items-center justify-center bg-black/80 p-3 backdrop-blur-sm sm:p-6">
          <section
            aria-labelledby="buyout-manager-title"
            aria-modal="true"
            role="dialog"
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-[#D8C36A]/35 bg-[#080808] p-5 shadow-2xl sm:p-7"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#D8C36A]">
                  Corporate
                </p>
                <h2 id="buyout-manager-title" className="mt-1 text-2xl font-bold text-white">
                  Active Full Show Buyouts
                </h2>
              </div>
              <button
                type="button"
                aria-label="Close Buyout manager"
                onClick={() => setOpen(false)}
                className="grid h-11 w-11 place-items-center rounded-full border border-white/15 text-xl text-zinc-300"
              >
                ×
              </button>
            </div>

            {error && (
              <p role="alert" className="mt-4 rounded-xl border border-red-400/35 bg-red-950/30 p-3 text-sm text-red-100">
                {error}
              </p>
            )}
            {loading ? (
              <p className="mt-6 text-sm text-zinc-400">Loading Buyouts...</p>
            ) : activeShows.length === 0 ? (
              <p className="mt-6 rounded-xl border border-white/10 bg-black/35 p-4 text-sm text-zinc-300">
                No active Full Show Buyouts.
              </p>
            ) : (
              <div className="mt-6 space-y-3">
                {activeShows.map((show) => (
                  <div key={show.id} className="flex flex-col gap-3 rounded-xl border border-[#D8C36A]/20 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-white">
                        {show.activeBuyout?.companyName} · {show.activeBuyout?.packageName}
                      </p>
                      <p className="mt-1 text-xs text-zinc-400">
                        {showLabel(show)} · {show.activeBuyout?.currentGuestCount} guests
                      </p>
                    </div>
                    {data?.canCreate && (
                      <button type="button" onClick={() => setReleaseTarget(show)} className="min-h-11 rounded-full border border-red-300/30 px-4 py-2 text-xs font-bold text-red-100">
                        Release Buyout
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {releaseTarget?.activeBuyout && (
        <div className="fixed inset-0 z-[185] flex items-center justify-center bg-black/85 p-4">
          <section aria-labelledby="release-buyout-title" aria-modal="true" role="alertdialog" className="w-full max-w-lg rounded-2xl border border-red-300/30 bg-[#090909] p-6 shadow-2xl">
            <h2 id="release-buyout-title" className="text-xl font-bold text-white">Release this Full Show Buyout?</h2>
            <p className="mt-3 text-sm leading-6 text-zinc-300">{releaseTarget.activeBuyout.bookingReference} · {releaseTarget.activeBuyout.companyName}</p>
            <p className="mt-2 text-sm leading-6 text-amber-100">The booking will be cancelled and public booking will follow the performance&apos;s normal status, dates and capacity. Payments must be reviewed first.</p>
            <label className="mt-4 block text-sm font-semibold text-zinc-300">
              Reason
              <textarea value={releaseReason} onChange={(event) => setReleaseReason(event.target.value)} rows={3} className="mt-1 w-full rounded-xl border border-white/15 bg-black/55 p-3 text-sm text-white outline-none focus:border-[#D8C36A]/70" />
            </label>
            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button type="button" disabled={saving} onClick={() => { setReleaseTarget(null); setReleaseReason(""); }} className="min-h-11 rounded-full border border-white/15 px-5 py-3 text-sm font-semibold text-zinc-200">Cancel</button>
              <button type="button" disabled={saving || !releaseReason.trim()} onClick={() => void releaseBuyout()} className="min-h-11 rounded-full bg-red-200 px-6 py-3 text-sm font-bold text-red-950 disabled:opacity-50">{saving ? "Releasing..." : "Release Buyout"}</button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
