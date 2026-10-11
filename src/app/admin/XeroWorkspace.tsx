"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { createZingaraTextPdf } from "@/lib/exports/zingaraTextPdf";
import { fetchSupabaseApi } from "@/lib/supabase/apiClient";
import { calculateXeroDocumentTotals, type XeroDocumentLineInput, type XeroLineAmountType } from "@/lib/xero/documentMath";

type DocumentRow = {
  created_at: string;
  customer_name: string;
  document_date: string;
  id: string;
  kind: "invoice" | "quote";
  local_reference: string;
  source_booking_reference: string | null;
  status: string;
  sync_status: string;
  total_cents: number;
  venue: string;
  version: number;
  xero_document_number: string | null;
  xero_status: string | null;
};
type DocumentDetail = DocumentRow & {
  accepted_by: string | null;
  acceptance_evidence: string | null;
  billing_address: string | null;
  customer_email: string | null;
  customer_notes: string | null;
  guest_count: number | null;
  performance_date: string | null;
  performance_time: string | null;
  seating_summary: string | null;
  lines: Array<XeroDocumentLineInput & { subtotalCents: number; taxCents: number; totalCents: number }>;
  payment_terms: string | null;
  subtotal_cents: number;
  tax_cents: number;
  valid_until: string | null;
};

type WorkspacePayload = {
  canCreateInvoice: boolean;
  canManageConnection: boolean;
  connection: { last_sync_at: string | null; status: string; sync_paused: boolean; tenant_name: string | null };
  documents: DocumentRow[];
  mappings: Array<{ account_code: string | null; approved_at: string | null; category: string; tax_code: string | null }>;
  outboxAttentionCount: number;
  page: number;
  pageSize: number;
  total: number;
};

const emptyLine = (): XeroDocumentLineInput => ({ description: "", quantity: "1", taxCode: null, taxRatePercent: null, unitPrice: "0.0000" });
const inputClass = "mt-1 min-h-11 w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-white outline-none transition focus:border-[#D8C36A] focus:ring-2 focus:ring-[#D8C36A]/20";
const labelClass = "text-xs font-semibold uppercase text-zinc-400";

function money(cents: number) {
  return new Intl.NumberFormat("en-ZA", { currency: "ZAR", style: "currency" }).format(cents / 100);
}

function venueLabel(value: string) {
  return value === "johannesburg" ? "Johannesburg" : "Cape Town";
}

