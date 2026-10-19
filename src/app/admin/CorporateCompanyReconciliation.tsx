"use client";

import { useEffect, useMemo, useState } from "react";
import { emptyCompanyInput } from "@/lib/companyMaster";
import { fetchSupabaseApi } from "@/lib/supabase/apiClient";
import { getAdminAuthSession } from "@/lib/supabase/auth";
import { getCompanyPage, saveCompany } from "@/lib/supabase/companies";

type CompanyOption = { id: string; legalName: string; tradingName: string | null };
type ReconciliationRow = {
  booking_reference: string;
  created_at: string;
  currentCompany: { id: string; legal_name: string; trading_name: string | null } | null;
  customer_name: string;
  exception_type: "conflicting_company" | "insufficient_evidence";
  id: string;
  management_notes: string | null;
  original_company_evidence: string | null;
  reason: string;
  resolution_company_id: string | null;
  reviewed_at: string | null;
  reviewed_by_name: string | null;
  revision: number;
  status: "needs_review" | "resolved";
  venue: string;
};

type Payload = {
  page: number;
  pageSize: number;
  rows: ReconciliationRow[];
  total: number;
  totals: { all: number; conflicting: number; insufficient: number; unresolved: number };
};

type Evidence = {
  booking: {
    booking_origin: string | null;
    booking_reference: string;
    booking_source: string | null;
    company_name: string | null;
    created_at: string;
  };
  events: Array<{ action: string; actor_name: string | null; created_at: string; reason: string | null }>;
  originalCompanyEvidence: string | null;
  reason: string;
};

const inputClass = "h-10 w-full rounded-xl border border-white/15 bg-black px-3 text-sm text-white outline-none focus:border-[#D8C36A]/70";
const secondaryButton = "min-h-9 rounded-full border border-white/15 px-3 py-2 text-xs font-semibold text-zinc-200 transition hover:bg-white hover:text-black disabled:opacity-40";

