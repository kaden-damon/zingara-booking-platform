"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createXeroDocumentPdf } from "@/lib/xero/documentPdf";
import { calculateXeroDocumentTotals, type XeroDocumentLineInput, type XeroLineAmountType } from "@/lib/xero/documentMath";
import { fetchSupabaseApi } from "@/lib/supabase/apiClient";
import XeroConnectionPanel from "./XeroConnectionPanel";
import XeroBankingDocumentPanel from "./XeroBankingDocumentPanel";

type DocumentRow = {
  created_at: string; customer_name: string; document_date: string; id: string;
  kind: "invoice" | "quote"; local_reference: string; source_booking_reference: string | null;
  status: string; sync_status: string; total_cents: number; venue: string; version: number;
  xero_document_number: string | null; xero_status: string | null;
  invoice_requested_at: string | null; invoice_requested_by_staff_profile_id: string | null; invoice_requested_version: number | null;
};
type DocumentDetail = DocumentRow & {
  accepted_by: string | null; acceptance_evidence: string | null; account_number: string | null;
  billing_address: string | null; customer_email: string | null; customer_notes: string | null;
  guest_count: number | null; internal_notes: string | null; line_amount_type: XeroLineAmountType;
  lines: Array<XeroDocumentLineInput & { subtotalCents: number; taxCents: number; totalCents: number }>;
  payment_terms: string | null; performance_date: string | null; performance_time: string | null;
  seating_summary: string | null; subtotal_cents: number; tax_cents: number; valid_until: string | null;
  company_id: string | null; contact_customer_id: string | null; source_booking_id: string | null; source_corporate_request_id: string | null; source_quote_id: string | null;
};
type BookingFinancials = { amountPaid: number; bookingReference: string; bookingValue: number; outstanding: number; paymentStatus: string };
type WorkspacePayload = {
  canConvertQuote: boolean; canCreateInvoice: boolean; canCreateQuote: boolean; canManageConnection: boolean; canRequestInvoice: boolean;
  connection: { last_sync_at: string | null; status: string; sync_paused: boolean; tenant_name: string | null };
  documents: DocumentRow[]; mappings: Array<{ account_code: string | null; account_name: string | null; approved_at: string | null; category: string; tax_code: string | null; tax_name: string | null; venue: string }>;
  outboxAttentionCount: number; page: number; pageSize: number; total: number;
};
type DetailPayload = { bookingFinancials: BookingFinancials | null; document: DocumentDetail; linkedInvoice: { id: string; local_reference: string; status: string; sync_status: string; xero_document_number: string | null; xero_status: string | null } | null; versions: Array<{ created_at: string; version: number }> };
type BookingPrefill = { booking: { billingAddress: string; bookingReference: string; bookingValue: number; companyId: string | null; contactCustomerId: string | null; customerEmail: string; customerName: string; guestCount: number; outstanding: number; paid: number; paymentStatus: string; performanceDate: string; performanceTime: string; seatingSummary: string; sourceBookingId: string; venue: "cape-town" | "johannesburg" } };
type CorporatePrefill = { corporateRequest: { billingAddress: string; companyId: string | null; contactCustomerId: string | null; customerEmail: string; customerName: string; guestCount: number | null; performanceDate: string | null; seatingSummary: string | null; sourceCorporateRequestId: string; venue: "cape-town" | "johannesburg" } };

const emptyLine = (): XeroDocumentLineInput => ({ description: "", mappingCategory: "corporate", quantity: "1", taxCode: null, taxRatePercent: "15", unitPrice: "0.0000" });
const lineMappingCategories = [
  ["ticket_sales", "Ticket Sales"], ["corporate", "Corporate"], ["buyouts", "Buyout"],
  ["booking_fee", "Booking Fee"], ["gratuity", "Gratuity"], ["addons", "Add-on"], ["discounts", "Discount"],
] as const;
const inputClass = "mt-1 min-h-11 w-full rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-sm text-white outline-none transition focus:border-[#D8C36A] focus:ring-2 focus:ring-[#D8C36A]/20";
const labelClass = "text-xs font-semibold uppercase text-zinc-400";
const secondaryButton = "min-h-11 rounded-full border border-[#D8C36A]/40 px-4 text-sm font-semibold text-[#F2D66C] transition hover:border-[#F2D66C] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F2D66C] disabled:opacity-40";
const primaryButton = "min-h-11 rounded-full bg-[#D8C36A] px-5 text-sm font-bold text-black transition hover:bg-[#F2D66C] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F2D66C] disabled:opacity-40";

