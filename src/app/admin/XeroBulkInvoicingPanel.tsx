"use client";

import { useCallback, useMemo, useState } from "react";
import { fetchSupabaseApi } from "@/lib/supabase/apiClient";

type Candidate = {
  amountPaid: number;
  blockers: string[];
  bookingId: string;
  bookingReference: string;
  createdAt: string;
  customerName: string;
  existingInvoice: { id: string; localReference: string; status: string } | null;
  guestCount: number;
  outstanding: number;
  paymentPosition: "fully_paid" | "partially_paid" | "unpaid" | "unreconciled";
  paymentStatus: string;
  performanceDate: string | null;
  selectable: boolean;
  total: number;
  venue: string | null;
};
type Batch = {
  blocked_count: number;
  created_at: string;
  date_from: string;
  date_to: string;
  failed_count: number;
  id: string;
  posted_count: number;
  ready_count: number;
  selected_count: number;
  status: string;
  updated_at: string;
};
type Payload = {
  batches: Batch[];
  bulkPostingEnabled: boolean;
  candidates: Candidate[];
  page: number;
  pageSize: number;
  total: number;
};
type Progress = { batchId: string; blocked: number; failed: number; pending: number; ready: number; status: string };

const button = "inline-flex min-h-11 items-center justify-center rounded-full border border-[#D8C36A]/40 px-4 text-sm font-semibold text-[#F2D66C] transition hover:border-[#F2D66C] hover:bg-[#D8C36A]/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F2D66C] disabled:cursor-not-allowed disabled:opacity-40";
const primary = "inline-flex min-h-11 items-center justify-center rounded-full bg-[#D8C36A] px-5 text-sm font-bold text-black transition hover:bg-[#F2D66C] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F2D66C] disabled:cursor-not-allowed disabled:opacity-40";
const input = "min-h-11 w-full rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-[#D8C36A] focus:ring-2 focus:ring-[#D8C36A]/20";

function localDate(daysAgo = 0) {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return new Intl.DateTimeFormat("en-CA", { day: "2-digit", month: "2-digit", timeZone: "Africa/Johannesburg", year: "numeric" }).format(date);
}
function weekRange(offset = 0) {
  const now = new Date();
  const day = now.getDay() || 7;
  const monday = new Date(now);
  monday.setDate(now.getDate() - day + 1 + offset * 7);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const format = (date: Date) => new Intl.DateTimeFormat("en-CA", { day: "2-digit", month: "2-digit", timeZone: "Africa/Johannesburg", year: "numeric" }).format(date);
  return { from: format(monday), to: format(sunday) };
}
function money(value: number) { return new Intl.NumberFormat("en-ZA", { currency: "ZAR", style: "currency" }).format(value); }
function label(value: string) { return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }

