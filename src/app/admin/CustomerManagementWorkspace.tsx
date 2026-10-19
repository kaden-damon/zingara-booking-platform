"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import InternationalPhoneInput from "../components/InternationalPhoneInput";
import { fetchSupabaseApi, SupabaseApiError } from "@/lib/supabase/apiClient";

type CustomerRow = {
  company_id: string | null;
  crm_revision: number;
  email?: string | null;
  first_name: string;
  id: string;
  mobile?: string | null;
  preferences: { archivedAt?: string } | null;
  surname: string | null;
  updated_at: string;
};

type CompanyOption = { id: string; legal_name: string; trading_name: string | null };
type CustomerDetail = {
  customer: CustomerRow;
  links: Array<{
    company: CompanyOption | null;
    company_id: string;
    id: string;
    job_title: string | null;
  }>;
};
type CustomerHistory = {
  audit: Array<{ action: string; actor_name: string | null; created_at: string; id: string }>;
  bookings: Array<{
    booking_reference: string;
    booking_status: string;
    created_at: string;
    guest_count: number;
    id: string;
    payment_status: string;
    total_amount: number;
    show: { date: string; location: string; time: string } | null;
  }>;
  errors: string[];
};

type Draft = { email: string; firstName: string; mobile: string; surname: string };
const emptyDraft: Draft = { email: "", firstName: "", mobile: "", surname: "" };

function customerName(customer: CustomerRow) {
  return [customer.first_name, customer.surname].filter(Boolean).join(" ");
}

function inputClass() {
  return "min-h-11 w-full rounded-lg border border-white/15 bg-zinc-950 px-3 text-sm text-white outline-none focus:border-[#D8C36A]/70";
}