function money(cents: number) { return new Intl.NumberFormat("en-ZA", { currency: "ZAR", style: "currency" }).format(cents / 100); }
function venueLabel(value: string) { return value === "johannesburg" ? "Johannesburg" : "Cape Town"; }
function statusLabel(value: string) { return value === "local_only" ? "Awaiting Accounts" : value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function documentStatusLabel(document: Pick<DocumentRow, "invoice_requested_at" | "kind" | "status">) {
  if (document.kind === "quote" && document.status === "accepted" && document.invoice_requested_at) return "Invoice Requested";
  if (document.kind === "quote" && document.status === "converted") return "Invoiced";
  return statusLabel(document.status);
}
function downloadPdf(document: DocumentDetail) {
  const bytes = createXeroDocumentPdf({ accountNumber: document.account_number, billingAddress: document.billing_address,
    customerEmail: document.customer_email, customerName: document.customer_name, customerNotes: document.customer_notes,
    documentDate: document.document_date, guestCount: document.guest_count, kind: document.kind,
    lineAmountType: document.line_amount_type, lines: document.lines, localReference: document.local_reference,
    paymentTerms: document.payment_terms, performanceDate: document.performance_date, performanceTime: document.performance_time,
    seatingSummary: document.seating_summary, sourceBookingReference: document.source_booking_reference, status: document.status,
    subtotalCents: document.subtotal_cents, taxCents: document.tax_cents, totalCents: document.total_cents,
    validUntil: document.valid_until, venue: document.venue, xeroDocumentNumber: document.xero_document_number });
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
  const anchor = window.document.createElement("a"); anchor.href = url; anchor.download = `${document.local_reference}.pdf`; anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export default function XeroWorkspace({ initialBookingReference = "", initialCorporateRequestId = "", mode = "settings" }: { initialBookingReference?: string; initialCorporateRequestId?: string; mode?: "reports" | "settings" }) {
  const [payload, setPayload] = useState<WorkspacePayload | null>(null);
  const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const [page, setPage] = useState(1); const [search, setSearch] = useState(""); const [debouncedSearch, setDebouncedSearch] = useState("");
  const [kindFilter, setKindFilter] = useState("all"); const [statusFilter, setStatusFilter] = useState(() => typeof window !== "undefined" && new URLSearchParams(window.location.search).get("invoiceRequested") === "true" ? "invoice-requested" : "all"); const [venueFilter, setVenueFilter] = useState("all");
  const [editorOpen, setEditorOpen] = useState(false); const [editingId, setEditingId] = useState<string | null>(null); const [editingVersion, setEditingVersion] = useState<number | null>(null);
  const [kind, setKind] = useState<"invoice" | "quote">("quote"); const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState(""); const [billingAddress, setBillingAddress] = useState(""); const [accountNumber, setAccountNumber] = useState("");
  const [sourceBookingId, setSourceBookingId] = useState<string | null>(null); const [companyId, setCompanyId] = useState<string | null>(null); const [contactCustomerId, setContactCustomerId] = useState<string | null>(null);
  const [sourceCorporateRequestId, setSourceCorporateRequestId] = useState<string | null>(null);
  const [bookingReference, setBookingReference] = useState(initialBookingReference); const [venue, setVenue] = useState<"cape-town" | "johannesburg">("cape-town");
  const [documentDate, setDocumentDate] = useState(new Date().toISOString().slice(0, 10)); const [validUntil, setValidUntil] = useState("");
  const [performanceDate, setPerformanceDate] = useState(""); const [performanceTime, setPerformanceTime] = useState("");
  const [seatingSummary, setSeatingSummary] = useState(""); const [guestCount, setGuestCount] = useState("");
  const [paymentTerms, setPaymentTerms] = useState(""); const [customerNotes, setCustomerNotes] = useState(""); const [internalNotes, setInternalNotes] = useState("");
  const [amountType, setAmountType] = useState<XeroLineAmountType>("no-tax"); const [lines, setLines] = useState<XeroDocumentLineInput[]>([emptyLine()]);
  const [selectedPayload, setSelectedPayload] = useState<DetailPayload | null>(null); const selected = selectedPayload?.document ?? null;
  const [acceptedBy, setAcceptedBy] = useState(""); const [acceptanceEvidence, setAcceptanceEvidence] = useState("");
  const deepLinkOpened = useRef(false);

  useEffect(() => { const timer = window.setTimeout(() => { setDebouncedSearch(search.trim()); setPage(1); }, 300); return () => window.clearTimeout(timer); }, [search]);
  useEffect(() => {
    if (!payload || deepLinkOpened.current) return;
    const documentId = new URLSearchParams(window.location.search).get("quote");
    if (!documentId || !/^[0-9a-f-]{36}$/i.test(documentId)) return;
    deepLinkOpened.current = true;
    void openDocument(documentId);
  }, [payload]);
  useEffect(() => {
    if (!initialBookingReference) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const result = await fetchSupabaseApi<BookingPrefill>(`/api/admin/xero?prefillBookingReference=${encodeURIComponent(initialBookingReference)}`, { cache: "no-store", signal: controller.signal });
        const booking = result.booking;
        setSourceBookingId(booking.sourceBookingId); setCompanyId(booking.companyId); setContactCustomerId(booking.contactCustomerId);
        setBookingReference(booking.bookingReference); setCustomerName(booking.customerName); setCustomerEmail(booking.customerEmail); setBillingAddress(booking.billingAddress);
        setGuestCount(String(booking.guestCount)); setPerformanceDate(booking.performanceDate); setPerformanceTime(booking.performanceTime.slice(0,5)); setSeatingSummary(booking.seatingSummary); setVenue(booking.venue);
        setEditorOpen(true);
      } catch (prefillError) {
        if (!(prefillError instanceof DOMException && prefillError.name === "AbortError")) setError(prefillError instanceof Error ? prefillError.message : "The booking details couldn't be loaded.");
      }
    }, 0);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [initialBookingReference]);
  useEffect(() => {
    if (!initialCorporateRequestId) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const result = await fetchSupabaseApi<CorporatePrefill>(`/api/admin/xero?prefillCorporateRequestId=${encodeURIComponent(initialCorporateRequestId)}`, { cache: "no-store", signal: controller.signal });
        const request = result.corporateRequest;
        setSourceCorporateRequestId(request.sourceCorporateRequestId); setCompanyId(request.companyId); setContactCustomerId(request.contactCustomerId);
        setCustomerName(request.customerName); setCustomerEmail(request.customerEmail); setBillingAddress(request.billingAddress); setGuestCount(request.guestCount === null ? "" : String(request.guestCount));
        setPerformanceDate(request.performanceDate ?? ""); setSeatingSummary(request.seatingSummary ?? ""); setVenue(request.venue); setEditorOpen(true);
      } catch (prefillError) {
        if (!(prefillError instanceof DOMException && prefillError.name === "AbortError")) setError(prefillError instanceof Error ? prefillError.message : "The Corporate enquiry couldn't be loaded.");
      }
    }, 0);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [initialCorporateRequestId]);
  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true); setError(""); const params = new URLSearchParams({ page: String(page), pageSize: "10" });
    if (debouncedSearch) params.set("search", debouncedSearch); if (kindFilter !== "all") params.set("kind", kindFilter);
    if (statusFilter !== "all") params.set("status", statusFilter); if (venueFilter !== "all") params.set("venue", venueFilter);
    try { setPayload(await fetchSupabaseApi<WorkspacePayload>(`/api/admin/xero?${params}`, { cache: "no-store", signal })); }
    catch (loadError) { if (!(loadError instanceof DOMException && loadError.name === "AbortError")) setError(loadError instanceof Error ? loadError.message : "Accounting couldn't be loaded. Try again."); }
    finally { if (!signal?.aborted) setLoading(false); }
  }, [debouncedSearch, kindFilter, page, statusFilter, venueFilter]);
  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => void load(controller.signal), 0);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [load]);

  const totals = useMemo(() => { try { return calculateXeroDocumentTotals(lines, amountType); } catch { return null; } }, [amountType, lines]);
  const pageCount = Math.max(1, Math.ceil((payload?.total ?? 0) / (payload?.pageSize ?? 10)));
  function updateLine(index: number, key: keyof XeroDocumentLineInput, value: string | null) { setLines((current) => current.map((line, lineIndex) => lineIndex === index ? { ...line, [key]: value } : line)); }
  function moveLine(index: number, direction: -1 | 1) { setLines((current) => { const nextIndex = index + direction; if (nextIndex < 0 || nextIndex >= current.length) return current; const next = [...current]; [next[index], next[nextIndex]] = [next[nextIndex], next[index]]; return next; }); }
  function resetEditor(nextKind: "invoice" | "quote") {
    setEditingId(null); setEditingVersion(null); setKind(nextKind); setCustomerName(""); setCustomerEmail(""); setBillingAddress(""); setAccountNumber(""); setBookingReference(initialBookingReference); setSourceBookingId(null); setSourceCorporateRequestId(null); setCompanyId(null); setContactCustomerId(null);
    setVenue("cape-town"); setDocumentDate(new Date().toISOString().slice(0, 10)); setValidUntil(""); setPerformanceDate(""); setPerformanceTime(""); setSeatingSummary(""); setGuestCount("");
    setPaymentTerms(""); setCustomerNotes(""); setInternalNotes(""); setAmountType("no-tax"); setLines([emptyLine()]); setError(""); setEditorOpen(true);
  }
  function editDocument(document: DocumentDetail) {
    setEditingId(document.id); setEditingVersion(document.version); setKind(document.kind); setCustomerName(document.customer_name); setCustomerEmail(document.customer_email ?? ""); setBillingAddress(document.billing_address ?? "");
    setAccountNumber(document.account_number ?? ""); setBookingReference(document.source_booking_reference ?? ""); setVenue(document.venue as typeof venue); setDocumentDate(document.document_date); setValidUntil(document.valid_until ?? "");
    setSourceBookingId(document.source_booking_id); setCompanyId(document.company_id); setContactCustomerId(document.contact_customer_id);
    setSourceCorporateRequestId(document.source_corporate_request_id);
    setPerformanceDate(document.performance_date ?? ""); setPerformanceTime(document.performance_time?.slice(0,5) ?? ""); setSeatingSummary(document.seating_summary ?? ""); setGuestCount(document.guest_count === null ? "" : String(document.guest_count));
    setPaymentTerms(document.payment_terms ?? ""); setCustomerNotes(document.customer_notes ?? ""); setInternalNotes(document.internal_notes ?? ""); setAmountType(document.line_amount_type);
    setLines(document.lines.map(({ description, mappingCategory, quantity, taxCode, taxRatePercent, unitPrice }) => ({ description, mappingCategory: mappingCategory ?? null, quantity: String(quantity), taxCode, taxRatePercent, unitPrice: String(unitPrice) })));
    setSelectedPayload(null); setError(""); setEditorOpen(true);
  }
  async function saveDraft() {
    setBusy(true); setError("");
    try { await fetchSupabaseApi("/api/admin/xero", { method: editingId ? "PUT" : "POST", body: { accountNumber, billingAddress, companyId, contactCustomerId, customerEmail, customerName, customerNotes, documentDate, documentId: editingId,
      guestCount: guestCount ? Number(guestCount) : null, internalNotes, kind, lineAmountType: amountType, lines, paymentTerms, performanceDate, performanceTime, seatingSummary,
      sourceBookingId, sourceBookingReference: bookingReference, sourceCorporateRequestId, validUntil, venue, version: editingVersion } }); setEditorOpen(false); await load(); }
    catch (saveError) { setError(saveError instanceof Error ? saveError.message : "The draft couldn't be saved."); } finally { setBusy(false); }
  }
  async function openDocument(documentId: string) { setBusy(true); setError(""); try { const result = await fetchSupabaseApi<DetailPayload>(`/api/admin/xero?documentId=${encodeURIComponent(documentId)}`, { cache: "no-store" }); setSelectedPayload(result); setAcceptedBy(result.document.accepted_by ?? ""); setAcceptanceEvidence(result.document.acceptance_evidence ?? ""); } catch (detailError) { setError(detailError instanceof Error ? detailError.message : "The document couldn't be loaded."); } finally { setBusy(false); } }
  async function documentAction(action: "accept" | "convert" | "queue" | "request-invoice" | "send") { if (!selected) return; setBusy(true); setError(""); try { await fetchSupabaseApi("/api/admin/xero", { body: { acceptedBy, action, documentId: selected.id, evidence: acceptanceEvidence, version: selected.version }, method: "PATCH" }); setSelectedPayload(null); await load(); } catch (actionError) { setError(actionError instanceof Error ? actionError.message : "The document couldn't be updated."); } finally { setBusy(false); } }

  const connectionLabel = payload?.connection.status === "not_connected" ? "Not Connected" : statusLabel(payload?.connection.status ?? "not_connected");
  return <section className="rounded-2xl border border-[#8D7A2F]/35 bg-zinc-950/80 p-4 shadow-2xl shadow-black/30 sm:p-6">
    <div className="flex flex-col gap-5 border-b border-white/10 pb-5 lg:flex-row lg:items-start lg:justify-between"><div><div className="flex flex-wrap items-center gap-3"><Image src="/brand/zingara-logo-landing.svg" alt="Zingara" width={150} height={36} className="h-9 w-auto" /><span aria-hidden="true" className="text-xl text-[#D8C36A]">→</span><Image src="/brand/xero-logo.png" alt="Xero" width={183} height={36} className="h-9 w-auto" /></div>
      <p className="mt-4 text-xs font-semibold uppercase text-[#D8C36A]">{mode === "reports" ? "Accounting" : "Settings · Integrations"}</p><h2 className="mt-1 text-2xl font-bold text-white">Zingara × Xero</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">{payload?.connection.sync_paused === false ? "Create quotes and local invoice drafts. Authorised Accounts staff can submit eligible future invoice conversions to Xero." : "Create quotes and local invoice drafts. Live Xero creation remains paused until its security and accounting controls are approved."}</p></div>
      <div className="rounded-xl border border-amber-300/30 bg-amber-950/20 px-4 py-3 text-sm"><p className="font-semibold text-amber-100">{connectionLabel}</p><p className="mt-1 text-xs text-amber-200/75">{payload?.connection.sync_paused === false ? "Approved sync active" : "Live sync paused · Nothing sent to Xero"}</p><p className="mt-2 max-w-56 text-xs text-amber-200/65">{payload?.connection.tenant_name ? `Organisation: ${payload.connection.tenant_name}` : "An authorised Xero organisation has not been selected."}</p></div></div>
    {mode === "settings" && payload?.canManageConnection && <XeroConnectionPanel onChanged={load} />}
    {mode === "settings" && payload && <XeroBankingDocumentPanel />}
    <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[["Create a Quote","Flexible customer lines"],["Review & Accept","Recorded acceptance evidence"],["Create an Invoice","Local draft until Xero issues it"],["Accounts & Reports","Verified differences stay visible"]].map(([title,copy]) => <div key={title} className="rounded-xl border border-white/10 bg-black/30 p-4"><p className="font-semibold text-white">{title}</p><p className="mt-1 text-sm text-zinc-400">{copy}</p></div>)}</div>
    <div className="mt-5 flex flex-wrap items-end justify-between gap-3"><div><p className="text-sm font-semibold text-white">Quotes &amp; invoice drafts</p><p className="text-xs text-zinc-500">{payload?.total ?? 0} matching · {payload?.outboxAttentionCount ?? 0} awaiting Accounts attention</p></div><div className="flex flex-wrap gap-2">{payload?.canCreateQuote && <button type="button" onClick={() => resetEditor("quote")} className={primaryButton}>Create Quote</button>}{payload?.canCreateInvoice && <button type="button" onClick={() => resetEditor("invoice")} className={secondaryButton}>Create Invoice Draft</button>}</div></div>
    <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><label><span className={labelClass}>Search</span><input type="search" className={inputClass} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Reference or customer" /></label><Filter label="Document" value={kindFilter} onChange={setKindFilter} options={[["all","All documents"],["quote","Quotes"],["invoice","Invoices"]]} reset={() => setPage(1)} /><Filter label="Status" value={statusFilter} onChange={setStatusFilter} options={[["all","All statuses"],["draft","Draft"],["revised","Revised"],["accepted","Accepted"],["invoice-requested","Invoice Requested"],["converted","Invoiced"],["expired","Expired"],["superseded","Superseded"]]} reset={() => setPage(1)} /><Filter label="Venue" value={venueFilter} onChange={setVenueFilter} options={[["all","All authorised venues"],["cape-town","Cape Town"],["johannesburg","Johannesburg"]]} reset={() => setPage(1)} /></div>
    {error && <p role="alert" className="mt-4 rounded-lg border border-red-400/30 bg-red-950/30 p-3 text-sm text-red-100">{error}</p>}
    {loading ? <p className="mt-5 text-sm text-zinc-400">Loading accounting documents...</p> : payload?.documents.length ? <DocumentList payload={payload} busy={busy} openDocument={openDocument} pageCount={pageCount} setPage={setPage} /> : <div className="mt-4 rounded-xl border border-dashed border-white/15 p-6 text-sm text-zinc-400">No documents match these filters.</div>}
    {editorOpen && <Editor kind={kind} setKind={setKind} editingId={editingId} payload={payload} venue={venue} setVenue={setVenue} documentDate={documentDate} setDocumentDate={setDocumentDate} validUntil={validUntil} setValidUntil={setValidUntil} customerName={customerName} setCustomerName={setCustomerName} customerEmail={customerEmail} setCustomerEmail={setCustomerEmail} accountNumber={accountNumber} setAccountNumber={setAccountNumber} bookingReference={bookingReference} setBookingReference={setBookingReference} guestCount={guestCount} setGuestCount={setGuestCount} performanceDate={performanceDate} setPerformanceDate={setPerformanceDate} performanceTime={performanceTime} setPerformanceTime={setPerformanceTime} seatingSummary={seatingSummary} setSeatingSummary={setSeatingSummary} amountType={amountType} setAmountType={setAmountType} billingAddress={billingAddress} setBillingAddress={setBillingAddress} lines={lines} setLines={setLines} updateLine={updateLine} moveLine={moveLine} paymentTerms={paymentTerms} setPaymentTerms={setPaymentTerms} customerNotes={customerNotes} setCustomerNotes={setCustomerNotes} internalNotes={internalNotes} setInternalNotes={setInternalNotes} totals={totals} busy={busy} close={() => setEditorOpen(false)} save={saveDraft} />}
    {selected && <Details payload={selectedPayload!} canConvertQuote={Boolean(payload?.canConvertQuote)} canRequestInvoice={Boolean(payload?.canRequestInvoice)} busy={busy} acceptedBy={acceptedBy} setAcceptedBy={setAcceptedBy} acceptanceEvidence={acceptanceEvidence} setAcceptanceEvidence={setAcceptanceEvidence} close={() => setSelectedPayload(null)} edit={editDocument} action={documentAction} />}
  </section>;
}