export default function XeroBulkInvoicingPanel() {
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(() => localDate(6));
  const [to, setTo] = useState(() => localDate());
  const [payment, setPayment] = useState("all");
  const [page, setPage] = useState(1);
  const [payload, setPayload] = useState<Payload | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState<Progress | null>(null);

  const load = useCallback(async (nextPage = page) => {
    setLoading(true); setError("");
    try {
      const result = await fetchSupabaseApi<Payload>(`/api/admin/xero/bulk-invoices?from=${from}&to=${to}&payment=${encodeURIComponent(payment)}&page=${nextPage}`, { cache: "no-store" });
      setPayload(result); setPage(nextPage); setSelected(new Set());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "The booking review could not be loaded.");
    } finally { setLoading(false); }
  }, [from, page, payment, to]);

  const groups = useMemo(() => {
    const result = new Map<string, Candidate[]>();
    for (const item of payload?.candidates ?? []) {
      const day = item.createdAt.slice(0, 10);
      result.set(day, [...(result.get(day) ?? []), item]);
    }
    return [...result.entries()];
  }, [payload]);
  const selectableIds = (payload?.candidates ?? []).filter((item) => item.selectable).map((item) => item.bookingId);

  async function prepare() {
    if (!selected.size || !window.confirm(`Prepare ${selected.size} local invoice draft${selected.size === 1 ? "" : "s"}? Nothing will be sent to Xero or customers.`)) return;
    setBusy(true); setError("");
    try {
      let result = await fetchSupabaseApi<Progress>("/api/admin/xero/bulk-invoices", {
        body: JSON.stringify({ action: "prepare", bookingIds: [...selected], confirmation: "PREPARE DRAFTS", from, to }),
        method: "POST",
      });
      setProgress(result);
      while (result.pending > 0) {
        result = await fetchSupabaseApi<Progress>("/api/admin/xero/bulk-invoices", {
          body: JSON.stringify({ action: "continue", batchId: result.batchId }),
          method: "POST",
        });
        setProgress(result);
      }
      await load(page);
    } catch (prepareError) {
      setError(prepareError instanceof Error ? prepareError.message : "The invoice drafts could not be prepared.");
    } finally { setBusy(false); }
  }

  if (!open) return <div className="mt-5 border-t border-white/10 pt-5"><button type="button" className={button} onClick={() => { setOpen(true); void load(1); }}>Bulk Invoicing</button></div>;

  const pageCount = Math.max(1, Math.ceil((payload?.total ?? 0) / (payload?.pageSize ?? 50)));
  return <section className="mt-5 border-t border-white/10 pt-5" aria-labelledby="bulk-invoice-title">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase text-[#D8C36A]">Accounts</p><h3 id="bulk-invoice-title" className="mt-1 text-lg font-bold text-white">Bulk Invoicing</h3><p className="mt-1 max-w-2xl text-sm text-zinc-400">Review bookings by creation date and prepare one local invoice draft per booking.</p></div><button type="button" className={button} onClick={() => setOpen(false)}>Close</button></div>
    <div className="mt-4 flex flex-wrap gap-2"><button type="button" className={button} onClick={() => { const range = weekRange(); setFrom(range.from); setTo(range.to); }}>This Week</button><button type="button" className={button} onClick={() => { const range = weekRange(-1); setFrom(range.from); setTo(range.to); }}>Previous Week</button></div>
    <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><label><span className="text-xs font-semibold uppercase text-zinc-400">Created from</span><input type="date" value={from} onChange={(event) => setFrom(event.target.value)} className={input} /></label><label><span className="text-xs font-semibold uppercase text-zinc-400">Created to</span><input type="date" value={to} onChange={(event) => setTo(event.target.value)} className={input} /></label><label><span className="text-xs font-semibold uppercase text-zinc-400">Payment</span><select value={payment} onChange={(event) => setPayment(event.target.value)} className={input}><option value="all">All payment positions</option><option value="fully_paid">Fully paid</option><option value="deposit_paid">Deposit / partially paid</option><option value="pending_payment">Unpaid / pending</option></select></label><div className="flex items-end"><button type="button" className={`${primary} w-full`} disabled={loading || busy} onClick={() => void load(1)}>Review Bookings</button></div></div>
    <div className="mt-4 rounded-xl border border-amber-300/20 bg-amber-950/15 p-3 text-sm text-amber-100"><strong>Bulk Xero posting is off.</strong> Draft preparation is available; sending a batch to Xero requires separate accounting approval.</div>
    {error && <p role="alert" className="mt-4 rounded-xl border border-red-400/30 bg-red-950/30 p-3 text-sm text-red-100">{error}</p>}
    {progress && <p className="mt-4 rounded-xl border border-emerald-300/20 bg-emerald-950/15 p-3 text-sm text-emerald-100">Drafts ready: {progress.ready} · Blocked: {progress.blocked} · Failed: {progress.failed}{progress.pending ? ` · Remaining: ${progress.pending}` : ""}</p>}
    {loading ? <p className="mt-5 text-sm text-zinc-400">Loading eligible bookings...</p> : <>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-zinc-400">{payload?.total ?? 0} matching booking{payload?.total === 1 ? "" : "s"} · {selected.size} selected</p><div className="flex flex-wrap gap-2"><button type="button" className={button} disabled={!selectableIds.length || busy} onClick={() => setSelected(new Set(selectableIds))}>Select Page</button><button type="button" className={button} disabled={!selected.size || busy} onClick={() => setSelected(new Set())}>Clear</button><button type="button" className={primary} disabled={!selected.size || selected.size > 50 || busy} onClick={() => void prepare()}>{busy ? "Preparing..." : `Prepare ${selected.size || ""} Draft${selected.size === 1 ? "" : "s"}`}</button></div></div>
      {groups.length ? <div className="mt-4 space-y-5">{groups.map(([day, items]) => <section key={day}><h4 className="mb-2 text-sm font-bold text-[#F2D66C]">Created {new Date(`${day}T12:00:00`).toLocaleDateString("en-ZA", { dateStyle: "long" })}</h4><div className="overflow-x-auto rounded-xl border border-white/10"><table className="min-w-[920px] w-full text-left text-sm"><thead className="bg-white/[0.025] text-xs uppercase text-zinc-500"><tr><th className="p-3"><span className="sr-only">Select</span></th><th className="p-3">Booking</th><th className="p-3">Customer / Company</th><th className="p-3">Performance</th><th className="p-3">Payment</th><th className="p-3">Paid</th><th className="p-3">Outstanding</th><th className="p-3">Readiness</th></tr></thead><tbody>{items.map((item) => <tr key={item.bookingId} className="border-t border-white/10"><td className="p-3"><input aria-label={`Select ${item.bookingReference}`} type="checkbox" checked={selected.has(item.bookingId)} disabled={!item.selectable || busy} onChange={(event) => setSelected((current) => { const next = new Set(current); if (event.target.checked) next.add(item.bookingId); else next.delete(item.bookingId); return next; })} className="h-5 w-5 accent-[#D8C36A]" /></td><td className="p-3 font-semibold text-white">{item.bookingReference}<span className="block text-xs font-normal text-zinc-500">{item.guestCount} guests</span></td><td className="p-3 text-zinc-300">{item.customerName}</td><td className="p-3 text-zinc-300">{item.venue ? label(item.venue) : "Unknown"}<span className="block text-xs text-zinc-500">{item.performanceDate ?? "Date unavailable"}</span></td><td className="p-3 text-zinc-300">{label(item.paymentPosition)}</td><td className="p-3 text-white">{money(item.amountPaid)}</td><td className="p-3 text-white">{money(item.outstanding)}</td><td className="p-3">{item.selectable ? <span className="text-emerald-200">Ready</span> : <span className="text-amber-200">{item.blockers.join(" · ")}</span>}</td></tr>)}</tbody></table></div></section>)}</div> : <p className="mt-5 rounded-xl border border-dashed border-white/15 p-5 text-sm text-zinc-400">No bookings match this date range.</p>}
      <nav className="mt-4 flex items-center justify-between gap-3"><p className="text-xs text-zinc-500">Page {payload?.page ?? 1} of {pageCount}</p><div className="flex gap-2"><button type="button" className={button} disabled={(payload?.page ?? 1) <= 1 || loading} onClick={() => void load(page - 1)}>Previous</button><button type="button" className={button} disabled={(payload?.page ?? 1) >= pageCount || loading} onClick={() => void load(page + 1)}>Next</button></div></nav>
      {payload?.batches.length ? <div className="mt-6"><h4 className="text-sm font-bold text-white">Recent batches</h4><div className="mt-2 grid gap-2 sm:grid-cols-2">{payload.batches.map((batch) => <article key={batch.id} className="rounded-xl border border-white/10 bg-black/25 p-3 text-sm"><div className="flex justify-between gap-3"><span className="font-semibold text-white">{batch.selected_count} bookings</span><span className="text-[#F2D66C]">{label(batch.status)}</span></div><p className="mt-1 text-xs text-zinc-500">{batch.date_from} to {batch.date_to}</p><p className="mt-2 text-xs text-zinc-300">Ready {batch.ready_count} · Blocked {batch.blocked_count} · Failed {batch.failed_count}</p><button type="button" className={`${button} mt-3 w-full`} disabled>Send Approved Batch to Xero</button></article>)}</div></div> : null}
    </>}
  </section>;
}
