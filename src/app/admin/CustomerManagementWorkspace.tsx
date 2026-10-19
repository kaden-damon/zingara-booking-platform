"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import InternationalPhoneInput from "../components/InternationalPhoneInput";
import { fetchSupabaseApi, SupabaseApiError } from "@/lib/supabase/apiClient";
import {
  operationalPauseDurations,
  operationalPauseReasons,
  type OperationalPauseDuration,
} from "@/lib/customerCommunicationPreferences";

type CustomerRow = {
  company_id: string | null;
  created_at?: string;
  crm_revision: number;
  email?: string | null;
  first_name: string;
  id: string;
  mobile?: string | null;
  preferences: { archivedAt?: string; archiveReason?: string; marketingPreference?: string; vipTags?: string[] } | null;
  relationship_notes?: string | null;
  dietary_requirements?: string | null;
  surname: string | null;
  updated_at: string;
  vip_status?: string | null;
};

type CompanyOption = { id: string; legal_name: string; trading_name: string | null };
type CustomerDetail = {
  canArchive: boolean;
  canManageCommunications: boolean;
  customer: CustomerRow;
  links: Array<{
    company: CompanyOption | null;
    company_id: string;
    id: string;
    job_title: string | null;
  }>;
};
type CustomerHistory = {
  bookings: Array<{
    amount_paid: number;
    balance_outstanding: number;
    booking_reference: string;
    booking_status: string;
    created_at: string;
    customer_snapshot: { email?: string; name?: string; phone?: string } | null;
    guest_count: number;
    id: string;
    payment_status: string;
    section: string | null;
    total_amount: number;
    table_codes: string[];
    show: { date: string; name: string; status: string; time: string; venue: string } | null;
  }>;
  errors: string[];
  page: number;
  pageSize: number;
  total: number;
};

type CustomerSummary = {
  activeBookings: number;
  addOns: Array<{ count: number; name: string; revenue: number }>;
  attendanceCount: number;
  attendanceRate: number;
  favouriteZone: string | null;
  guestEntitlement: number;
  outstanding: number;
  paid: number;
  promoUsage: Array<{ code: string; count: number; discount: number }>;
  totalBookings: number;
  totalSpend: number;
};

type CommunicationRow = {
  booking_reference: string | null;
  channel: string;
  created_at: string;
  id: string;
  message: string;
  sent_at: string | null;
  status: string;
  subject: string | null;
  type: string;
};

type ActivityRow = { action: string; actor_name: string | null; created_at: string; id: string };
type PagedRows<T> = { page: number; pageSize: number; rows: T[]; total: number };
type Suppression = { channel: "email" | "push"; pausedUntil: string; pausedByName: string; reason: string };
type PauseEditor = { channel: "email" | "push"; duration: OperationalPauseDuration; otherReason: string; reason: string };

type Draft = { email: string; firstName: string; mobile: string; surname: string };
const emptyDraft: Draft = { email: "", firstName: "", mobile: "", surname: "" };

function customerName(customer: CustomerRow) {
  return [customer.first_name, customer.surname].filter(Boolean).join(" ");
}

function inputClass() {
  return "min-h-11 w-full rounded-lg border border-white/15 bg-zinc-950 px-3 text-sm text-white outline-none focus:border-[#D8C36A]/70";
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-ZA", { currency: "ZAR", style: "currency" }).format(value || 0);
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "Not recorded";
  return new Intl.DateTimeFormat("en-ZA", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Johannesburg" }).format(new Date(value));
}

const vipOptions = ["VIP", "High Value", "Birthday Guest", "Wine Lover", "Corporate Host"];

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border border-white/10 bg-zinc-950 p-3"><p className="text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-zinc-500">{label}</p><p className="mt-1 text-sm font-bold text-white">{value}</p></div>;
}