export default function CustomerManagementWorkspace({ canManage }: { canManage: boolean }) {
  const [rows, setRows] = useState<CustomerRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
  const [archived, setArchived] = useState("active");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<CustomerDetail | null>(null);
  const [detailHistory, setDetailHistory] = useState<CustomerHistory | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [historyLoading, setHistoryLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [matches, setMatches] = useState<CustomerRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [companySearch, setCompanySearch] = useState("");
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [companyLoading, setCompanyLoading] = useState(false);
  const [companyError, setCompanyError] = useState("");
  const [selectedCompanyId, setSelectedCompanyId] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const requestRef = useRef(0);
  const detailRequestRef = useRef(0);
  const detailAbortRef = useRef<AbortController | null>(null);
  const companyRequestRef = useRef(0);
  const pageSize = 10;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  const loadList = useCallback(async () => {
    const requestId = ++requestRef.current;
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ archived, mode: "list", page: String(page), pageSize: String(pageSize), search });
      const payload = await fetchSupabaseApi<{ rows: CustomerRow[]; total: number }>(`/api/admin/customer-management?${params}`);
      if (requestId !== requestRef.current) return;
      setRows(payload.rows ?? []);
      setTotal(payload.total ?? 0);
    } catch {
      if (requestId === requestRef.current) setError("Customers couldn't be loaded. Try again.");
    } finally {
      if (requestId === requestRef.current) setLoading(false);
    }
  }, [archived, page, search]);

  const loadDetail = useCallback(async (id: string) => {
    detailAbortRef.current?.abort();
    const controller = new AbortController();
    detailAbortRef.current = controller;
    const requestId = ++detailRequestRef.current;
    setSelectedId(id);
    setDetail(null);
    setDetailHistory(null);
    setDetailLoading(true);
    setHistoryLoading(false);
    setDetailError("");
    try {
      const payload = await fetchSupabaseApi<CustomerDetail>(`/api/admin/customer-management?mode=detail&id=${encodeURIComponent(id)}`, { signal: controller.signal });
      if (requestId !== detailRequestRef.current) return;
      setDetail(payload);
      setDetailLoading(false);
      setHistoryLoading(true);
      fetchSupabaseApi<CustomerHistory>(`/api/admin/customer-management?mode=history&id=${encodeURIComponent(id)}`, { signal: controller.signal })
        .then((history) => {
          if (requestId !== detailRequestRef.current) return;
          setDetailHistory(history);
        })
        .catch((historyError) => {
          if (historyError instanceof DOMException && historyError.name === "AbortError") return;
          if (requestId === detailRequestRef.current) {
            setDetailHistory({ audit: [], bookings: [], errors: ["Customer history couldn't be loaded. Try again."] });
          }
        })
        .finally(() => {
          if (requestId === detailRequestRef.current) setHistoryLoading(false);
        });
    } catch (loadError) {
      if (loadError instanceof DOMException && loadError.name === "AbortError") return;
      if (requestId === detailRequestRef.current) {
        setDetailError("Customer details couldn't be loaded. Try again.");
      }
    } finally {
      if (requestId === detailRequestRef.current) setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    // The bounded server query synchronizes this workspace with the selected filters.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadList();
  }, [loadList]);

  useEffect(() => {
    return () => detailAbortRef.current?.abort();
  }, []);

  useEffect(() => {
    let controller: AbortController | null = null;
    const timer = window.setTimeout(() => {
      const term = companySearch.trim();
      const requestId = ++companyRequestRef.current;
      if (term.length < 2) {
        setCompanies([]);
        setCompanyError("");
        setCompanyLoading(false);
        return;
      }
      controller = new AbortController();
      setCompanyLoading(true);
      setCompanyError("");
      const params = new URLSearchParams({ mode: "companies", search: companySearch });
      fetchSupabaseApi<{ companies: CompanyOption[] }>(`/api/admin/customer-management?${params}`, { signal: controller.signal })
        .then((payload) => {
          if (requestId === companyRequestRef.current) setCompanies(payload.companies ?? []);
        })
        .catch((searchError) => {
          if (searchError instanceof DOMException && searchError.name === "AbortError") return;
          if (requestId === companyRequestRef.current) {
            setCompanies([]);
            setCompanyError("Companies couldn't be loaded. Try again.");
          }
        })
        .finally(() => {
          if (requestId === companyRequestRef.current) setCompanyLoading(false);
        });
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller?.abort();
    };
  }, [companySearch]);

  function beginCreate() {
    setEditing(false);
    setDraft(emptyDraft);
    setMatches([]);
    setShowForm(true);
  }

  function beginEdit() {
    if (!detail) return;
    setEditing(true);
    setMatches([]);
    setDraft({
      email: detail.customer.email ?? "",
      firstName: detail.customer.first_name,
      mobile: detail.customer.mobile ?? "",
      surname: detail.customer.surname ?? "",
    });
    setShowForm(true);
  }

  async function saveCustomer(forceCreate = false) {
    if (!draft.firstName.trim() || !draft.surname.trim()) {
      setError("First name and surname are required.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      if (editing && detail) {
        await fetchSupabaseApi("/api/admin/customers", {
          body: { id: detail.customer.id, identity: { ...draft, lastName: draft.surname } },
          method: "PATCH",
        });
        setShowForm(false);
        await Promise.all([loadDetail(detail.customer.id), loadList()]);
        return;
      }
      const payload = await fetchSupabaseApi<{ customer: CustomerRow }>("/api/admin/customer-management", {
        body: { action: "create", ...draft, forceCreate },
        method: "POST",
      });
      setMatches([]);
      setShowForm(false);
      setPage(1);
      await loadList();
      await loadDetail(payload.customer.id);
    } catch (saveError) {
      const details = saveError instanceof SupabaseApiError
        ? saveError.details as { code?: string; matches?: CustomerRow[] } | undefined
        : undefined;
      if (details?.code === "POTENTIAL_MATCHES") {
        setMatches(details.matches ?? []);
      } else {
        setError(saveError instanceof Error ? saveError.message : "The customer couldn't be saved.");
      }
    } finally {
      setSaving(false);
    }
  }

  async function linkCompany() {
    if (!detail || !selectedCompanyId) return;
    setSaving(true);
    setError("");
    try {
      await fetchSupabaseApi("/api/admin/customer-management", {
        body: { action: "link", companyId: selectedCompanyId, customerId: detail.customer.id, jobTitle },
        method: "POST",
      });
      setSelectedCompanyId("");
      setJobTitle("");
      await loadDetail(detail.customer.id);
    } catch (linkError) {
      setError(linkError instanceof Error ? linkError.message : "The Company couldn't be linked.");
    } finally {
      setSaving(false);
    }
  }

  async function unlinkCompany(companyId: string) {
    if (!detail) return;
    setSaving(true);
    setError("");
    try {
      await fetchSupabaseApi("/api/admin/customer-management", {
        body: { companyId, customerId: detail.customer.id },
        method: "DELETE",
      });
      await loadDetail(detail.customer.id);
    } catch (unlinkError) {
      setError(unlinkError instanceof Error ? unlinkError.message : "The Company association couldn't be removed.");
    } finally {
      setSaving(false);
    }
  }

  const existingCompanyIds = useMemo(() => new Set(detail?.links.map((link) => link.company_id) ?? []), [detail]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <form onSubmit={(event) => { event.preventDefault(); setPage(1); setSearch(searchDraft.trim()); }} className="flex flex-1 flex-col gap-2 sm:flex-row">
          <input aria-label="Search customers" value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)} placeholder="Search customers" className={`${inputClass()} sm:max-w-sm`} />
          <select aria-label="Customer status" value={archived} onChange={(event) => { setArchived(event.target.value); setPage(1); }} className={`${inputClass()} sm:max-w-40`}><option value="active">Active</option><option value="archived">Archived</option><option value="all">All</option></select>
          <button className="min-h-11 rounded-lg border border-[#D8C36A]/40 px-4 text-sm font-semibold text-[#F2D66C]">Search</button>
        </form>
        {canManage && <button type="button" onClick={beginCreate} className="h-10 rounded-full bg-[#D8C36A] px-5 text-xs font-bold uppercase tracking-[0.1em] text-black transition hover:bg-[#F2D66C] disabled:opacity-50">+ Add Customer</button>}
      </div>

      {error && <p role="alert" className="rounded-lg border border-red-400/30 bg-red-950/30 p-3 text-sm text-red-100">{error}</p>}
      <div className="grid gap-4 xl:grid-cols-[380px_1fr]">
        <section className="rounded-lg border border-white/10 bg-black/35 p-3">
          {loading ? <p className="p-5 text-sm text-zinc-400">Loading customers...</p> : rows.length === 0 ? <p className="p-5 text-sm text-zinc-400">No customers match these filters.</p> : <div className="space-y-1">{rows.map((customer) => <button key={customer.id} type="button" onClick={() => void loadDetail(customer.id)} className={`w-full rounded-md border px-3 py-2.5 text-left transition ${selectedId === customer.id ? "border-[#D8C36A]/70 bg-[#211708]" : "border-white/10 bg-zinc-950 hover:border-[#D8C36A]/40"}`}><p className="font-semibold text-white">{customerName(customer)}</p></button>)}</div>}
          <div className="mt-3 flex items-center justify-between gap-2 text-sm"><button type="button" disabled={page <= 1} onClick={() => setPage((value) => value - 1)} className="min-h-10 rounded-lg border border-white/15 px-3 disabled:opacity-35">Previous</button><span className="text-center text-zinc-400">Page {page} of {pageCount}<br />{total} customers</span><button type="button" disabled={page >= pageCount} onClick={() => setPage((value) => value + 1)} className="min-h-10 rounded-lg border border-white/15 px-3 disabled:opacity-35">Next</button></div>
        </section>

        <section className="min-w-0 rounded-lg border border-white/10 bg-black/35 p-4">
          {!selectedId ? <p className="text-sm text-zinc-400">Select a customer to view their profile.</p> : detailLoading ? <p className="text-sm text-zinc-400">Loading customer details...</p> : detailError ? <div role="alert" className="space-y-3"><p className="text-sm text-red-200">{detailError}</p><button type="button" onClick={() => void loadDetail(selectedId)} className="min-h-10 rounded-lg border border-[#D8C36A]/40 px-4 text-sm font-semibold text-[#F2D66C]">Retry</button></div> : detail ? <>
            <div className="flex flex-col gap-3 border-b border-white/10 pb-4 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#D8C36A]">Customer Profile</p><h3 className="mt-1 text-2xl font-bold">{customerName(detail.customer)}</h3><p className="mt-1 break-words text-sm text-zinc-400">{[detail.customer.email, detail.customer.mobile].filter(Boolean).join(" · ") || "No contact details"}</p></div>{canManage && <button type="button" onClick={beginEdit} className="min-h-10 rounded-lg border border-white/15 px-4 text-sm font-semibold">Edit Customer</button>}</div>

            <div className="mt-4 rounded-lg border border-[#D8C36A]/20 bg-zinc-950 p-4"><div className="flex items-center justify-between gap-3"><div><h4 className="font-bold">Associated Companies</h4><p className="text-sm text-zinc-400">This customer may belong to more than one Company.</p></div></div>
              <div className="mt-3 space-y-2">{detail.links.length === 0 ? <p className="text-sm text-zinc-500">No Company associations.</p> : detail.links.map((link) => <div key={link.id} className="flex flex-col gap-2 rounded-lg border border-white/10 p-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-semibold">{link.company?.legal_name ?? "Company"}</p><p className="text-xs text-zinc-500">{link.job_title || "No role recorded"}</p></div>{canManage && <button type="button" disabled={saving} onClick={() => void unlinkCompany(link.company_id)} className="min-h-9 rounded-lg border border-red-300/30 px-3 text-xs font-semibold text-red-100">Remove association</button>}</div>)}</div>
              {canManage && <div className="mt-3 grid gap-2 sm:grid-cols-2"><div><input aria-label="Search Companies" value={companySearch} onChange={(event) => { setCompanySearch(event.target.value); setSelectedCompanyId(""); }} placeholder="Search Companies" className={inputClass()} />{companyLoading && <p className="mt-1 text-xs text-zinc-500">Searching Companies...</p>}{companyError && <p className="mt-1 text-xs text-red-200">{companyError}</p>}{!companyLoading && companySearch.trim().length >= 2 && companies.length === 0 && !companyError && <p className="mt-1 text-xs text-zinc-500">No Companies match this search.</p>}</div><select aria-label="Company search results" value={selectedCompanyId} onChange={(event) => setSelectedCompanyId(event.target.value)} className={inputClass()}><option value="">Select Company</option>{companies.filter((company) => !existingCompanyIds.has(company.id)).map((company) => <option key={company.id} value={company.id}>{company.legal_name}</option>)}</select><input value={jobTitle} onChange={(event) => setJobTitle(event.target.value)} placeholder="Job title / role (optional)" className={inputClass()} /><button type="button" disabled={!selectedCompanyId || saving} onClick={() => void linkCompany()} className="min-h-11 rounded-lg bg-[#D8C36A] px-4 text-sm font-bold text-black disabled:opacity-40">Link Customer</button></div>}
            </div>

            {historyLoading ? <p className="mt-4 text-sm text-zinc-500">Loading customer history...</p> : <div className="mt-4 grid gap-4 lg:grid-cols-2"><div><h4 className="text-sm font-bold uppercase text-zinc-400">Bookings</h4><div className="mt-2 max-h-64 space-y-2 overflow-y-auto">{(detailHistory?.bookings ?? []).length === 0 ? <p className="text-sm text-zinc-500">No bookings linked to this customer.</p> : detailHistory?.bookings.map((booking) => <div key={booking.id} className="rounded-lg border border-white/10 p-3 text-sm"><p className="font-semibold text-white">{booking.booking_reference} · {booking.guest_count} guests</p><p className="mt-1 text-zinc-500">{booking.show ? `${booking.show.location} · ${booking.show.date}` : "Show unavailable"} · {booking.booking_status}</p></div>)}</div></div><div><h4 className="text-sm font-bold uppercase text-zinc-400">Audit history</h4><div className="mt-2 max-h-64 space-y-2 overflow-y-auto">{(detailHistory?.audit ?? []).length === 0 ? <p className="text-sm text-zinc-500">No customer audit events recorded.</p> : detailHistory?.audit.map((event) => <div key={event.id} className="rounded-lg border border-white/10 p-3 text-sm"><p className="font-semibold text-white">{event.action.replaceAll(".", " ")}</p><p className="mt-1 text-zinc-500">{event.actor_name ?? "System"} · {new Date(event.created_at).toLocaleString("en-ZA")}</p></div>)}</div></div>{(detailHistory?.errors ?? []).length > 0 && <div className="lg:col-span-2"><p className="text-sm text-amber-200">{detailHistory?.errors.join(" ")}</p><button type="button" onClick={() => void loadDetail(detail.customer.id)} className="mt-2 min-h-9 rounded-lg border border-[#D8C36A]/40 px-3 text-xs font-semibold text-[#F2D66C]">Retry history</button></div>}</div>}
          </> : null}
        </section>
      </div>

      {showForm && <div className="fixed inset-0 z-[200] grid place-items-center bg-black/80 p-3" role="dialog" aria-modal="true" aria-labelledby="customer-form-title"><section className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-xl border border-[#D8C36A]/35 bg-zinc-950 p-5"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#D8C36A]">Customers</p><h3 id="customer-form-title" className="mt-1 text-2xl font-bold">{editing ? "Edit Customer" : "Add Customer"}</h3></div><button type="button" onClick={() => setShowForm(false)} className="min-h-10 rounded-lg border border-white/15 px-3">Close</button></div><div className="mt-5 grid gap-3 sm:grid-cols-2"><label className="text-sm text-zinc-300">First name *<input value={draft.firstName} onChange={(event) => setDraft({ ...draft, firstName: event.target.value })} className={`${inputClass()} mt-1`} /></label><label className="text-sm text-zinc-300">Surname *<input value={draft.surname} onChange={(event) => setDraft({ ...draft, surname: event.target.value })} className={`${inputClass()} mt-1`} /></label><label className="text-sm text-zinc-300">Email (optional)<input type="email" value={draft.email} onChange={(event) => setDraft({ ...draft, email: event.target.value })} className={`${inputClass()} mt-1`} /></label><label className="text-sm text-zinc-300">Mobile (optional)<span className="mt-1 block"><InternationalPhoneInput value={draft.mobile} onChange={(mobile) => setDraft({ ...draft, mobile })} /></span></label></div>
        {matches.length > 0 && <div className="mt-4 rounded-lg border border-amber-300/30 bg-amber-950/20 p-3"><p className="font-semibold text-amber-100">Possible existing customers</p><p className="mt-1 text-sm text-zinc-300">Matching details do not prove these are the same person. Choose an existing profile or deliberately create a separate customer.</p><div className="mt-3 space-y-2">{matches.map((match) => <button key={match.id} type="button" onClick={() => { setShowForm(false); void loadDetail(match.id); }} className="w-full rounded-lg border border-white/10 p-3 text-left"><span className="font-semibold">Use existing customer: {customerName(match)}</span><span className="mt-1 block text-xs text-zinc-400">{[match.email, match.mobile].filter(Boolean).join(" · ") || "No contact details"}</span></button>)}</div><button type="button" disabled={saving} onClick={() => void saveCustomer(true)} className="mt-3 min-h-10 rounded-lg border border-amber-200/35 px-4 text-sm font-semibold text-amber-100">Create new customer</button></div>}
        {error && <p role="alert" className="mt-3 text-sm text-red-200">{error}</p>}<div className="mt-5 flex gap-2"><button type="button" disabled={saving} onClick={() => void saveCustomer(false)} className="min-h-11 rounded-lg bg-[#D8C36A] px-5 text-sm font-bold text-black disabled:opacity-40">{saving ? "Saving..." : editing ? "Save Changes" : "Check & Create"}</button><button type="button" onClick={() => setShowForm(false)} className="min-h-11 rounded-lg border border-white/15 px-4 text-sm">Cancel</button></div></section></div>}
    </div>
  );
}
