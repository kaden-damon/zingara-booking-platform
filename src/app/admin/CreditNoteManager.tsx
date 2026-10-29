"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { fetchSupabaseApi } from "@/lib/supabase/apiClient";
import { calculateXeroDocumentTotals, type XeroCalculatedLine, type XeroLineAmountType } from "@/lib/xero/documentMath";

type Credit = {
  created_at: string;
  id: string;
  local_reference: string;
  reason: string;
  status: string;
  sync_status: string;
  total_cents: number;
  xero_credit_note_number: string | null;
  xero_status: string | null;
};
type Invoice = {
  creditable: boolean;
  customer_name: string;
  id: string;
  line_amount_type: XeroLineAmountType;
  lines: XeroCalculatedLine[];
  local_reference: string;
  previouslyCreditedCents: number;
  remainingCreditCents: number;
  total_cents: number;
  xero_document_number: string | null;
  xero_status: string | null;
};
type Refund = {
  completed_at: string | null;
  id: string;
  provider_refund_id: string | null;
  refund_amount: number;
  refund_reason: string;
  refund_status: string;
  requested_at: string;
};
type Payload = {
  booking: { amount_paid: number; balance_outstanding: number; payment_status: string; total_amount: number };
  credits: Credit[];
  invoices: Invoice[];
  payments: Array<{ amount: number; id: string; payment_method: string; payment_status: string }>;
  postingAuthorised: boolean;
  refunds: Refund[];
};

const secondary = "inline-flex min-h-10 items-center justify-center rounded-full border border-[#D8C36A]/40 px-4 py-2 text-xs font-semibold text-[#F2D66C] transition hover:border-[#F2D66C] hover:bg-[#D8C36A] hover:text-black disabled:cursor-not-allowed disabled:opacity-45";
const primary = "inline-flex min-h-10 items-center justify-center rounded-full bg-[#D8C36A] px-5 py-2 text-xs font-bold text-black transition hover:bg-[#F2D66C] disabled:cursor-not-allowed disabled:opacity-45";