export default function CustomerManagementWorkspace({
  canManage,
  onOpenBooking,
}: {
  canManage: boolean;
  onOpenBooking?: (reference: string) => void;
}) {
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
  const [summary, setSummary] = useState<CustomerSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [bookingPage, setBookingPage] = useState(1);
  const [communications, setCommunications] = useState<PagedRows<CommunicationRow> | null>(null);
  const [communicationPage, setCommunicationPage] = useState(1);
  const [communicationsOpen, setCommunicationsOpen] = useState(false);
  const [communicationsLoading, setCommunicationsLoading] = useState(false);
  const [activity, setActivity] = useState<PagedRows<ActivityRow> | null>(null);
  const [activityPage, setActivityPage] = useState(1);
  const [activityOpen, setActivityOpen] = useState(false);
  const [activityLoading, setActivityLoading] = useState(false);
  const [suppressions, setSuppressions] = useState<Suppression[]>([]);
  const [communicationStateLoaded, setCommunicationStateLoaded] = useState(false);
  const [pauseEditor, setPauseEditor] = useState<PauseEditor | null>(null);
  const [notesDraft, setNotesDraft] = useState("");
  const [vipDraft, setVipDraft] = useState<string[]>([]);
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
  const sectionRequestRef = useRef(0);
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

  const loadHistory = useCallback(async (id: string, nextPage: number, signal?: AbortSignal) => {
    const params = new URLSearchParams({ id, mode: "history", page: String(nextPage), pageSize: "10" });
    const history = await fetchSupabaseApi<CustomerHistory>(`/api/admin/customer-management?${params}`, { signal });
    setDetailHistory(history);
  }, []);

  const loadDetail = useCallback(async (id: string) => {
    detailAbortRef.current?.abort();
    const controller = new AbortController();
    detailAbortRef.current = controller;
    const requestId = ++detailRequestRef.current;
    setSelectedId(id);
    setDetail(null);
    setDetailHistory(null);
    setSummary(null);
    setCommunications(null);
    setActivity(null);
    setCommunicationsOpen(false);
    setActivityOpen(false);
    setCommunicationStateLoaded(false);
    setBookingPage(1);
    setCommunicationPage(1);
    setActivityPage(1);
    setDetailLoading(true);
    setHistoryLoading(false);
    setDetailError("");
    try {
      const payload = await fetchSupabaseApi<CustomerDetail>(`/api/admin/customer-management?mode=detail&id=${encodeURIComponent(id)}`, { signal: controller.signal });
      if (requestId !== detailRequestRef.current) return;
      setDetail(payload);
      setNotesDraft(payload.customer.relationship_notes ?? "");
      setVipDraft(payload.customer.preferences?.vipTags ?? []);
      setDetailLoading(false);
      setHistoryLoading(true);
      setSummaryLoading(true);
      Promise.allSettled([
        loadHistory(id, 1, controller.signal),
        fetchSupabaseApi<{ summary: CustomerSummary }>(`/api/admin/customer-management?mode=summary&id=${encodeURIComponent(id)}`, { signal: controller.signal })
          .then((result) => {
            if (requestId === detailRequestRef.current) setSummary(result.summary);
          }),
      ])
        .then((results) => {
          if (requestId !== detailRequestRef.current) return;
          if (results[0].status === "rejected") {
            setDetailHistory({ bookings: [], errors: ["Customer history couldn't be loaded. Try again."], page: 1, pageSize: 10, total: 0 });
          }
          if (results[1].status === "rejected") {
            setSummary(null);
          }
        })
        .finally(() => {
          if (requestId === detailRequestRef.current) {
            setHistoryLoading(false);
            setSummaryLoading(false);
          }
        });
    } catch (loadError) {
      if (loadError instanceof DOMException && loadError.name === "AbortError") return;
      if (requestId === detailRequestRef.current) {
        setDetailError("Customer details couldn't be loaded. Try again.");
      }
    } finally {
      if (requestId === detailRequestRef.current) setDetailLoading(false);
    }
  }, [loadHistory]);

  const changeBookingPage = useCallback(async (nextPage: number) => {
    if (!selectedId) return;
    const requestId = ++sectionRequestRef.current;
    setHistoryLoading(true);
    try {
      await loadHistory(selectedId, nextPage);
      if (requestId === sectionRequestRef.current) setBookingPage(nextPage);
    } catch {
      if (requestId === sectionRequestRef.current) {
        setDetailHistory((current) => current ? { ...current, errors: ["Customer history couldn't be loaded. Try again."] } : null);
      }
    } finally {
      if (requestId === sectionRequestRef.current) setHistoryLoading(false);
    }
  }, [loadHistory, selectedId]);

  const loadCommunications = useCallback(async (nextPage: number) => {
    if (!selectedId) return;
    setCommunicationsLoading(true);
    try {
      const params = new URLSearchParams({ id: selectedId, mode: "communications", page: String(nextPage), pageSize: "10" });
      const payload = await fetchSupabaseApi<PagedRows<CommunicationRow>>(`/api/admin/customer-management?${params}`);
      setCommunications(payload);
      setCommunicationPage(nextPage);
    } catch {
      setError("Communication history couldn't be loaded. Try again.");
    } finally {
      setCommunicationsLoading(false);
    }
  }, [selectedId]);

  const loadActivity = useCallback(async (nextPage: number) => {
    if (!selectedId) return;
    setActivityLoading(true);
    try {
      const params = new URLSearchParams({ id: selectedId, mode: "activity", page: String(nextPage), pageSize: "10" });
      const payload = await fetchSupabaseApi<PagedRows<ActivityRow>>(`/api/admin/customer-management?${params}`);
      setActivity(payload);
      setActivityPage(nextPage);
    } catch {
      setError("Customer activity couldn't be loaded. Try again.");
    } finally {
      setActivityLoading(false);
    }
  }, [selectedId]);

  const loadCommunicationState = useCallback(async () => {
    if (!selectedId || communicationStateLoaded) return;
    try {
      const payload = await fetchSupabaseApi<{ rows: Suppression[] }>(`/api/admin/customers/communication-suppression?customerId=${encodeURIComponent(selectedId)}`);
      setSuppressions(payload.rows ?? []);
      setCommunicationStateLoaded(true);
    } catch {
      setCommunicationStateLoaded(true);
    }
  }, [communicationStateLoaded, selectedId]);

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

  async function saveCrm() {
    if (!detail) return;
    setSaving(true);
    setError("");
    try {
      await fetchSupabaseApi("/api/admin/customers", {
        body: { crm: { notes: notesDraft, vipTags: vipDraft }, id: detail.customer.id },
        method: "PATCH",
      });
      await loadDetail(detail.customer.id);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Customer notes couldn't be saved.");
    } finally {
      setSaving(false);
    }
  }

  async function setArchivedState(archivedState: boolean) {
    if (!detail) return;
    setSaving(true);
    setError("");
    try {
      await fetchSupabaseApi("/api/admin/customers", {
        body: { archive: { archived: archivedState, reason: archivedState ? "Archived from Customer CRM" : "" }, id: detail.customer.id },
        method: "PATCH",
      });
      setSelectedId(null);
      setDetail(null);
      await loadList();
    } catch (archiveError) {
      setError(archiveError instanceof Error ? archiveError.message : "Customer archive state couldn't be updated.");
    } finally {
      setSaving(false);
    }
  }

  async function updateCommunicationState(channel: "email" | "push", action: "pause" | "resume") {
    if (!detail) return;
    setSaving(true);
    setError("");
    try {
      const payload = await fetchSupabaseApi<{ rows: Suppression[] }>("/api/admin/customers/communication-suppression", {
        body: action === "pause"
          ? { action, channel, customerId: detail.customer.id, duration: pauseEditor?.duration ?? "1-hour", otherReason: pauseEditor?.otherReason ?? "", reason: pauseEditor?.reason ?? "Updating booking details" }
          : { action, channel, customerId: detail.customer.id },
        method: "POST",
      });
      setSuppressions(payload.rows ?? []);
      setPauseEditor(null);
    } catch (communicationError) {
      setError(communicationError instanceof Error ? communicationError.message : "Communication state couldn't be updated.");
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
            <div className="flex flex-col gap-3 border-b border-white/10 pb-4 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#D8C36A]">Customer Profile</p><h3 className="mt-1 text-2xl font-bold">{customerName(detail.customer)}</h3><p className="mt-1 break-words text-sm text-zinc-400">{[detail.customer.email, detail.customer.mobile].filter(Boolean).join(" · ") || "No contact details"}</p><p className="mt-1 text-xs text-zinc-500">Created {formatDateTime(detail.customer.created_at)}{detail.customer.dietary_requirements ? ` · ${detail.customer.dietary_requirements}` : ""}</p></div><div className="flex flex-wrap gap-2">{canManage && <button type="button" onClick={beginEdit} className="min-h-10 rounded-lg border border-white/15 px-4 text-sm font-semibold">Edit Customer</button>}{detail.canArchive && <button type="button" disabled={saving} onClick={() => void setArchivedState(!detail.customer.preferences?.archivedAt)} className="min-h-10 rounded-lg border border-white/15 px-4 text-sm font-semibold">{detail.customer.preferences?.archivedAt ? "Restore Customer" : "Archive Customer"}</button>}</div></div>

            <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
              {summaryLoading ? <p className="text-sm text-zinc-500 sm:col-span-2 xl:col-span-5">Loading customer summary...</p> : <>
                <Metric label="Spend" value={formatCurrency(summary?.totalSpend ?? 0)} />
                <Metric label="Paid" value={formatCurrency(summary?.paid ?? 0)} />
                <Metric label="Outstanding" value={formatCurrency(summary?.outstanding ?? 0)} />
                <Metric label="Bookings" value={String(summary?.activeBookings ?? 0)} />
                <Metric label="Attendance" value={`${summary?.attendanceRate ?? 0}% · ${summary?.attendanceCount ?? 0} visits`} />
              </>}
            </div>

            {detailHistory?.bookings.find((booking) => booking.customer_snapshot)?.customer_snapshot && (() => {
              const snapshot = detailHistory.bookings.find((booking) => booking.customer_snapshot)?.customer_snapshot;
              const liveName = customerName(detail.customer).trim().toLowerCase();
              const differs = snapshot && (
                (snapshot.name ?? "").trim().toLowerCase() !== liveName ||
                (snapshot.email ?? "").trim().toLowerCase() !== (detail.customer.email ?? "").trim().toLowerCase() ||
                (snapshot.phone ?? "").replace(/\D/g, "") !== (detail.customer.mobile ?? "").replace(/\D/g, "")
              );
              return differs ? <details className="mt-4 border-y border-[#D8C36A]/20 py-3"><summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.12em] text-[#F2D66C]">Customer Record Comparison</summary><p className="mt-2 text-sm text-zinc-400">Booking snapshots are preserved for audit history. This comparison is read-only.</p><div className="mt-3 grid gap-3 sm:grid-cols-2"><div><p className="text-xs uppercase text-zinc-500">Booking Snapshot</p><p className="mt-1 font-semibold">{snapshot?.name || "Unnamed Guest"}</p><p className="text-sm text-zinc-400">{snapshot?.email || "No email"} · {snapshot?.phone || "No phone"}</p></div><div><p className="text-xs uppercase text-emerald-300">Live Customer Record</p><p className="mt-1 font-semibold">{customerName(detail.customer)}</p><p className="text-sm text-zinc-400">{detail.customer.email || "No email"} · {detail.customer.mobile || "No phone"}</p></div></div></details> : null;
            })()}

            <div className="mt-4 rounded-lg border border-[#D8C36A]/20 bg-zinc-950 p-4"><div className="flex items-center justify-between gap-3"><div><h4 className="font-bold">Associated Companies</h4><p className="text-sm text-zinc-400">This customer may belong to more than one Company.</p></div></div>
              <div className="mt-3 space-y-2">{detail.links.length === 0 ? <p className="text-sm text-zinc-500">No Company associations.</p> : detail.links.map((link) => <div key={link.id} className="flex flex-col gap-2 rounded-lg border border-white/10 p-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-semibold">{link.company?.legal_name ?? "Company"}</p><p className="text-xs text-zinc-500">{link.job_title || "No role recorded"}</p></div>{canManage && <button type="button" disabled={saving} onClick={() => void unlinkCompany(link.company_id)} className="min-h-9 rounded-lg border border-red-300/30 px-3 text-xs font-semibold text-red-100">Remove association</button>}</div>)}</div>
              {canManage && <div className="mt-3 grid gap-2 sm:grid-cols-2"><div><input aria-label="Search Companies" value={companySearch} onChange={(event) => { setCompanySearch(event.target.value); setSelectedCompanyId(""); }} placeholder="Search Companies" className={inputClass()} />{companyLoading && <p className="mt-1 text-xs text-zinc-500">Searching Companies...</p>}{companyError && <p className="mt-1 text-xs text-red-200">{companyError}</p>}{!companyLoading && companySearch.trim().length >= 2 && companies.length === 0 && !companyError && <p className="mt-1 text-xs text-zinc-500">No Companies match this search.</p>}</div><select aria-label="Company search results" value={selectedCompanyId} onChange={(event) => setSelectedCompanyId(event.target.value)} className={inputClass()}><option value="">Select Company</option>{companies.filter((company) => !existingCompanyIds.has(company.id)).map((company) => <option key={company.id} value={company.id}>{company.legal_name}</option>)}</select><input value={jobTitle} onChange={(event) => setJobTitle(event.target.value)} placeholder="Job title / role (optional)" className={inputClass()} /><button type="button" disabled={!selectedCompanyId || saving} onClick={() => void linkCompany()} className="min-h-11 rounded-lg bg-[#D8C36A] px-4 text-sm font-bold text-black disabled:opacity-40">Link Customer</button></div>}
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <section className="border-t border-white/10 pt-4">
                <h4 className="text-sm font-bold uppercase text-zinc-400">Relationship Notes & VIP</h4>
                <textarea aria-label="Relationship notes" value={notesDraft} disabled={!canManage} onChange={(event) => setNotesDraft(event.target.value)} className={`${inputClass()} mt-3 min-h-24 py-3`} placeholder="Guest preferences, service notes, allergies, or relationship context." />
                <div className="mt-3 flex flex-wrap gap-2">{vipOptions.map((tag) => <button key={tag} type="button" disabled={!canManage} onClick={() => setVipDraft((current) => current.includes(tag) ? current.filter((value) => value !== tag) : [...current, tag])} className={`min-h-9 rounded-full border px-3 text-xs font-semibold ${vipDraft.includes(tag) ? "border-[#D8C36A] bg-[#D8C36A] text-black" : "border-white/15 text-zinc-300"}`}>{tag}</button>)}</div>
                {canManage && <button type="button" disabled={saving} onClick={() => void saveCrm()} className="mt-3 min-h-10 rounded-lg bg-[#D8C36A] px-4 text-sm font-bold text-black disabled:opacity-40">Save CRM Notes</button>}
              </section>

              <section className="border-t border-white/10 pt-4">
                <h4 className="text-sm font-bold uppercase text-zinc-400">Preferences</h4>
                <dl className="mt-3 grid gap-3 sm:grid-cols-2"><div><dt className="text-xs uppercase text-zinc-500">Favourite Seating</dt><dd className="mt-1 font-semibold">{summary?.favouriteZone ?? "No favourite yet"}</dd></div><div><dt className="text-xs uppercase text-zinc-500">Guest Entitlement</dt><dd className="mt-1 font-semibold">{summary?.guestEntitlement ?? 0} guests</dd></div></dl>
                <div className="mt-4"><p className="text-xs uppercase text-zinc-500">Add-Ons Purchased</p><div className="mt-2 flex flex-wrap gap-2">{(summary?.addOns ?? []).length ? summary?.addOns.map((addon) => <span key={addon.name} className="rounded-full border border-sky-300/25 px-3 py-1 text-xs text-sky-200">{addon.name} · {addon.count}</span>) : <span className="text-sm text-zinc-500">No add-ons purchased.</span>}</div></div>
                <div className="mt-4"><p className="text-xs uppercase text-zinc-500">Promo Usage</p><div className="mt-2 flex flex-wrap gap-2">{(summary?.promoUsage ?? []).length ? summary?.promoUsage.map((promo) => <span key={promo.code} className="rounded-full border border-amber-300/25 px-3 py-1 text-xs text-amber-200">{promo.code} · {promo.count} · {formatCurrency(promo.discount)}</span>) : <span className="text-sm text-zinc-500">No promo codes used.</span>}</div></div>
              </section>
            </div>

            <details open className="mt-5 border-t border-white/10 pt-4"><summary className="cursor-pointer text-sm font-bold uppercase text-zinc-300">Booking & Performance History · {detailHistory?.total ?? summary?.totalBookings ?? 0}</summary>
              {historyLoading ? <p className="mt-3 text-sm text-zinc-500">Loading booking history...</p> : <div className="mt-3 space-y-2">{(detailHistory?.bookings ?? []).length === 0 ? <p className="text-sm text-zinc-500">No bookings linked to this customer.</p> : detailHistory?.bookings.map((booking) => <div key={booking.id} className="rounded-lg border border-white/10 p-3 text-sm"><div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"><div><p className="font-semibold text-white">{booking.booking_reference} · {booking.guest_count} guests</p><p className="mt-1 text-zinc-400">{booking.show ? `${booking.show.name} · ${booking.show.venue} · ${booking.show.date} ${booking.show.time}` : "Show information is not available for this historical booking."}</p><p className="mt-1 text-zinc-500">{booking.section || "No seating section"}{booking.table_codes.length ? ` · Table ${booking.table_codes.join(", ")}` : " · Table needed"} · {booking.booking_status} · {booking.payment_status}</p><p className="mt-1 text-zinc-500">Value {formatCurrency(booking.total_amount)} · Paid {formatCurrency(booking.amount_paid)} · Outstanding {formatCurrency(booking.balance_outstanding)}</p></div>{onOpenBooking && <button type="button" onClick={() => onOpenBooking(booking.booking_reference)} className="min-h-9 shrink-0 rounded-lg border border-[#D8C36A]/40 px-3 text-xs font-semibold text-[#F2D66C]">Open Booking</button>}</div></div>)}</div>}
              {(detailHistory?.errors ?? []).length > 0 && <p role="alert" className="mt-3 text-sm text-amber-200">{detailHistory?.errors.join(" ")}</p>}
              {(detailHistory?.total ?? 0) > 10 && <div className="mt-3 flex items-center justify-between gap-2"><button type="button" disabled={bookingPage <= 1 || historyLoading} onClick={() => void changeBookingPage(bookingPage - 1)} className="min-h-9 rounded-lg border border-white/15 px-3 text-sm disabled:opacity-35">Previous</button><span className="text-sm text-zinc-500">Page {bookingPage} of {Math.max(1, Math.ceil((detailHistory?.total ?? 0) / 10))}</span><button type="button" disabled={bookingPage >= Math.ceil((detailHistory?.total ?? 0) / 10) || historyLoading} onClick={() => void changeBookingPage(bookingPage + 1)} className="min-h-9 rounded-lg border border-white/15 px-3 text-sm disabled:opacity-35">Next</button></div>}
            </details>

            <details className="mt-5 border-t border-white/10 pt-4" onToggle={(event) => { if (event.currentTarget.open) { setCommunicationsOpen(true); void loadCommunications(communicationPage); void loadCommunicationState(); } }}><summary className="cursor-pointer text-sm font-bold uppercase text-zinc-300">Communications & Preferences{communications ? ` · ${communications.total}` : ""}</summary>
              {communicationsOpen && <div className="mt-3"><p className="text-sm text-zinc-400">Marketing preference: {detail.customer.preferences?.marketingPreference ?? "Unknown"}. Operational pauses do not change marketing consent.</p><div className="mt-3 grid gap-2 sm:grid-cols-2">{(["email", "push"] as const).map((channel) => { const paused = suppressions.find((item) => item.channel === channel && new Date(item.pausedUntil).getTime() > Date.now()); return <div key={channel} className="rounded-lg border border-white/10 p-3"><div className="flex items-center justify-between gap-2"><div><p className="font-semibold capitalize">{channel} Updates</p><p className="text-xs text-zinc-500">{paused ? `Paused until ${formatDateTime(paused.pausedUntil)} by ${paused.pausedByName} · ${paused.reason}` : "Operational updates active"}</p></div>{detail.canManageCommunications && <button type="button" disabled={saving} onClick={() => paused ? void updateCommunicationState(channel, "resume") : setPauseEditor({ channel, duration: "1-hour", otherReason: "", reason: "Updating booking details" })} className="min-h-9 rounded-lg border border-white/15 px-3 text-xs">{paused ? "Resume" : "Pause"}</button>}</div>{pauseEditor?.channel === channel && !paused && <div className="mt-3 grid gap-2"><select aria-label={`${channel} pause reason`} value={pauseEditor.reason} onChange={(event) => setPauseEditor({ ...pauseEditor, reason: event.target.value })} className={inputClass()}>{operationalPauseReasons.map((reason) => <option key={reason} value={reason}>{reason}</option>)}</select><select aria-label={`${channel} pause duration`} value={pauseEditor.duration} onChange={(event) => setPauseEditor({ ...pauseEditor, duration: event.target.value as OperationalPauseDuration })} className={inputClass()}>{operationalPauseDurations.map((duration) => <option key={duration.value} value={duration.value}>{duration.label}</option>)}</select>{pauseEditor.reason === "Other" && <input aria-label={`${channel} pause explanation`} maxLength={240} value={pauseEditor.otherReason} onChange={(event) => setPauseEditor({ ...pauseEditor, otherReason: event.target.value })} placeholder="Brief operational reason" className={inputClass()} />}<div className="flex gap-2"><button type="button" disabled={saving} onClick={() => void updateCommunicationState(channel, "pause")} className="min-h-9 rounded-lg bg-amber-200 px-3 text-xs font-bold text-black">Confirm Pause</button><button type="button" onClick={() => setPauseEditor(null)} className="min-h-9 rounded-lg border border-white/15 px-3 text-xs">Cancel</button></div></div>}</div>; })}</div>
                {communicationsLoading ? <p className="mt-3 text-sm text-zinc-500">Loading communication history...</p> : <div className="mt-3 space-y-2">{(communications?.rows ?? []).length ? communications?.rows.map((record) => <div key={record.id} className="rounded-lg border border-white/10 p-3 text-sm"><p className="text-xs font-semibold uppercase text-[#D8C36A]">{record.channel} · {record.booking_reference ?? "Customer record"} · {record.status}</p>{record.subject && <p className="mt-1 font-semibold">{record.subject}</p>}<p className="mt-1 whitespace-pre-wrap text-zinc-300">{record.message}</p><p className="mt-1 text-xs text-zinc-500">{formatDateTime(record.sent_at ?? record.created_at)}</p></div>) : <p className="text-sm text-zinc-500">No customer communications recorded.</p>}</div>}
                {(communications?.total ?? 0) > 10 && <div className="mt-3 flex items-center justify-between gap-2"><button type="button" disabled={communicationPage <= 1 || communicationsLoading} onClick={() => void loadCommunications(communicationPage - 1)} className="min-h-9 rounded-lg border border-white/15 px-3 text-sm disabled:opacity-35">Previous</button><span className="text-sm text-zinc-500">Page {communicationPage} of {Math.ceil((communications?.total ?? 0) / 10)}</span><button type="button" disabled={communicationPage >= Math.ceil((communications?.total ?? 0) / 10) || communicationsLoading} onClick={() => void loadCommunications(communicationPage + 1)} className="min-h-9 rounded-lg border border-white/15 px-3 text-sm disabled:opacity-35">Next</button></div>}
              </div>}
            </details>

            <details className="mt-5 border-t border-white/10 pt-4" onToggle={(event) => { if (event.currentTarget.open) { setActivityOpen(true); void loadActivity(activityPage); } }}><summary className="cursor-pointer text-sm font-bold uppercase text-zinc-300">Customer Activity{activity ? ` · ${activity.total}` : ""}</summary>{activityOpen && (activityLoading ? <p className="mt-3 text-sm text-zinc-500">Loading customer activity...</p> : <div className="mt-3 space-y-2">{(activity?.rows ?? []).length ? activity?.rows.map((event) => <div key={event.id} className="rounded-lg border border-white/10 p-3 text-sm"><p className="font-semibold">{event.action.replaceAll(".", " ")}</p><p className="mt-1 text-zinc-500">{event.actor_name ?? "System"} · {formatDateTime(event.created_at)}</p></div>) : <p className="text-sm text-zinc-500">No customer activity recorded.</p>}{(activity?.total ?? 0) > 10 && <div className="flex items-center justify-between gap-2"><button type="button" disabled={activityPage <= 1} onClick={() => void loadActivity(activityPage - 1)} className="min-h-9 rounded-lg border border-white/15 px-3 text-sm disabled:opacity-35">Previous</button><span className="text-sm text-zinc-500">Page {activityPage} of {Math.ceil((activity?.total ?? 0) / 10)}</span><button type="button" disabled={activityPage >= Math.ceil((activity?.total ?? 0) / 10)} onClick={() => void loadActivity(activityPage + 1)} className="min-h-9 rounded-lg border border-white/15 px-3 text-sm disabled:opacity-35">Next</button></div>}</div>)}</details>
          </> : null}
        </section>
      </div>

      {showForm && <div className="fixed inset-0 z-[200] grid place-items-center bg-black/80 p-3" role="dialog" aria-modal="true" aria-labelledby="customer-form-title"><section className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-xl border border-[#D8C36A]/35 bg-zinc-950 p-5"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#D8C36A]">Customers</p><h3 id="customer-form-title" className="mt-1 text-2xl font-bold">{editing ? "Edit Customer" : "Add Customer"}</h3></div><button type="button" onClick={() => setShowForm(false)} className="min-h-10 rounded-lg border border-white/15 px-3">Close</button></div><div className="mt-5 grid gap-3 sm:grid-cols-2"><label className="text-sm text-zinc-300">First name *<input value={draft.firstName} onChange={(event) => setDraft({ ...draft, firstName: event.target.value })} className={`${inputClass()} mt-1`} /></label><label className="text-sm text-zinc-300">Surname *<input value={draft.surname} onChange={(event) => setDraft({ ...draft, surname: event.target.value })} className={`${inputClass()} mt-1`} /></label><label className="text-sm text-zinc-300">Email (optional)<input type="email" value={draft.email} onChange={(event) => setDraft({ ...draft, email: event.target.value })} className={`${inputClass()} mt-1`} /></label><label className="text-sm text-zinc-300">Mobile (optional)<span className="mt-1 block"><InternationalPhoneInput value={draft.mobile} onChange={(mobile) => setDraft({ ...draft, mobile })} /></span></label></div>
        {matches.length > 0 && <div className="mt-4 rounded-lg border border-amber-300/30 bg-amber-950/20 p-3"><p className="font-semibold text-amber-100">Possible existing customers</p><p className="mt-1 text-sm text-zinc-300">Matching details do not prove these are the same person. Choose an existing profile or deliberately create a separate customer.</p><div className="mt-3 space-y-2">{matches.map((match) => <button key={match.id} type="button" onClick={() => { setShowForm(false); void loadDetail(match.id); }} className="w-full rounded-lg border border-white/10 p-3 text-left"><span className="font-semibold">Use existing customer: {customerName(match)}</span><span className="mt-1 block text-xs text-zinc-400">{[match.email, match.mobile].filter(Boolean).join(" · ") || "No contact details"}</span></button>)}</div><button type="button" disabled={saving} onClick={() => void saveCustomer(true)} className="mt-3 min-h-10 rounded-lg border border-amber-200/35 px-4 text-sm font-semibold text-amber-100">Create new customer</button></div>}
        {error && <p role="alert" className="mt-3 text-sm text-red-200">{error}</p>}<div className="mt-5 flex gap-2"><button type="button" disabled={saving} onClick={() => void saveCustomer(false)} className="min-h-11 rounded-lg bg-[#D8C36A] px-5 text-sm font-bold text-black disabled:opacity-40">{saving ? "Saving..." : editing ? "Save Changes" : "Check & Create"}</button><button type="button" onClick={() => setShowForm(false)} className="min-h-11 rounded-lg border border-white/15 px-4 text-sm">Cancel</button></div></section></div>}
    </div>
  );
}
