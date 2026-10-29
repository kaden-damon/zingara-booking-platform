"use client";

import { useEffect, useState } from "react";

import { fetchSupabaseApi } from "@/lib/supabase/apiClient";

type CreditNote = {
  created_at: string;
  id: string;
  local_reference: string;
  reason: string;
  source_booking_reference: string;
  status: string;
  sync_status: string;
  total_cents: number;
  xero_credit_note_number: string | null;
};

function money(cents: number) {
  return new Intl.NumberFormat("en-ZA", { currency: "ZAR", style: "currency" }).format(cents / 100);
}
function label(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function XeroCreditNotesPanel() {
  const [payload, setPayload] = useState<{ creditNotes: CreditNote[]; postingAuthorised: boolean } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    void fetchSupabaseApi<{ creditNotes: CreditNote[]; postingAuthorised: boolean }>("/api/admin/xero/credit-notes", { cache: "no-store", signal: controller.signal })
      .then(setPayload)
      .catch((loadError) => { if (!controller.signal.aborted) setError(loadError instanceof Error ? loadError.message : "Credit notes could not be loaded."); });
    return () => controller.abort();
  }, []);

  return <section className="mt-5 border-t border-white/10 pt-5">
    <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-sm font-semibold text-white">Credit Notes</p><p className="mt-1 text-xs text-zinc-500">Accounting drafts linked to issued invoices. Refunds remain separate payment records.</p></div><span className="rounded-full border border-amber-300/25 bg-amber-950/20 px-3 py-2 text-xs font-semibold text-amber-100">Xero posting disabled</span></div>
    {error ? <p role="alert" className="mt-3 text-sm text-rose-200">{error}</p> : !payload ? <p className="mt-3 text-sm text-zinc-400">Loading credit notes...</p> : payload.creditNotes.length ? <div className="mt-3 overflow-x-auto rounded-xl border border-white/10"><table className="w-full text-left text-sm"><thead className="bg-white/[0.025] text-xs uppercase text-zinc-500"><tr><th className="p-3">Credit Note</th><th className="p-3">Booking</th><th className="p-3">Reason</th><th className="p-3">Amount</th><th className="p-3">Status</th></tr></thead><tbody>{payload.creditNotes.map((credit) => <tr key={credit.id} className="border-t border-white/10"><td className="p-3 font-semibold text-white">{credit.xero_credit_note_number ?? credit.local_reference}</td><td className="p-3 text-zinc-300">{credit.source_booking_reference}</td><td className="max-w-xs p-3 text-zinc-300">{credit.reason}</td><td className="p-3 text-white">{money(credit.total_cents)}</td><td className="p-3 text-zinc-300">{label(credit.status)} · {label(credit.sync_status)}</td></tr>)}</tbody></table></div> : <p className="mt-3 rounded-xl border border-dashed border-white/15 p-4 text-sm text-zinc-500">No credit-note drafts have been prepared.</p>}
  </section>;
}