function downloadDocumentPdf(document: DocumentDetail) {
  const bytes = createZingaraTextPdf({
    footer: "Local Zingara operational document. Not issued by Xero.",
    sections: [
      { title: "Customer", rows: [
        { label: "Customer / Company", value: document.customer_name },
        { label: "Email", value: document.customer_email || "Not recorded" },
        { label: "Billing address", value: document.billing_address || "Not recorded" },
      ] },
      { title: "Event", rows: [
        { label: "Venue", value: venueLabel(document.venue) },
        { label: "Performance", value: [document.performance_date, document.performance_time].filter(Boolean).join(" at ") || "Not linked" },
        { label: "Guests", value: document.guest_count === null ? "Not recorded" : String(document.guest_count) },
        { label: "Seating", value: document.seating_summary || "Not recorded" },
        { label: "Booking", value: document.source_booking_reference || "Not linked" },
      ] },
      { title: "Lines", rows: document.lines.map((line) => ({
        value: `${line.description} | ${line.quantity} x ${line.unitPrice} | ${money(line.totalCents)}`,
      })) },
      { title: "Totals", rows: [
        { label: "Subtotal", value: money(document.subtotal_cents) },
        { label: "VAT", value: money(document.tax_cents) },
        { label: "Total", value: money(document.total_cents) },
      ] },
      { title: "Terms", rows: [
        { label: "Valid until", value: document.valid_until || "Not set" },
        { label: "Payment terms", value: document.payment_terms || "Not set" },
        { label: "Customer notes", value: document.customer_notes || "None" },
      ] },
    ],
    subtitle: `${document.local_reference} | ${document.document_date} | ${document.customer_name}`,
    title: document.kind === "quote" ? "Cost Estimate Quote" : "Local Invoice Draft",
  });
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
  const anchor = window.document.createElement("a");
  anchor.href = url;
  anchor.download = `${document.local_reference}.pdf`;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export default function XeroWorkspace({ initialBookingReference = "", mode = "settings" }: { initialBookingReference?: string; mode?: "reports" | "settings" }) {
  const [payload, setPayload] = useState<WorkspacePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [kind, setKind] = useState<"invoice" | "quote">("quote");
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [billingAddress, setBillingAddress] = useState("");
  const [bookingReference, setBookingReference] = useState(initialBookingReference);
  const [venue, setVenue] = useState<"cape-town" | "johannesburg">("cape-town");
  const [documentDate, setDocumentDate] = useState(new Date().toISOString().slice(0, 10));
  const [validUntil, setValidUntil] = useState("");
  const [performanceDate, setPerformanceDate] = useState("");
  const [performanceTime, setPerformanceTime] = useState("");
  const [seatingSummary, setSeatingSummary] = useState("");
  const [guestCount, setGuestCount] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("");
  const [customerNotes, setCustomerNotes] = useState("");
  const [internalNotes, setInternalNotes] = useState("");
  const [amountType, setAmountType] = useState<XeroLineAmountType>("no-tax");
  const [lines, setLines] = useState<XeroDocumentLineInput[]>([emptyLine()]);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<DocumentDetail | null>(null);
  const [acceptedBy, setAcceptedBy] = useState("");
  const [acceptanceEvidence, setAcceptanceEvidence] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setPayload(await fetchSupabaseApi<WorkspacePayload>("/api/admin/xero?pageSize=20", { cache: "no-store" }));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Xero details couldn't be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  const totals = useMemo(() => {
    try { return calculateXeroDocumentTotals(lines, amountType); } catch { return null; }
  }, [amountType, lines]);

  function updateLine(index: number, key: keyof XeroDocumentLineInput, value: string | null) {
    setLines((current) => current.map((line, lineIndex) => lineIndex === index ? { ...line, [key]: value } : line));
  }

  function moveLine(index: number, direction: -1 | 1) {
    setLines((current) => {
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= current.length) return current;
      const next = [...current];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      return next;
    });
  }

  async function saveDraft() {
    setBusy(true);
    setError("");
    try {
      await fetchSupabaseApi("/api/admin/xero", { method: "POST", body: {
        billingAddress, customerEmail, customerName, customerNotes, documentDate,
        guestCount: guestCount ? Number(guestCount) : null, internalNotes, kind,
        lineAmountType: amountType, lines, paymentTerms, performanceDate,
        performanceTime, seatingSummary, sourceBookingReference: bookingReference,
        validUntil, venue,
      } });
      setEditorOpen(false);
      setLines([emptyLine()]);
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "The draft couldn't be saved.");
    } finally { setBusy(false); }
  }

  async function openDocument(documentId: string) {
    setBusy(true);
    setError("");
    try {
      const result = await fetchSupabaseApi<{ document: DocumentDetail }>(
        `/api/admin/xero?documentId=${encodeURIComponent(documentId)}`,
        { cache: "no-store" },
      );
      setSelected(result.document);
      setAcceptedBy(result.document.accepted_by ?? "");
      setAcceptanceEvidence(result.document.acceptance_evidence ?? "");
    } catch (detailError) {
      setError(detailError instanceof Error ? detailError.message : "The document couldn't be loaded.");
    } finally {
      setBusy(false);
    }
  }

  async function documentAction(action: "accept" | "convert") {
    if (!selected) return;
    setBusy(true);
    setError("");
    try {
      await fetchSupabaseApi("/api/admin/xero", {
        body: {
          acceptedBy,
          action,
          documentId: selected.id,
          evidence: acceptanceEvidence,
          version: selected.version,
        },
        method: "PATCH",
      });
      setSelected(null);
      await load();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "The document couldn't be updated.");
    } finally {
      setBusy(false);
    }
  }

  const connectionLabel = payload?.connection.status === "not_connected" ? "Not Connected" : payload?.connection.status.replaceAll("_", " ");
  return (
    <section className="rounded-2xl border border-[#8D7A2F]/35 bg-zinc-950/80 p-4 shadow-2xl shadow-black/30 sm:p-6">
      <div className="flex flex-col gap-5 border-b border-white/10 pb-5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <Image src="/brand/zingara-logo-landing.svg" alt="Zingara" width={150} height={36} className="h-9 w-auto" />
            <span aria-hidden="true" className="text-xl text-[#D8C36A]">→</span>
            <Image src="/brand/xero-logo.png" alt="Xero" width={183} height={36} className="h-9 w-auto" />
          </div>
          <p className="mt-4 text-xs font-semibold uppercase text-[#D8C36A]">{mode === "reports" ? "Accounting" : "Settings · Integrations"}</p>
          <h2 className="mt-1 text-2xl font-bold text-white">Zingara × Xero</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">Create operational quotes and local invoice drafts now. Xero integration is ready to connect; live sync stays paused until Accounts approves the organisation and mappings.</p>
        </div>
        <div className="rounded-xl border border-amber-300/30 bg-amber-950/20 px-4 py-3 text-sm">
          <p className="font-semibold text-amber-100">{connectionLabel}</p>
          <p className="mt-1 text-xs text-amber-200/75">Live sync paused · No accounting documents sent</p>
          {payload?.canManageConnection && (
            <button
              type="button"
              disabled
              title="Xero credentials and an authorised organisation are required"
              className="mt-3 min-h-10 rounded-full border border-amber-200/25 px-4 text-xs font-semibold text-amber-100 opacity-55"
            >
              Connect Xero
            </button>
          )}
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[['Create a Quote','Flexible customer lines'],['Send & Accept','Versioned acceptance evidence'],['Convert to Invoice','Local draft until Xero issues it'],['Accounts & Reports','Differences stay visible']].map(([title,copy]) => <div key={title} className="rounded-xl border border-white/10 bg-black/30 p-4"><p className="font-semibold text-white">{title}</p><p className="mt-1 text-sm text-zinc-400">{copy}</p></div>)}
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <div><p className="text-sm font-semibold text-white">Quotes &amp; invoice drafts</p><p className="text-xs text-zinc-500">{payload?.total ?? 0} document{payload?.total === 1 ? "" : "s"} · {payload?.outboxAttentionCount ?? 0} paused or requiring attention</p></div>
        <button type="button" onClick={() => setEditorOpen(true)} className="min-h-11 rounded-full bg-[#D8C36A] px-5 py-2 text-sm font-bold text-black transition hover:bg-[#F2D66C] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F2D66C]">Create Quote</button>
      </div>
      {error && <p role="alert" className="mt-4 rounded-lg border border-red-400/30 bg-red-950/30 p-3 text-sm text-red-100">{error}</p>}
      {loading ? <p className="mt-5 text-sm text-zinc-400">Loading accounting workspace...</p> : payload?.documents.length ? (
        <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[820px] text-left text-sm"><thead className="text-xs uppercase text-zinc-500"><tr><th className="p-3">Document</th><th className="p-3">Customer</th><th className="p-3">Venue</th><th className="p-3">Total</th><th className="p-3">Status</th><th className="p-3">Xero</th><th className="p-3"><span className="sr-only">Action</span></th></tr></thead><tbody>{payload.documents.map((row) => <tr key={row.id} className="border-t border-white/10"><td className="p-3 font-semibold text-white">{row.local_reference}<span className="ml-2 text-xs font-normal text-zinc-500">{row.kind}</span></td><td className="p-3 text-zinc-300">{row.customer_name}{row.source_booking_reference ? <span className="block text-xs text-zinc-500">{row.source_booking_reference}</span> : null}</td><td className="p-3 text-zinc-300">{venueLabel(row.venue)}</td><td className="p-3 text-white">{money(row.total_cents)}</td><td className="p-3 text-zinc-300">{row.status.replaceAll("_", " ")}</td><td className="p-3 text-amber-200">{row.xero_document_number ?? "Not connected"}</td><td className="p-3"><button type="button" disabled={busy} onClick={() => void openDocument(row.id)} className="min-h-10 rounded-full border border-[#D8C36A]/40 px-4 text-xs font-semibold text-[#F2D66C] disabled:opacity-40">View</button></td></tr>)}</tbody></table></div>
      ) : <div className="mt-4 rounded-xl border border-dashed border-white/15 p-6 text-sm text-zinc-400">No quote or invoice drafts yet.</div>}

      {editorOpen && <div className="fixed inset-0 z-[180] flex items-center justify-center bg-black/85 p-3"><button type="button" aria-label="Close quote editor" onClick={() => setEditorOpen(false)} className="absolute inset-0" /><div role="dialog" aria-modal="true" aria-labelledby="xero-editor-title" className="relative z-10 flex max-h-[94vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-[#D8C36A]/35 bg-zinc-950 shadow-2xl"><header className="flex items-start justify-between gap-3 border-b border-white/10 p-4 sm:p-5"><div><p className="text-xs font-semibold uppercase text-[#D8C36A]">COST ESTIMATE QUOTE</p><h3 id="xero-editor-title" className="mt-1 text-xl font-bold text-white">Create a quote</h3><p className="mt-1 text-sm text-zinc-400">Custom service lines never create guests, tickets or seats.</p></div><button type="button" onClick={() => setEditorOpen(false)} className="min-h-11 rounded-lg border border-white/15 px-4 text-sm text-white">Close</button></header><div className="overflow-y-auto p-4 sm:p-5">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><label><span className={labelClass}>Document type</span><select className={inputClass} value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}><option value="quote">Quote</option>{payload?.canCreateInvoice && <option value="invoice">Direct invoice draft</option>}</select></label><label><span className={labelClass}>Venue</span><select className={inputClass} value={venue} onChange={(e) => setVenue(e.target.value as typeof venue)}><option value="cape-town">Cape Town</option><option value="johannesburg">Johannesburg</option></select></label><label><span className={labelClass}>Document date</span><input type="date" className={inputClass} value={documentDate} onChange={(e) => setDocumentDate(e.target.value)} /></label><label><span className={labelClass}>Valid until</span><input type="date" className={inputClass} value={validUntil} onChange={(e) => setValidUntil(e.target.value)} /></label><label><span className={labelClass}>Company / guest</span><input className={inputClass} value={customerName} onChange={(e) => setCustomerName(e.target.value)} /></label><label><span className={labelClass}>Billing email</span><input type="email" className={inputClass} value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} /></label><label><span className={labelClass}>Booking reference</span><input className={inputClass} value={bookingReference} onChange={(e) => setBookingReference(e.target.value)} /></label><label><span className={labelClass}>Pax</span><input type="number" min="0" className={inputClass} value={guestCount} onChange={(e) => setGuestCount(e.target.value)} /></label><label><span className={labelClass}>Performance date</span><input type="date" className={inputClass} value={performanceDate} onChange={(e) => setPerformanceDate(e.target.value)} /></label><label><span className={labelClass}>Show time</span><input type="time" className={inputClass} value={performanceTime} onChange={(e) => setPerformanceTime(e.target.value)} /></label><label><span className={labelClass}>Seating</span><input className={inputClass} value={seatingSummary} onChange={(e) => setSeatingSummary(e.target.value)} /></label><label><span className={labelClass}>Line amounts</span><select className={inputClass} value={amountType} onChange={(e) => setAmountType(e.target.value as XeroLineAmountType)}><option value="no-tax">No VAT configured</option><option value="exclusive">Tax exclusive</option><option value="inclusive">Tax inclusive</option></select></label></div>
        <label className="mt-4 block"><span className={labelClass}>Billing address</span><textarea className={inputClass} value={billingAddress} onChange={(e) => setBillingAddress(e.target.value)} /></label>
        <div className="mt-6 flex items-center justify-between"><h4 className="font-semibold text-white">Quote lines</h4><button type="button" onClick={() => setLines((current) => [...current, emptyLine()])} className="min-h-10 rounded-full border border-[#D8C36A]/45 px-4 text-sm font-semibold text-[#F2D66C]">Add Line</button></div>
        <div className="mt-3 space-y-3">{lines.map((line,index) => <div key={index} className="grid gap-3 rounded-xl border border-white/10 bg-black/25 p-3 md:grid-cols-[minmax(220px,2fr)_100px_150px_130px_auto]"><label><span className={labelClass}>Description</span><textarea className={inputClass} value={line.description} onChange={(e) => updateLine(index,"description",e.target.value)} /></label><label><span className={labelClass}>Units</span><input className={inputClass} inputMode="decimal" value={line.quantity} onChange={(e) => updateLine(index,"quantity",e.target.value)} /></label><label><span className={labelClass}>Unit Price</span><input className={inputClass} inputMode="decimal" value={line.unitPrice} onChange={(e) => updateLine(index,"unitPrice",e.target.value)} /></label><label><span className={labelClass}>VAT %</span><input className={inputClass} inputMode="decimal" disabled={amountType === "no-tax"} value={line.taxRatePercent ?? ""} onChange={(e) => updateLine(index,"taxRatePercent",e.target.value || null)} /></label><div className="flex items-end gap-1"><button type="button" aria-label="Move line up" onClick={() => moveLine(index,-1)} className="h-11 w-10 rounded-lg border border-white/15">↑</button><button type="button" aria-label="Move line down" onClick={() => moveLine(index,1)} className="h-11 w-10 rounded-lg border border-white/15">↓</button><button type="button" aria-label="Delete line" disabled={lines.length === 1} onClick={() => setLines((current) => current.filter((_,i) => i !== index))} className="h-11 w-10 rounded-lg border border-red-400/25 text-red-200 disabled:opacity-30">×</button></div></div>)}</div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2"><label><span className={labelClass}>Payment terms</span><textarea className={inputClass} value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} /></label><label><span className={labelClass}>Customer notes</span><textarea className={inputClass} value={customerNotes} onChange={(e) => setCustomerNotes(e.target.value)} /></label><label className="sm:col-span-2"><span className={labelClass}>Internal notes</span><textarea className={inputClass} value={internalNotes} onChange={(e) => setInternalNotes(e.target.value)} /></label></div>
        <div className="mt-5 ml-auto max-w-sm rounded-xl border border-[#D8C36A]/25 bg-black/35 p-4 text-sm"><div className="flex justify-between"><span className="text-zinc-400">Subtotal</span><span>{totals ? money(totals.subtotalCents) : "Check lines"}</span></div><div className="mt-2 flex justify-between"><span className="text-zinc-400">VAT</span><span>{totals ? money(totals.taxCents) : "—"}</span></div><div className="mt-3 flex justify-between border-t border-white/10 pt-3 text-base font-bold text-[#F2D66C]"><span>Total</span><span>{totals ? money(totals.totalCents) : "—"}</span></div></div>
      </div><footer className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 p-4 sm:p-5"><p className="text-xs text-zinc-500">Saving creates a local operational draft only. Nothing is sent to Xero or a customer.</p><button type="button" disabled={busy || !totals} onClick={() => void saveDraft()} className="min-h-11 rounded-full bg-[#D8C36A] px-5 font-bold text-black disabled:opacity-40">{busy ? "Saving..." : "Save Draft"}</button></footer></div></div>}

      {selected && <div className="fixed inset-0 z-[180] flex items-center justify-center bg-black/85 p-3"><button type="button" aria-label="Close document details" onClick={() => setSelected(null)} className="absolute inset-0" /><section role="dialog" aria-modal="true" aria-labelledby="xero-detail-title" className="relative z-10 max-h-[94vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-[#D8C36A]/35 bg-zinc-950 p-5 shadow-2xl"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase text-[#D8C36A]">{selected.kind === "quote" ? "COST ESTIMATE QUOTE" : "LOCAL INVOICE DRAFT"}</p><h3 id="xero-detail-title" className="mt-1 text-xl font-bold text-white">{selected.local_reference}</h3><p className="mt-1 text-sm text-zinc-400">{selected.customer_name} · {venueLabel(selected.venue)}</p></div><button type="button" onClick={() => setSelected(null)} className="min-h-11 rounded-lg border border-white/15 px-4">Close</button></div><div className="mt-5 space-y-2">{selected.lines.map((line,index) => <div key={index} className="grid gap-1 rounded-lg border border-white/10 bg-black/25 p-3 text-sm sm:grid-cols-[1fr_auto]"><p className="text-white">{line.description}<span className="block text-xs text-zinc-500">{line.quantity} × {line.unitPrice}</span></p><p className="font-semibold text-white">{money(line.totalCents)}</p></div>)}</div><div className="mt-4 ml-auto max-w-xs text-sm"><p className="flex justify-between"><span className="text-zinc-500">Subtotal</span><span>{money(selected.subtotal_cents)}</span></p><p className="mt-2 flex justify-between"><span className="text-zinc-500">VAT</span><span>{money(selected.tax_cents)}</span></p><p className="mt-3 flex justify-between border-t border-white/10 pt-3 font-bold text-[#F2D66C]"><span>Total</span><span>{money(selected.total_cents)}</span></p></div>{selected.kind === "quote" && selected.status !== "accepted" && selected.status !== "converted" && <div className="mt-5 grid gap-3 rounded-xl border border-white/10 p-4 sm:grid-cols-2"><label><span className={labelClass}>Accepted by</span><input className={inputClass} value={acceptedBy} onChange={(event) => setAcceptedBy(event.target.value)} /></label><label><span className={labelClass}>Acceptance evidence</span><textarea className={inputClass} value={acceptanceEvidence} onChange={(event) => setAcceptanceEvidence(event.target.value)} /></label></div>}<div className="mt-5 flex flex-wrap justify-end gap-2"><button type="button" onClick={() => downloadDocumentPdf(selected)} className="min-h-11 rounded-full border border-[#D8C36A]/45 px-5 text-sm font-semibold text-[#F2D66C]">Download PDF</button>{selected.kind === "quote" && selected.status !== "accepted" && selected.status !== "converted" && <button type="button" disabled={busy || !acceptedBy.trim() || !acceptanceEvidence.trim()} onClick={() => void documentAction("accept")} className="min-h-11 rounded-full bg-[#D8C36A] px-5 text-sm font-bold text-black disabled:opacity-40">Record Acceptance</button>}{selected.kind === "quote" && selected.status === "accepted" && <button type="button" disabled={busy} onClick={() => void documentAction("convert")} className="min-h-11 rounded-full bg-[#D8C36A] px-5 text-sm font-bold text-black disabled:opacity-40">Convert to Invoice Draft</button>}</div></section></div>}
    </section>
  );
}