export default function CorporateCompanyReconciliation(props: {
  onOpenBooking: (bookingReference: string) => void;
}) {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [page, setPage] = useState(1);
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("needs_review");
  const [exceptionFilter, setExceptionFilter] = useState("all");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [reviewRow, setReviewRow] = useState<ReconciliationRow | null>(null);
  const [companySearch, setCompanySearch] = useState("");
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState("");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [createCompanyName, setCreateCompanyName] = useState("");
  const [evidence, setEvidence] = useState<{ id: string; value: Evidence | null; loading: boolean } | null>(null);

  const params = useMemo(() => new URLSearchParams({
    exceptionType: exceptionFilter,
    page: String(page),
    search,
    status: statusFilter,
  }), [exceptionFilter, page, search, statusFilter]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setPage(1);
      setSearch(searchDraft.trim());
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchDraft]);

  useEffect(() => {
    const controller = new AbortController();
    // The loading state follows this external request lifecycle.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setMessage("");
    void fetchSupabaseApi<Payload>(`/api/admin/corporate-company-reconciliation?${params}`, {
      cache: "no-store",
      signal: controller.signal,
    }).then(setPayload).catch((error) => {
      if (!controller.signal.aborted) setMessage(error instanceof Error ? error.message : "Reconciliation could not be loaded.");
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [params]);

  useEffect(() => {
    if (!reviewRow || companySearch.trim().length < 2) {
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void getCompanyPage({ includeArchived: false, page: 1, pageSize: 10, search: companySearch.trim(), signal: controller.signal })
        .then((result) => setCompanies(result.companies.map((company) => ({ id: company.id, legalName: company.legalName, tradingName: company.tradingName }))))
        .catch(() => {
          if (!controller.signal.aborted) setCompanies([]);
        });
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [companySearch, reviewRow]);

  function beginReview(row: ReconciliationRow) {
    setReviewRow(row);
    setCompanySearch("");
    setCompanies([]);
    setSelectedCompanyId("");
    setReason("");
    setNotes(row.management_notes ?? "");
    setCreateCompanyName("");
  }

  async function loadEvidence(row: ReconciliationRow) {
    setEvidence({ id: row.id, loading: true, value: null });
    try {
      const value = await fetchSupabaseApi<Evidence>(`/api/admin/corporate-company-reconciliation?evidenceId=${encodeURIComponent(row.id)}`, { cache: "no-store" });
      setEvidence({ id: row.id, loading: false, value });
    } catch (error) {
      setEvidence(null);
      setMessage(error instanceof Error ? error.message : "Original evidence could not be loaded.");
    }
  }

  async function createCompany() {
    if (!createCompanyName.trim()) return;
    setLoading(true);
    setMessage("");
    try {
      const company = await saveCompany({
        expectedRevision: 0,
        values: { ...emptyCompanyInput(), legalName: createCompanyName.trim() },
      });
      setCompanies([{ id: company.id, legalName: company.legalName, tradingName: company.tradingName }]);
      setSelectedCompanyId(company.id);
      setCompanySearch(company.legalName);
      setCreateCompanyName("");
      setMessage("Company created. Confirm the association only after reviewing the evidence.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The Company could not be created.");
    } finally {
      setLoading(false);
    }
  }

  async function confirmReview() {
    if (!reviewRow || reason.trim().length < 5) return;
    setLoading(true);
    setMessage("");
    try {
      await fetchSupabaseApi("/api/admin/corporate-company-reconciliation", {
        body: {
          caseId: reviewRow.id,
          companyId: selectedCompanyId || null,
          expectedRevision: reviewRow.revision,
          managementNotes: notes,
          reason,
        },
        method: "POST",
      });
      setReviewRow(null);
      setMessage(selectedCompanyId ? "Company association confirmed." : "Review recorded without inventing a Company association.");
      const refreshed = await fetchSupabaseApi<Payload>(`/api/admin/corporate-company-reconciliation?${params}`, { cache: "no-store" });
      setPayload(refreshed);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The reconciliation could not be saved.");
    } finally {
      setLoading(false);
    }
  }

  async function downloadWorkbook() {
    if (loading) return;
    setLoading(true);
    setMessage("");
    try {
      const auth = await getAdminAuthSession();
      if (!auth) throw new Error("Your Admin session has expired. Please sign in again.");
      const query = new URLSearchParams({
        exceptionType: exceptionFilter,
        format: "xlsx",
        search,
        status: statusFilter,
      });
      const response = await fetch(`/api/admin/corporate-company-reconciliation?${query}`, {
        cache: "no-store",
        headers: { Authorization: `Bearer ${auth.session.access_token}` },
      });
      if (!response.ok) {
        const result = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(result.error ?? "The reconciliation workbook could not be downloaded.");
      }
      const href = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a");
      anchor.href = href;
      anchor.download = "Zingara_Corporate_Company_Reconciliation.xlsx";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(href);
      setMessage("Excel downloaded.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The reconciliation workbook could not be downloaded.");
    } finally {
      setLoading(false);
    }
  }

  const pageCount = Math.max(1, Math.ceil((payload?.total ?? 0) / 10));

  return (
    <section className="rounded-xl border border-[#D8C36A]/25 bg-zinc-950/80 p-3 sm:p-4" aria-labelledby="corporate-company-reconciliation-heading">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#D8C36A]">Management review</p>
          <h3 className="mt-1 text-lg font-bold text-white" id="corporate-company-reconciliation-heading">Corporate Company Reconciliation</h3>
          <p className="mt-1 text-sm text-zinc-400">Resolve only records supported by authoritative company evidence.</p>
        </div>
        <button className="inline-flex min-h-10 items-center justify-center rounded-full border border-[#D8C36A]/40 px-4 text-xs font-bold uppercase tracking-[0.08em] text-[#F2D66C] hover:bg-[#D8C36A] hover:text-black disabled:opacity-40" disabled={loading} onClick={() => void downloadWorkbook()} type="button">Download Excel</button>
      </div>

      {payload && (
        <div className="mt-4">
          <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            {[["Current total", payload.totals.all], ["Conflicting", payload.totals.conflicting], ["Insufficient", payload.totals.insufficient], ["Needs review", payload.totals.unresolved]].map(([label, value]) => (
              <div className="rounded-xl border border-white/10 bg-black/35 p-3" key={label}><span className="block text-xs text-zinc-500">{label}</span><strong className="mt-1 block text-white">{value}</strong></div>
            ))}
          </div>
          <p className="mt-2 text-xs text-zinc-500">Phase 50.5 baseline: 279 cases (52 conflicting · 227 insufficient). New cases remain visible in the current total.</p>
        </div>
      )}

      <div className="mt-4 grid gap-2 md:grid-cols-[minmax(220px,1fr)_190px_170px]">
        <input aria-label="Search reconciliation records" className={inputClass} onChange={(event) => setSearchDraft(event.target.value)} placeholder="Booking, customer or company evidence" value={searchDraft} />
        <select aria-label="Exception type" className={inputClass} onChange={(event) => { setExceptionFilter(event.target.value); setPage(1); }} value={exceptionFilter}>
          <option value="all">All exception types</option><option value="conflicting_company">Conflicting company</option><option value="insufficient_evidence">Insufficient evidence</option>
        </select>
        <select aria-label="Reconciliation status" className={inputClass} onChange={(event) => { setStatusFilter(event.target.value); setPage(1); }} value={statusFilter}>
          <option value="needs_review">Needs Review</option><option value="resolved">Resolved</option><option value="all">All statuses</option>
        </select>
      </div>

      {message && <p className="mt-3 rounded-xl border border-white/10 bg-black/35 px-3 py-2 text-sm text-amber-100" role="status">{message}</p>}
      {loading && <p className="mt-3 text-sm text-zinc-400">Loading…</p>}

      <div className="mt-4 space-y-2">
        {payload?.rows.map((row) => (
          <article className="rounded-xl border border-white/10 bg-black/35 p-3" key={row.id}>
            <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <strong className="text-sm text-white">{row.booking_reference}</strong>
                  <span className="rounded-full border border-white/15 px-2 py-1 text-[0.65rem] font-semibold uppercase text-zinc-300">{row.status === "needs_review" ? "Needs Review" : "Resolved"}</span>
                  <span className="rounded-full border border-[#D8C36A]/30 px-2 py-1 text-[0.65rem] font-semibold uppercase text-[#F2D66C]">{row.exception_type === "conflicting_company" ? "Conflicting company" : "Insufficient evidence"}</span>
                </div>
                <p className="mt-2 text-sm font-semibold text-zinc-200">{row.customer_name}</p>
                <dl className="mt-2 grid gap-2 text-xs text-zinc-400 sm:grid-cols-2">
                  <div><dt className="text-zinc-600">Original company evidence</dt><dd className="mt-1 break-words">{row.original_company_evidence || "Not available"}</dd></div>
                  <div><dt className="text-zinc-600">Currently linked company</dt><dd className="mt-1">{row.currentCompany?.legal_name || "No Company linked"}</dd></div>
                </dl>
                <p className="mt-2 text-xs text-zinc-500">{row.reason}</p>
                {row.reviewed_by_name && <p className="mt-2 text-xs text-zinc-500">Reviewed by {row.reviewed_by_name}{row.reviewed_at ? ` · ${new Date(row.reviewed_at).toLocaleString("en-ZA")}` : ""}</p>}
              </div>
              <div className="flex flex-wrap gap-2 xl:justify-end">
                <button className={secondaryButton} onClick={() => props.onOpenBooking(row.booking_reference)} type="button">Open Booking</button>
                <button className={secondaryButton} onClick={() => void loadEvidence(row)} type="button">View Original Evidence</button>
                {row.status === "needs_review" && <button className="min-h-9 rounded-full bg-[#D8C36A] px-4 py-2 text-xs font-bold uppercase text-black hover:bg-[#F2D66C]" onClick={() => beginReview(row)} type="button">Review</button>}
              </div>
            </div>
            {evidence?.id === row.id && (
              <div className="mt-3 rounded-xl border border-white/10 bg-black/50 p-3 text-xs text-zinc-300">
                {evidence.loading ? "Loading evidence…" : evidence.value && <>
                  <p><strong>Source:</strong> {evidence.value.booking.booking_source || "Not recorded"} · {evidence.value.booking.booking_origin || "Not recorded"}</p>
                  <p className="mt-1"><strong>Original value:</strong> {evidence.value.originalCompanyEvidence || "Not available"}</p>
                  <p className="mt-1"><strong>Recorded:</strong> {new Date(evidence.value.booking.created_at).toLocaleString("en-ZA")}</p>
                  <p className="mt-2 text-zinc-500">{evidence.value.events.length} bounded audit event{evidence.value.events.length === 1 ? "" : "s"} available.</p>
                </>}
              </div>
            )}
          </article>
        ))}
        {!loading && payload?.rows.length === 0 && <p className="rounded-xl border border-white/10 bg-black/30 p-4 text-sm text-zinc-400">No reconciliation records match these filters.</p>}
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <button className={secondaryButton} disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))} type="button">Previous</button>
        <p className="text-xs text-zinc-400">Page {page} of {pageCount} · {payload?.total ?? 0} matching</p>
        <button className={secondaryButton} disabled={page >= pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))} type="button">Next</button>
      </div>

      {reviewRow && (
        <div aria-modal="true" className="fixed inset-0 z-[140] flex items-center justify-center bg-black/80 p-3 backdrop-blur-sm" role="dialog">
          <button aria-label="Close reconciliation review" className="absolute inset-0" onClick={() => setReviewRow(null)} type="button" />
          <div className="relative z-10 max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-[#D8C36A]/35 bg-zinc-950 p-4 shadow-2xl sm:p-5">
            <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#D8C36A]">Company reconciliation</p><h4 className="mt-1 text-lg font-bold text-white">Review {reviewRow.booking_reference}</h4></div><button className={secondaryButton} onClick={() => setReviewRow(null)} type="button">Close</button></div>
            <div className="mt-4 rounded-xl border border-white/10 bg-black/35 p-3 text-sm"><p className="text-zinc-500">Original evidence</p><p className="mt-1 font-semibold text-white">{reviewRow.original_company_evidence || "Not available"}</p><p className="mt-3 text-zinc-500">Current association</p><p className="mt-1 font-semibold text-white">{reviewRow.currentCompany?.legal_name || "No Company linked"}</p></div>
            <label className="mt-4 block text-xs font-semibold uppercase text-zinc-400">Find Company<input className={`${inputClass} mt-2`} onChange={(event) => { setCompanySearch(event.target.value); setSelectedCompanyId(""); }} placeholder="Search the Company directory" value={companySearch} /></label>
            <div className="mt-2 space-y-2">{companies.map((company) => <button className={`w-full rounded-xl border p-3 text-left text-sm ${selectedCompanyId === company.id ? "border-[#D8C36A] bg-[#D8C36A]/10 text-white" : "border-white/10 text-zinc-300"}`} key={company.id} onClick={() => setSelectedCompanyId(company.id)} type="button"><strong>{company.legalName}</strong>{company.tradingName && <span className="ml-2 text-zinc-500">{company.tradingName}</span>}</button>)}</div>
            <details className="mt-4 rounded-xl border border-white/10 bg-black/30 p-3"><summary className="cursor-pointer text-sm font-semibold text-zinc-300">Add Company</summary><div className="mt-3 flex flex-col gap-2 sm:flex-row"><input className={inputClass} onChange={(event) => setCreateCompanyName(event.target.value)} placeholder="Legal Company name" value={createCompanyName} /><button className="rounded-full bg-[#D8C36A] px-4 py-2 text-xs font-bold uppercase text-black disabled:opacity-40" disabled={!createCompanyName.trim() || loading} onClick={() => void createCompany()} type="button">Add Company</button></div></details>
            <label className="mt-4 block text-xs font-semibold uppercase text-zinc-400">Reason for decision<textarea className="mt-2 min-h-20 w-full rounded-xl border border-white/15 bg-black px-3 py-2 text-sm normal-case text-white" onChange={(event) => setReason(event.target.value)} value={reason} /></label>
            <label className="mt-4 block text-xs font-semibold uppercase text-zinc-400">Management notes<textarea className="mt-2 min-h-20 w-full rounded-xl border border-white/15 bg-black px-3 py-2 text-sm normal-case text-white" onChange={(event) => setNotes(event.target.value)} value={notes} /></label>
            <p className="mt-3 text-xs text-zinc-500">Leave Company unselected only when evidence is insufficient. This records the review without inventing an association.</p>
            <div className="mt-5 flex justify-end gap-2"><button className={secondaryButton} onClick={() => setReviewRow(null)} type="button">Cancel</button><button className="rounded-full bg-[#D8C36A] px-4 py-2 text-xs font-bold uppercase text-black disabled:opacity-40" disabled={loading || reason.trim().length < 5} onClick={() => void confirmReview()} type="button">Confirm Review</button></div>
          </div>
        </div>
      )}
    </section>
  );
}