function money(cents: number) {
  return new Intl.NumberFormat("en-ZA", { currency: "ZAR", style: "currency" }).format(cents / 100);
}
function label(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function CreditNoteManager({ bookingReference, close, saved }: { bookingReference: string; close: () => void; saved: () => void }) {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [invoiceId, setInvoiceId] = useState("");
  const [refundId, setRefundId] = useState("");
  const [reason, setReason] = useState("");
  const [selected, setSelected] = useState<Record<number, boolean>>({});
  const [quantities, setQuantities] = useState<Record<number, string>>({});
  const [unitPrices, setUnitPrices] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState(false);
  const [reviewedId, setReviewedId] = useState<string | null>(null);

  const chooseInvoice = useCallback((next: Invoice) => {
    setInvoiceId(next.id);
    setSelected(Object.fromEntries(next.lines.map((_, index) => [index, true])));
    setQuantities(Object.fromEntries(next.lines.map((line, index) => [index, line.quantity])));
    setUnitPrices(Object.fromEntries(next.lines.map((line, index) => [index, line.unitPrice])));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await fetchSupabaseApi<Payload>(`/api/admin/xero/credit-notes?bookingReference=${encodeURIComponent(bookingReference)}`, { cache: "no-store" });
      setPayload(result);
      const first = result.invoices.find((invoice) => invoice.creditable && invoice.remainingCreditCents > 0);
      if (first) chooseInvoice(first);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Credit notes could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [bookingReference, chooseInvoice]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const invoice = payload?.invoices.find((item) => item.id === invoiceId) ?? null;
  const selections = useMemo(() => invoice?.lines.flatMap((line, index) => selected[index] ? [{ lineIndex: index, quantity: quantities[index] ?? line.quantity, unitPrice: unitPrices[index] ?? line.unitPrice }] : []) ?? [], [invoice, quantities, selected, unitPrices]);
  const totals = useMemo(() => {
    if (!invoice || !selections.length) return null;
    try {
      return calculateXeroDocumentTotals(selections.map((selection) => ({
        ...invoice.lines[selection.lineIndex], quantity: selection.quantity, unitPrice: selection.unitPrice,
      })), invoice.line_amount_type);
    } catch { return null; }
  }, [invoice, selections]);

  async function saveDraft() {
    if (!invoice || !totals || totals.totalCents > invoice.remainingCreditCents || reason.trim().length < 3) return;
    setBusy(true); setError("");
    try {
      await fetchSupabaseApi("/api/admin/xero/credit-notes", {
        body: { idempotencyKey: crypto.randomUUID(), invoiceId: invoice.id, reason, refundId: refundId || null, selections },
        method: "POST",
      });
      await load();
      setReason(""); setRefundId("");
      saved();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "The credit-note draft could not be saved.");
    } finally { setBusy(false); }
  }

  return <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/85 p-3">
    <button type="button" aria-label="Close credit notes" onClick={close} className="absolute inset-0" />
    <section role="dialog" aria-modal="true" aria-labelledby="credit-note-title" className="relative z-10 max-h-[94dvh] w-full max-w-4xl overflow-y-auto rounded-2xl border border-[#D8C36A]/35 bg-zinc-950 p-4 shadow-2xl sm:p-5">
      <header className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase text-[#D8C36A]">Financial Documents</p><h3 id="credit-note-title" className="mt-1 text-xl font-bold text-white">Credit Notes</h3><p className="mt-1 text-sm text-zinc-400">{bookingReference}</p></div><button type="button" onClick={close} className={secondary}>Close</button></header>
      {loading ? <p className="mt-5 text-sm text-zinc-400">Loading credit information...</p> : error && !payload ? <div className="mt-5"><p className="text-sm text-rose-200">{error}</p><button type="button" onClick={() => void load()} className={`${secondary} mt-3`}>Retry</button></div> : payload ? <>
        <div className="mt-5 grid gap-3 sm:grid-cols-4"><div className="rounded-xl border border-white/10 p-3"><p className="text-xs text-zinc-500">Booking value</p><p className="mt-1 font-semibold text-white">{money(Math.round(Number(payload.booking.total_amount) * 100))}</p></div><div className="rounded-xl border border-white/10 p-3"><p className="text-xs text-zinc-500">Verified paid</p><p className="mt-1 font-semibold text-white">{money(Math.round(Number(payload.booking.amount_paid) * 100))}</p></div><div className="rounded-xl border border-white/10 p-3"><p className="text-xs text-zinc-500">Refunded / processing</p><p className="mt-1 font-semibold text-white">{money(Math.round(payload.refunds.filter((refund) => refund.refund_status !== "failed").reduce((total, refund) => total + Number(refund.refund_amount), 0) * 100))}</p></div><div className="rounded-xl border border-white/10 p-3"><p className="text-xs text-zinc-500">Remaining refundable</p><p className="mt-1 font-semibold text-white">{money(Math.max(0, Math.round((Number(payload.booking.amount_paid) - payload.refunds.filter((refund) => refund.refund_status !== "failed").reduce((total, refund) => total + Number(refund.refund_amount), 0)) * 100)))}</p></div></div>
        <div className="mt-6"><label className="text-xs font-semibold uppercase text-zinc-400">Original invoice<select className="mt-2 h-11 w-full rounded-xl border border-white/15 bg-black px-3 text-sm text-white" value={invoiceId} onChange={(event) => { const next = payload.invoices.find((item) => item.id === event.target.value); if (next) chooseInvoice(next); }}><option value="">Choose invoice</option>{payload.invoices.map((item) => <option key={item.id} value={item.id} disabled={!item.creditable || item.remainingCreditCents <= 0}>{item.xero_document_number ?? item.local_reference} · {money(item.total_cents)} · {money(item.remainingCreditCents)} remaining</option>)}</select></label></div>
        {invoice && <div className="mt-5 space-y-4"><div className="grid gap-2 rounded-xl border border-[#D8C36A]/25 bg-[#D8C36A]/5 p-4 text-sm sm:grid-cols-3"><p><span className="block text-xs text-zinc-500">Original invoice</span>{invoice.xero_document_number ?? invoice.local_reference}</p><p><span className="block text-xs text-zinc-500">Previously credited</span>{money(invoice.previouslyCreditedCents)}</p><p><span className="block text-xs text-zinc-500">Remaining creditable</span>{money(invoice.remainingCreditCents)}</p></div>
          <div><h4 className="text-sm font-semibold text-white">Invoice lines</h4><div className="mt-2 space-y-2">{invoice.lines.map((line, index) => <div key={index} className="grid gap-3 rounded-xl border border-white/10 p-3 sm:grid-cols-[auto_1fr_110px_130px]"><input aria-label={`Credit ${line.description}`} type="checkbox" checked={Boolean(selected[index])} onChange={(event) => setSelected((current) => ({ ...current, [index]: event.target.checked }))} className="mt-3 h-5 w-5 accent-[#D8C36A]" /><p className="text-sm text-white">{line.description}<span className="block text-xs text-zinc-500">Original: {line.quantity} × {money(Math.round(Number(line.unitPrice) * 100))}</span></p><label className="text-xs text-zinc-500">Quantity<input disabled={!selected[index]} value={quantities[index] ?? line.quantity} onChange={(event) => setQuantities((current) => ({ ...current, [index]: event.target.value }))} className="mt-1 h-10 w-full rounded-lg border border-white/15 bg-black px-3 text-white" /></label><label className="text-xs text-zinc-500">Unit credit<input disabled={!selected[index]} value={unitPrices[index] ?? line.unitPrice} onChange={(event) => setUnitPrices((current) => ({ ...current, [index]: event.target.value }))} className="mt-1 h-10 w-full rounded-lg border border-white/15 bg-black px-3 text-white" /></label></div>)}</div></div>
          <label className="block text-xs font-semibold uppercase text-zinc-400">Related refund evidence<select value={refundId} onChange={(event) => setRefundId(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-white/15 bg-black px-3 text-sm text-white"><option value="">No verified refund selected</option>{payload.refunds.map((refund) => <option key={refund.id} value={refund.id}>{label(refund.refund_status)} · {new Intl.NumberFormat("en-ZA", { currency: "ZAR", style: "currency" }).format(Number(refund.refund_amount))} · {refund.provider_refund_id ?? "reference pending"}</option>)}</select></label>
          <label className="block text-xs font-semibold uppercase text-zinc-400">Reason<textarea value={reason} onChange={(event) => setReason(event.target.value)} maxLength={1000} className="mt-2 min-h-24 w-full rounded-xl border border-white/15 bg-black p-3 text-sm text-white" /></label>
          <div className="ml-auto max-w-sm rounded-xl border border-white/10 p-4 text-sm"><p className="flex justify-between"><span className="text-zinc-500">Credit subtotal</span><span>{totals ? money(totals.subtotalCents) : "Review lines"}</span></p><p className="mt-2 flex justify-between"><span className="text-zinc-500">VAT</span><span>{totals ? money(totals.taxCents) : "-"}</span></p><p className="mt-3 flex justify-between border-t border-white/10 pt-3 font-bold text-[#F2D66C]"><span>Credit total</span><span>{totals ? money(totals.totalCents) : "-"}</span></p>{totals && totals.totalCents > invoice.remainingCreditCents && <p className="mt-2 text-xs text-rose-200">The credit exceeds the remaining invoice value.</p>}</div>
          {error && <p role="alert" className="text-sm text-rose-200">{error}</p>}
          <div className="flex flex-wrap justify-end gap-2"><button type="button" disabled className={secondary} title="Live posting is awaiting accounting approval">Create in Xero</button><button type="button" disabled={busy || !totals || totals.totalCents > invoice.remainingCreditCents || reason.trim().length < 3} onClick={() => void saveDraft()} className={primary}>{busy ? "Saving..." : "Save Draft"}</button></div><p className="text-right text-xs text-zinc-500">Saving records an accounting draft only. It never returns money to a customer. Xero posting is disabled.</p>
        </div>}
        <div className="mt-7 border-t border-white/10 pt-5"><h4 className="text-sm font-semibold text-white">Existing credit notes</h4>{payload.credits.length ? <div className="mt-3 space-y-2">{payload.credits.map((credit) => <article key={credit.id} className="rounded-xl border border-white/10 p-3"><div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-semibold text-white">{credit.xero_credit_note_number ?? credit.local_reference}</p><p className="mt-1 text-xs text-zinc-400">{label(credit.status)} · {label(credit.sync_status)}</p></div><div className="flex items-center gap-2"><span className="font-semibold text-[#F2D66C]">{money(credit.total_cents)}</span><button type="button" onClick={() => setReviewedId((current) => current === credit.id ? null : credit.id)} className={secondary}>{reviewedId === credit.id ? "Hide Review" : "Review Credit Note"}</button></div></div>{reviewedId === credit.id && <div className="mt-3 border-t border-white/10 pt-3 text-sm"><p className="text-zinc-300"><span className="text-zinc-500">Reason: </span>{credit.reason}</p><p className="mt-1 text-zinc-300"><span className="text-zinc-500">Created: </span>{new Date(credit.created_at).toLocaleString("en-ZA")}</p><p className="mt-1 text-zinc-300"><span className="text-zinc-500">Xero: </span>{credit.xero_status ? label(credit.xero_status) : "Not submitted"}</p></div>}</article>)}</div> : <p className="mt-2 text-sm text-zinc-500">No credit notes are linked to this booking.</p>}</div>
      </> : null}
    </section>
  </div>;
}