function Filter({ label, value, onChange, options, reset }: { label: string; value: string; onChange: (value: string) => void; options: string[][]; reset: () => void }) { return <label><span className={labelClass}>{label}</span><select className={inputClass} value={value} onChange={(event) => { onChange(event.target.value); reset(); }}>{options.map(([key,name]) => <option key={key} value={key}>{name}</option>)}</select></label>; }

function DocumentList({ payload, busy, openDocument, pageCount, setPage }: { payload: WorkspacePayload; busy: boolean; openDocument: (id: string) => Promise<void>; pageCount: number; setPage: React.Dispatch<React.SetStateAction<number>> }) { return <><div className="mt-4 hidden overflow-x-auto rounded-xl border border-white/10 bg-black/20 md:block"><table className="w-full text-left text-sm"><thead className="bg-white/[0.025] text-xs uppercase text-zinc-500"><tr><th className="p-3">Document</th><th className="p-3">Customer</th><th className="p-3">Venue</th><th className="p-3">Total</th><th className="p-3">Status</th><th className="p-3">Xero</th><th className="p-3"><span className="sr-only">Action</span></th></tr></thead><tbody>{payload.documents.map((row) => <tr key={row.id} className="border-t border-white/10"><td className="p-3 font-semibold text-white">{row.local_reference}<span className="ml-2 text-xs font-normal text-zinc-500">{row.kind}</span></td><td className="p-3 text-zinc-300">{row.customer_name}{row.source_booking_reference && <span className="block text-xs text-zinc-500">{row.source_booking_reference}</span>}</td><td className="p-3 text-zinc-300">{venueLabel(row.venue)}</td><td className="p-3 text-white">{money(row.total_cents)}</td><td className="p-3 text-zinc-300">{documentStatusLabel(row)}</td><td className="p-3 text-amber-200">{row.xero_document_number ?? "Not connected"}</td><td className="p-3"><button type="button" disabled={busy} onClick={() => void openDocument(row.id)} className={secondaryButton}>View</button></td></tr>)}</tbody></table></div><div className="mt-4 grid gap-3 md:hidden">{payload.documents.map((row) => <article key={row.id} className="rounded-xl border border-white/10 bg-black/25 p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-semibold text-white">{row.local_reference}</p><p className="text-xs text-zinc-500">{row.kind} · {documentStatusLabel(row)}</p></div><p className="font-semibold text-[#F2D66C]">{money(row.total_cents)}</p></div><p className="mt-3 text-sm text-zinc-300">{row.customer_name}</p><p className="mt-1 text-xs text-zinc-500">{venueLabel(row.venue)}{row.source_booking_reference ? ` · ${row.source_booking_reference}` : ""}</p><button type="button" disabled={busy} onClick={() => void openDocument(row.id)} className={`${secondaryButton} mt-4 w-full`}>View Document</button></article>)}</div><nav aria-label="Accounting document pages" className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4"><p className="text-xs text-zinc-500">Page {payload.page} of {pageCount} · {payload.total} matching</p><div className="flex gap-2"><button type="button" className={secondaryButton} disabled={payload.page <= 1} onClick={() => setPage((value) => Math.max(1,value - 1))}>Previous</button><button type="button" className={secondaryButton} disabled={payload.page >= pageCount} onClick={() => setPage((value) => Math.min(pageCount,value + 1))}>Next</button></div></nav></>; }

type EditorProps = { kind: "invoice" | "quote"; setKind: (value: "invoice" | "quote") => void; editingId: string | null; payload: WorkspacePayload | null; venue: "cape-town" | "johannesburg"; setVenue: (value: "cape-town" | "johannesburg") => void; documentDate: string; setDocumentDate: (value: string) => void; validUntil: string; setValidUntil: (value: string) => void; customerName: string; setCustomerName: (value: string) => void; customerEmail: string; setCustomerEmail: (value: string) => void; accountNumber: string; setAccountNumber: (value: string) => void; bookingReference: string; setBookingReference: (value: string) => void; guestCount: string; setGuestCount: (value: string) => void; performanceDate: string; setPerformanceDate: (value: string) => void; performanceTime: string; setPerformanceTime: (value: string) => void; seatingSummary: string; setSeatingSummary: (value: string) => void; amountType: XeroLineAmountType; setAmountType: (value: XeroLineAmountType) => void; billingAddress: string; setBillingAddress: (value: string) => void; lines: XeroDocumentLineInput[]; setLines: React.Dispatch<React.SetStateAction<XeroDocumentLineInput[]>>; updateLine: (index: number,key: keyof XeroDocumentLineInput,value: string | null) => void; moveLine: (index: number,direction: -1 | 1) => void; paymentTerms: string; setPaymentTerms: (value: string) => void; customerNotes: string; setCustomerNotes: (value: string) => void; internalNotes: string; setInternalNotes: (value: string) => void; totals: ReturnType<typeof calculateXeroDocumentTotals> | null; busy: boolean; close: () => void; save: () => Promise<void> };
function Editor(props: EditorProps) { return <div className="fixed inset-0 z-[180] flex items-center justify-center bg-black/85 p-3"><button type="button" aria-label="Close document editor" onClick={props.close} className="absolute inset-0" /><div role="dialog" aria-modal="true" aria-labelledby="xero-editor-title" className="relative z-10 flex max-h-[94vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-[#D8C36A]/35 bg-zinc-950 shadow-2xl"><header className="flex items-start justify-between gap-3 border-b border-white/10 p-4 sm:p-5"><div><p className="text-xs font-semibold uppercase text-[#D8C36A]">{props.kind === "quote" ? "COST ESTIMATE QUOTE" : "LOCAL INVOICE DRAFT"}</p><h3 id="xero-editor-title" className="mt-1 text-xl font-bold text-white">{props.editingId ? `Edit ${props.kind} draft` : props.kind === "quote" ? "Create a quote" : "Create an invoice draft"}</h3><p className="mt-1 text-sm text-zinc-400">Custom service lines never create guests, tickets or seats.</p></div><button type="button" onClick={props.close} className={secondaryButton}>Close</button></header><div className="overflow-y-auto p-4 sm:p-5"><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
    <Field label="Document type"><select disabled={Boolean(props.editingId)} className={inputClass} value={props.kind} onChange={(e) => props.setKind(e.target.value as typeof props.kind)}><option value="quote">Quote</option>{props.payload?.canCreateInvoice && <option value="invoice">Direct invoice draft</option>}</select></Field><Field label="Venue"><select className={inputClass} value={props.venue} onChange={(e) => props.setVenue(e.target.value as typeof props.venue)}><option value="cape-town">Cape Town</option><option value="johannesburg">Johannesburg</option></select></Field><TextField label="Document date" type="date" value={props.documentDate} set={props.setDocumentDate} /><TextField label="Valid until" type="date" value={props.validUntil} set={props.setValidUntil} />
    <TextField label="Company / guest" value={props.customerName} set={props.setCustomerName} /><TextField label="Billing email" type="email" value={props.customerEmail} set={props.setCustomerEmail} /><TextField label="Account number" value={props.accountNumber} set={props.setAccountNumber} /><TextField label="Booking reference" value={props.bookingReference} set={props.setBookingReference} /><TextField label="Pax" type="number" value={props.guestCount} set={props.setGuestCount} /><TextField label="Performance date" type="date" value={props.performanceDate} set={props.setPerformanceDate} /><TextField label="Show time" type="time" value={props.performanceTime} set={props.setPerformanceTime} /><TextField label="Seating" value={props.seatingSummary} set={props.setSeatingSummary} />
    <Field label="Line amounts"><select className={inputClass} value={props.amountType} onChange={(e) => props.setAmountType(e.target.value as XeroLineAmountType)}><option value="no-tax">No VAT</option><option value="exclusive">VAT exclusive</option><option value="inclusive">VAT inclusive</option></select></Field><label className="sm:col-span-2 lg:col-span-3"><span className={labelClass}>Billing address</span><input className={inputClass} value={props.billingAddress} onChange={(e) => props.setBillingAddress(e.target.value)} /></label></div>
    <div className="mt-6 flex items-center justify-between gap-3"><h4 className="font-semibold text-white">Line items</h4><button type="button" onClick={() => props.setLines((current) => [...current,emptyLine()])} className={secondaryButton}>Add Line</button></div><div className="mt-3 space-y-3">{props.lines.map((line,index) => <div key={index} className="grid gap-3 rounded-xl border border-white/10 bg-black/25 p-3 sm:grid-cols-[minmax(180px,2fr)_140px_90px_120px_90px_auto]"><Field label="Description"><textarea rows={2} className={inputClass} value={line.description} onChange={(e) => props.updateLine(index,"description",e.target.value)} /></Field><Field label="Account category"><select className={inputClass} value={line.mappingCategory ?? ""} onChange={(e) => props.updateLine(index,"mappingCategory",e.target.value || null)}><option value="">Choose</option>{lineMappingCategories.map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></Field><TextField label="Quantity" value={line.quantity} set={(value) => props.updateLine(index,"quantity",value)} /><TextField label="Unit price" value={line.unitPrice} set={(value) => props.updateLine(index,"unitPrice",value)} /><TextField label="VAT %" value={line.taxRatePercent ?? ""} set={(value) => props.updateLine(index,"taxRatePercent",value || null)} /><div className="flex items-end gap-1.5"><button type="button" aria-label="Move line up" title="Move line up" onClick={() => props.moveLine(index,-1)} className="grid h-11 w-11 place-items-center rounded-full border border-white/15 text-zinc-300 transition hover:border-[#D8C36A]/60 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F2D66C]">↑</button><button type="button" aria-label="Move line down" title="Move line down" onClick={() => props.moveLine(index,1)} className="grid h-11 w-11 place-items-center rounded-full border border-white/15 text-zinc-300 transition hover:border-[#D8C36A]/60 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F2D66C]">↓</button><button type="button" aria-label="Delete line" title="Delete line" disabled={props.lines.length === 1} onClick={() => props.setLines((current) => current.filter((_,lineIndex) => lineIndex !== index))} className="grid h-11 w-11 place-items-center rounded-full border border-red-400/25 text-red-200 transition hover:border-red-300/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-300 disabled:opacity-30">×</button></div></div>)}</div>
    <div className="mt-5 grid gap-4 sm:grid-cols-2"><AreaField label="Payment terms" value={props.paymentTerms} set={props.setPaymentTerms} /><AreaField label="Customer notes" value={props.customerNotes} set={props.setCustomerNotes} /><label className="sm:col-span-2"><span className={labelClass}>Internal notes</span><textarea className={inputClass} value={props.internalNotes} onChange={(e) => props.setInternalNotes(e.target.value)} /></label></div><div className="mt-5 ml-auto max-w-sm rounded-xl border border-[#D8C36A]/25 bg-black/35 p-4 text-sm"><p className="flex justify-between"><span className="text-zinc-400">Subtotal</span><span>{props.totals ? money(props.totals.subtotalCents) : "Check lines"}</span></p><p className="mt-2 flex justify-between"><span className="text-zinc-400">VAT</span><span>{props.totals ? money(props.totals.taxCents) : "—"}</span></p><p className="mt-3 flex justify-between border-t border-white/10 pt-3 text-base font-bold text-[#F2D66C]"><span>Total</span><span>{props.totals ? money(props.totals.totalCents) : "—"}</span></p></div></div><footer className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 p-4 sm:p-5"><p className="max-w-xl text-xs text-zinc-500">Saving creates or revises a local draft only. Nothing is sent to Xero or a customer.</p><button type="button" disabled={props.busy || !props.totals} onClick={() => void props.save()} className={primaryButton}>{props.busy ? "Saving..." : props.editingId ? "Save Changes" : "Save Draft"}</button></footer></div></div>; }

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label><span className={labelClass}>{label}</span>{children}</label>; }
function TextField({ label, value, set, type = "text" }: { label: string; value: string; set: (value: string) => void; type?: string }) { return <Field label={label}><input type={type} min={type === "number" ? "0" : undefined} className={inputClass} value={value} onChange={(e) => set(e.target.value)} /></Field>; }
function AreaField({ label, value, set }: { label: string; value: string; set: (value: string) => void }) { return <Field label={label}><textarea className={inputClass} value={value} onChange={(e) => set(e.target.value)} /></Field>; }

function Details({ payload, canConvertQuote, canRequestInvoice, busy, acceptedBy, setAcceptedBy, acceptanceEvidence, setAcceptanceEvidence, close, edit, action }: { payload: DetailPayload; canConvertQuote: boolean; canRequestInvoice: boolean; busy: boolean; acceptedBy: string; setAcceptedBy: (value: string) => void; acceptanceEvidence: string; setAcceptanceEvidence: (value: string) => void; close: () => void; edit: (document: DocumentDetail) => void; action: (action: "accept" | "convert" | "queue" | "request-invoice" | "send") => Promise<void> }) {
  const document = payload.document;
  const requestOutstanding = document.kind === "quote" && document.status === "accepted" && Boolean(document.invoice_requested_at);
  return <div className="fixed inset-0 z-[180] flex items-center justify-center bg-black/85 p-3">
    <button type="button" aria-label="Close document details" onClick={close} className="absolute inset-0" />
    <section role="dialog" aria-modal="true" aria-labelledby="xero-detail-title" className="relative z-10 max-h-[94vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-[#D8C36A]/35 bg-zinc-950 p-4 shadow-2xl sm:p-5">
      <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase text-[#D8C36A]">{document.kind === "quote" ? "COST ESTIMATE QUOTE" : "LOCAL INVOICE DRAFT"}</p><h3 id="xero-detail-title" className="mt-1 text-xl font-bold text-white">{document.local_reference}</h3><p className="mt-1 text-sm text-zinc-400">{document.customer_name} · {venueLabel(document.venue)} · {documentStatusLabel(document)}</p></div><button type="button" onClick={close} className={secondaryButton}>Close</button></div>
      {requestOutstanding && <div className="mt-4 rounded-xl border border-[#D8C36A]/30 bg-[#D8C36A]/5 p-3"><p className="text-xs font-bold uppercase tracking-[0.1em] text-[#F2D66C]">Invoice Requested</p><p className="mt-1 text-xs text-zinc-400">Accepted version {document.invoice_requested_version} · {new Date(document.invoice_requested_at!).toLocaleString("en-ZA")}</p></div>}
      {payload.linkedInvoice && <div className="mt-4 rounded-xl border border-emerald-300/25 bg-emerald-950/15 p-3"><p className="text-xs font-bold uppercase tracking-[0.1em] text-emerald-200">Invoiced</p><p className="mt-1 text-sm text-white">{payload.linkedInvoice.xero_document_number ?? payload.linkedInvoice.local_reference}</p><p className="mt-1 text-xs text-zinc-400">{statusLabel(payload.linkedInvoice.xero_status ?? payload.linkedInvoice.sync_status)}</p></div>}
      <div className="mt-5 space-y-2">{document.lines.map((line,index) => <div key={index} className="grid gap-1 rounded-lg border border-white/10 bg-black/25 p-3 text-sm sm:grid-cols-[1fr_auto]"><p className="text-white">{line.description}<span className="block text-xs text-zinc-500">{line.quantity} × {line.unitPrice}</span></p><p className="font-semibold text-white">{money(line.totalCents)}</p></div>)}</div>
      <div className="mt-4 ml-auto max-w-xs text-sm"><p className="flex justify-between"><span className="text-zinc-500">Subtotal</span><span>{money(document.subtotal_cents)}</span></p><p className="mt-2 flex justify-between"><span className="text-zinc-500">VAT</span><span>{money(document.tax_cents)}</span></p><p className="mt-3 flex justify-between border-t border-white/10 pt-3 font-bold text-[#F2D66C]"><span>Document total</span><span>{money(document.total_cents)}</span></p></div>
      {payload.bookingFinancials ? <div className="mt-5 rounded-xl border border-emerald-400/20 bg-emerald-950/15 p-4"><p className="text-xs font-semibold uppercase text-emerald-200">Verified booking financials</p><div className="mt-3 grid gap-2 text-sm sm:grid-cols-3"><p><span className="block text-zinc-500">Booking value</span>{money(Math.round(payload.bookingFinancials.bookingValue * 100))}</p><p><span className="block text-zinc-500">Paid</span>{money(Math.round(payload.bookingFinancials.amountPaid * 100))}</p><p><span className="block text-zinc-500">Outstanding</span>{money(Math.round(payload.bookingFinancials.outstanding * 100))}</p></div></div> : <p className="mt-5 rounded-lg border border-white/10 p-3 text-sm text-zinc-400">No linked booking financials. Accounts must verify paid and outstanding amounts before issuing an invoice.</p>}
      {document.kind === "quote" && !["accepted","converted"].includes(document.status) && <div className="mt-5 grid gap-3 rounded-xl border border-white/10 p-4 sm:grid-cols-2"><TextField label="Accepted by" value={acceptedBy} set={setAcceptedBy} /><AreaField label="Acceptance evidence" value={acceptanceEvidence} set={setAcceptanceEvidence} /></div>}
      <div className="mt-5 flex flex-wrap justify-end gap-2">
        {["draft","revised"].includes(document.status) && <button type="button" onClick={() => edit(document)} className={secondaryButton}>Edit Draft</button>}
        <button type="button" onClick={() => downloadPdf(document)} className={secondaryButton}>Download PDF</button>
        {document.kind === "quote" && ["draft","revised"].includes(document.status) && <button type="button" disabled={busy} onClick={() => void action("send")} className={secondaryButton}>Send Quote</button>}
        {canConvertQuote && document.kind === "invoice" && Boolean(document.source_quote_id) && ["draft","revised"].includes(document.status) && document.sync_status === "local_only" && <button type="button" disabled={busy} onClick={() => void action("queue")} className={secondaryButton}>Create in Xero</button>}
        {document.kind === "quote" && !["accepted","converted"].includes(document.status) && <button type="button" disabled={busy || !acceptedBy.trim() || !acceptanceEvidence.trim()} onClick={() => void action("accept")} className={primaryButton}>Record Acceptance</button>}
        {document.kind === "quote" && document.status === "accepted" && !document.invoice_requested_at && canRequestInvoice && <button type="button" disabled={busy} onClick={() => void action("request-invoice")} className={primaryButton}>Request Invoice</button>}
        {requestOutstanding && canConvertQuote && <button type="button" disabled={busy} onClick={() => void action("convert")} className={primaryButton}>Create Invoice Draft</button>}
      </div>
      <p className="mt-4 text-xs text-zinc-500">Version {document.version} · {payload.versions.length} saved version{payload.versions.length === 1 ? "" : "s"}</p>
    </section>
  </div>;
}
