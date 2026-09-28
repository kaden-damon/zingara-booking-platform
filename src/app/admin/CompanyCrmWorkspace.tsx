"use client";

import { useEffect, useMemo, useState } from "react";
import {
  emptyCompanyInput,
  type CompanyRecord,
  type CompanyWriteInput,
  type CrmReviewCandidate,
} from "@/lib/companyMaster";
import {
  getCompanies,
  getCrmReviewCandidates,
  linkCustomerCompany,
  reviewCrmCandidate,
  saveCompany,
} from "@/lib/supabase/companies";
import { paginateItems } from "@/lib/pagination";
import BookingPaginationControls from "./BookingPaginationControls";

type SelectedCustomer = {
  companyId: string | null;
  crmRevision: number;
  id: string;
  jobTitle: string | null;
  name: string;
};

type Props = {
  canManage: boolean;
  onCustomerChanged?: () => Promise<unknown> | void;
  selectedCustomer: SelectedCustomer | null;
};

type WorkspaceView = "closed" | "companies" | "review";
type CompanyViewMode = "compact" | "grid" | "list";

const companyViewModeSessionStorageKey = "zingara-admin-company-view-mode";

function inputClass() {
  return "h-10 w-full rounded-lg border border-white/15 bg-black px-3 text-sm text-white outline-none focus:border-[#D8C36A]/70 disabled:opacity-50";
}

function textValue(value: string | null | undefined) {
  return value ?? "";
}

function companyToInput(company: CompanyRecord): CompanyWriteInput {
  return {
    archived: Boolean(company.archivedAt),
    billingAddressLine1: company.billingAddress.addressLine1,
    billingAddressLine2: company.billingAddress.addressLine2,
    billingCity: company.billingAddress.city,
    billingCountry: company.billingAddress.country || "South Africa",
    billingEmail: textValue(company.billingEmail),
    billingPostalCode: company.billingAddress.postalCode,
    billingProvince: company.billingAddress.province,
    billingSuburb: company.billingAddress.suburb,
    legalName: company.legalName,
    phone: textValue(company.phone),
    physicalAddressDifferent: Boolean(company.physicalAddress),
    physicalAddressLine1: company.physicalAddress?.addressLine1 ?? "",
    physicalAddressLine2: company.physicalAddress?.addressLine2 ?? "",
    physicalCity: company.physicalAddress?.city ?? "",
    physicalCountry: company.physicalAddress?.country ?? "South Africa",
    physicalPostalCode: company.physicalAddress?.postalCode ?? "",
    physicalProvince: company.physicalAddress?.province ?? "",
    physicalSuburb: company.physicalAddress?.suburb ?? "",
    primaryContactCustomerId: company.primaryContactCustomerId,
    registrationNumber: textValue(company.registrationNumber),
    tradingName: textValue(company.tradingName),
    vatNumber: textValue(company.vatNumber),
  };
}

export default function CompanyCrmWorkspace({
  canManage,
  onCustomerChanged,
  selectedCustomer,
}: Props) {
  const [view, setView] = useState<WorkspaceView>("closed");
  const [companies, setCompanies] = useState<CompanyRecord[]>([]);
  const [reviews, setReviews] = useState<CrmReviewCandidate[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [companyViewMode, setCompanyViewMode] =
    useState<CompanyViewMode>("compact");
  const [companyViewModeLoaded, setCompanyViewModeLoaded] = useState(false);
  const [companyPage, setCompanyPage] = useState(1);
  const [companyPageSize, setCompanyPageSize] = useState(25);
  const [editingCompanyId, setEditingCompanyId] = useState<string | null>(null);
  const [companyDraft, setCompanyDraft] = useState<CompanyWriteInput>(
    emptyCompanyInput(),
  );
  const [showCompanyForm, setShowCompanyForm] = useState(false);
  const [customerCompanyId, setCustomerCompanyId] = useState("");
  const [customerJobTitle, setCustomerJobTitle] = useState("");
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [reviewSelections, setReviewSelections] = useState<Record<string, string>>({});

  async function loadWorkspace(includeReviews = view === "review") {
    setLoading(true);
    setError("");
    try {
      const [companyRows, reviewRows] = await Promise.all([
        getCompanies(true),
        includeReviews ? getCrmReviewCandidates() : Promise.resolve(reviews),
      ]);
      setCompanies(companyRows);
      if (includeReviews) setReviews(reviewRows);
      setLoaded(true);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Company information could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // This syncs the lazy CRM snapshot when a Customer is opened.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (selectedCustomer && !loaded && !loading) void loadWorkspace(false);
    // This is intentionally lazy: no Company request is added to Admin boot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCustomer?.id]);

  useEffect(() => {
    // The editable link draft follows the selected Customer record.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCustomerCompanyId(selectedCustomer?.companyId ?? "");
    setCustomerJobTitle(selectedCustomer?.jobTitle ?? "");
  }, [selectedCustomer]);

  useEffect(() => {
    const storedViewMode = window.sessionStorage.getItem(
      companyViewModeSessionStorageKey,
    );
    if (
      storedViewMode === "compact" ||
      storedViewMode === "grid" ||
      storedViewMode === "list"
    ) {
      // Session preference is external state and is read once on mount.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCompanyViewMode(storedViewMode);
    }
    setCompanyViewModeLoaded(true);
  }, []);

  useEffect(() => {
    if (!companyViewModeLoaded) return;
    window.sessionStorage.setItem(
      companyViewModeSessionStorageKey,
      companyViewMode,
    );
  }, [companyViewMode, companyViewModeLoaded]);

  const visibleCompanies = useMemo(() => {
    const term = search.trim().toLowerCase();
    return companies.filter((company) => {
      if (!term) return true;
      return [
        company.legalName,
        company.tradingName,
        company.registrationNumber,
        company.vatNumber,
        company.billingEmail,
      ].some((value) => value?.toLowerCase().includes(term));
    });
  }, [companies, search]);

  const companyPagination = useMemo(
    () => paginateItems(visibleCompanies, companyPage, companyPageSize),
    [companyPage, companyPageSize, visibleCompanies],
  );

  async function openView(nextView: Exclude<WorkspaceView, "closed">) {
    const closing = view === nextView;
    setView(closing ? "closed" : nextView);
    if (!closing) await loadWorkspace(nextView === "review");
  }

  function beginCreate() {
    setEditingCompanyId(null);
    setCompanyDraft(emptyCompanyInput());
    setShowCompanyForm(true);
    setError("");
    window.requestAnimationFrame(() => {
      document
        .getElementById("company-profile-editor")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function beginEdit(company: CompanyRecord) {
    setEditingCompanyId(company.id);
    setCompanyDraft(companyToInput(company));
    setShowCompanyForm(true);
    setError("");
    window.requestAnimationFrame(() => {
      document
        .getElementById("company-profile-editor")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function companyStatus(company: CompanyRecord) {
    return company.mergedIntoCompanyId
      ? "Merged"
      : company.archivedAt
        ? "Archived"
        : "Active";
  }

  async function persistCompany() {
    if (!canManage) return;
    const existing = companies.find((company) => company.id === editingCompanyId);
    setLoading(true);
    setError("");
    try {
      await saveCompany({
        companyId: editingCompanyId ?? undefined,
        expectedRevision: existing?.revision ?? 0,
        values: companyDraft,
      });
      setShowCompanyForm(false);
      setStatus(editingCompanyId ? "Company details updated." : "Company created.");
      await loadWorkspace(view === "review");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Company could not be saved.");
    } finally {
      setLoading(false);
    }
  }

  async function persistCustomerCompany() {
    if (!canManage || !selectedCustomer) return;
    setLoading(true);
    setError("");
    try {
      await linkCustomerCompany({
        companyId: customerCompanyId || null,
        customerId: selectedCustomer.id,
        expectedRevision: selectedCustomer.crmRevision,
        jobTitle: customerJobTitle,
      });
      setStatus(
        customerCompanyId
          ? `${selectedCustomer.name} linked to Company.`
          : `${selectedCustomer.name} unlinked from Company.`,
      );
      await onCustomerChanged?.();
      await loadWorkspace(false);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "The Customer Company link could not be saved.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function decideReview(
    review: CrmReviewCandidate,
    action: "keep-separate" | "link-to-company" | "merge" | "not-a-duplicate",
  ) {
    if (!canManage) return;
    const selectedId = reviewSelections[review.id];
    const note = reviewNotes[review.id]?.trim() ?? "";
    if (note.length < 5) {
      setError("Add a short Management Note before saving the decision.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const otherId = review.subjectIds.find((id) => id !== selectedId);
      await reviewCrmCandidate({
        action,
        companyId:
          review.candidateType === "company-as-person"
            ? String(review.evidence.companyId ?? "")
            : review.candidateType === "company-variant"
              ? selectedId
              : undefined,
        duplicateCustomerId:
          review.candidateType === "customer-duplicate" ? otherId : undefined,
        note,
        reviewId: review.id,
        survivorCustomerId:
          review.candidateType === "customer-duplicate" ? selectedId : undefined,
      });
      setStatus("Review decision saved.");
      await loadWorkspace(true);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Review decision could not be saved.");
    } finally {
      setLoading(false);
    }
  }

  const selectedCompany = companies.find(
    (company) => company.id === customerCompanyId,
  );
  const editingCompany = companies.find(
    (company) => company.id === editingCompanyId,
  );

  return (
    <div className="mb-6 space-y-4">
      <div className="flex flex-wrap items-center gap-2 border-b border-white/10 pb-4">
        <button
          type="button"
          onClick={() => void openView("companies")}
          className={`rounded-lg border px-4 py-2 text-sm font-semibold ${
            view === "companies"
              ? "border-[#D8C36A] bg-[#D8C36A] text-black"
              : "border-white/15 text-white"
          }`}
        >
          Companies
        </button>
        <button
          type="button"
          onClick={() => void openView("review")}
          className={`rounded-lg border px-4 py-2 text-sm font-semibold ${
            view === "review"
              ? "border-[#D8C36A] bg-[#D8C36A] text-black"
              : "border-white/15 text-white"
          }`}
        >
          Data Review{reviews.length > 0 ? ` (${reviews.length})` : ""}
        </button>
        {loading && <span className="text-sm text-zinc-400">Loading…</span>}
        {status && <span className="text-sm text-emerald-300">{status}</span>}
      </div>

      {error && (
        <div className="rounded-lg border border-red-400/30 bg-red-950/30 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}

      {selectedCustomer && (
        <section className="rounded-lg border border-[#D8C36A]/25 bg-black/35 p-4">
          <div className="flex flex-wrap items-end gap-3">
            <label className="min-w-60 flex-1 text-xs font-semibold uppercase tracking-[0.12em] text-zinc-400">
              Company
              <select
                className={`${inputClass()} mt-2`}
                value={customerCompanyId}
                disabled={!canManage || loading}
                onChange={(event) => setCustomerCompanyId(event.target.value)}
              >
                <option value="">No Company</option>
                {companies
                  .filter((company) => !company.archivedAt)
                  .map((company) => (
                    <option key={company.id} value={company.id}>
                      {company.legalName}
                    </option>
                  ))}
              </select>
            </label>
            <label className="min-w-52 flex-1 text-xs font-semibold uppercase tracking-[0.12em] text-zinc-400">
              Job Title / Role
              <input
                className={`${inputClass()} mt-2`}
                value={customerJobTitle}
                disabled={!canManage || loading || !customerCompanyId}
                onChange={(event) => setCustomerJobTitle(event.target.value)}
                placeholder="Optional"
              />
            </label>
            <button
              type="button"
              disabled={!canManage || loading}
              onClick={() => void persistCustomerCompany()}
              className="h-10 rounded-lg bg-[#D8C36A] px-4 text-sm font-bold text-black disabled:opacity-50"
            >
              Save Company Link
            </button>
          </div>
          {selectedCompany && (
            <p className="mt-3 text-sm text-zinc-400">
              {selectedCompany.contacts.length} contact{selectedCompany.contacts.length === 1 ? "" : "s"} · {selectedCompany.bookingCount} booking{selectedCompany.bookingCount === 1 ? "" : "s"}
            </p>
          )}
        </section>
      )}

      {view === "companies" && (
        <section className="rounded-lg border border-white/10 bg-zinc-950/80 p-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <h3 className="text-lg font-bold text-white">Company Directory</h3>
              <p className="text-sm text-zinc-400">
                Company details are shared by linked contacts.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <input
                aria-label="Search Companies"
                className={`${inputClass()} sm:w-64`}
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setCompanyPage(1);
                }}
                placeholder="Search Companies"
              />
              <div
                role="group"
                aria-label="Companies view mode"
                className="grid grid-cols-3 gap-1 rounded-full border border-white/15 bg-black/35 p-1"
              >
                {(
                  [
                    ["list", "List"],
                    ["grid", "Grid"],
                    ["compact", "Compact"],
                  ] as Array<[CompanyViewMode, string]>
                ).map(([mode, label]) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setCompanyViewMode(mode)}
                    className={`rounded-full px-3 py-2 text-xs font-semibold uppercase tracking-[0.1em] transition sm:px-4 ${
                      companyViewMode === mode
                        ? "bg-[#D8C36A] text-black"
                        : "text-zinc-300 hover:text-white"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                disabled={!canManage}
                onClick={beginCreate}
                className="h-10 rounded-full bg-[#D8C36A] px-5 text-xs font-bold uppercase tracking-[0.1em] text-black transition hover:bg-[#F2D66C] disabled:opacity-50"
              >
                + Create
              </button>
            </div>
          </div>

          {showCompanyForm && (
            <div
              id="company-profile-editor"
              className="mt-4 scroll-mt-6 rounded-lg border border-[#D8C36A]/25 bg-black p-4"
            >
              <div className="mb-4">
                <h4 className="font-bold text-white">
                  {editingCompanyId ? "Company Profile" : "Create Company"}
                </h4>
                <p className="mt-1 text-sm text-zinc-400">
                  {editingCompanyId
                    ? "Company details, contacts and booking history."
                    : "Add the shared Company details used by linked contacts."}
                </p>
              </div>
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                {(
                  [
                    ["Legal Company Name", "legalName"],
                    ["Trading Name", "tradingName"],
                    ["Company Registration Number", "registrationNumber"],
                    ["VAT Number", "vatNumber"],
                    ["Billing Email", "billingEmail"],
                    ["Company Phone", "phone"],
                    ["Address Line 1", "billingAddressLine1"],
                    ["Address Line 2", "billingAddressLine2"],
                    ["Suburb", "billingSuburb"],
                    ["City", "billingCity"],
                    ["Province", "billingProvince"],
                    ["Postal Code", "billingPostalCode"],
                    ["Country", "billingCountry"],
                  ] as Array<[string, keyof CompanyWriteInput]>
                ).map(([label, key]) => (
                  <label key={key} className="text-xs font-semibold uppercase tracking-[0.1em] text-zinc-400">
                    {label}
                    <input
                      className={`${inputClass()} mt-2`}
                      value={String(companyDraft[key] ?? "")}
                      onChange={(event) =>
                        setCompanyDraft((current) => ({ ...current, [key]: event.target.value }))
                      }
                    />
                  </label>
                ))}
              </div>
              <label className="mt-4 flex items-center gap-2 text-sm text-zinc-300">
                <input
                  type="checkbox"
                  checked={Boolean(companyDraft.physicalAddressDifferent)}
                  onChange={(event) =>
                    setCompanyDraft((current) => ({
                      ...current,
                      physicalAddressDifferent: event.target.checked,
                    }))
                  }
                />
                Physical address is different
              </label>
              {companyDraft.physicalAddressDifferent && (
                <div className="mt-3 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                  {(
                    [
                      ["Physical Address Line 1", "physicalAddressLine1"],
                      ["Physical Address Line 2", "physicalAddressLine2"],
                      ["Physical Suburb", "physicalSuburb"],
                      ["Physical City", "physicalCity"],
                      ["Physical Province", "physicalProvince"],
                      ["Physical Postal Code", "physicalPostalCode"],
                      ["Physical Country", "physicalCountry"],
                    ] as Array<[string, keyof CompanyWriteInput]>
                  ).map(([label, key]) => (
                    <label key={key} className="text-xs font-semibold uppercase tracking-[0.1em] text-zinc-400">
                      {label}
                      <input
                        className={`${inputClass()} mt-2`}
                        value={String(companyDraft[key] ?? "")}
                        onChange={(event) =>
                          setCompanyDraft((current) => ({ ...current, [key]: event.target.value }))
                        }
                      />
                    </label>
                  ))}
                </div>
              )}
              {editingCompanyId && (
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <label className="block text-xs font-semibold uppercase tracking-[0.1em] text-zinc-400">
                    Primary Contact
                    <select
                      className={`${inputClass()} mt-2`}
                      value={companyDraft.primaryContactCustomerId ?? ""}
                      onChange={(event) =>
                        setCompanyDraft((current) => ({
                          ...current,
                          primaryContactCustomerId: event.target.value || null,
                        }))
                      }
                    >
                      <option value="">Not selected</option>
                      {companies
                        .find((company) => company.id === editingCompanyId)
                        ?.contacts.map((contact) => (
                          <option key={contact.id} value={contact.id}>
                            {contact.firstName} {contact.surname ?? ""}
                          </option>
                        ))}
                    </select>
                  </label>
                  <div>
                    <label className="flex items-center gap-2 text-sm text-zinc-300">
                      <input
                        type="checkbox"
                        checked={Boolean(companyDraft.archived)}
                        onChange={(event) =>
                          setCompanyDraft((current) => ({
                            ...current,
                            archived: event.target.checked,
                          }))
                        }
                      />
                      Archive Company
                    </label>
                    {companyDraft.archived && (
                      <input
                        className={`${inputClass()} mt-2`}
                        value={companyDraft.archiveReason ?? ""}
                        onChange={(event) =>
                          setCompanyDraft((current) => ({
                            ...current,
                            archiveReason: event.target.value,
                          }))
                        }
                        placeholder="Archive reason"
                      />
                    )}
                  </div>
                </div>
              )}
              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={() => void persistCompany()}
                  disabled={
                    !canManage ||
                    loading ||
                    Boolean(editingCompany?.mergedIntoCompanyId)
                  }
                  className="rounded-lg bg-[#D8C36A] px-4 py-2 text-sm font-bold text-black disabled:opacity-50"
                >
                  Save Company
                </button>
                <button
                  type="button"
                  onClick={() => setShowCompanyForm(false)}
                  className="rounded-lg border border-white/15 px-4 py-2 text-sm text-white"
                >
                  Cancel
                </button>
              </div>
              {editingCompanyId && (
                <div className="mt-5 border-t border-white/10 pt-4">
                  <h4 className="text-sm font-bold text-white">Contacts and history</h4>
                  <div className="mt-3 grid gap-4 lg:grid-cols-2">
                    <div className="space-y-2 text-sm text-zinc-300">
                      {editingCompany?.contacts.map((contact) => (
                          <p key={contact.id}>
                            {contact.firstName} {contact.surname ?? ""}
                            {contact.jobTitle ? ` · ${contact.jobTitle}` : ""}
                            {contact.id === companyDraft.primaryContactCustomerId
                              ? " · Primary Contact"
                              : ""}
                          </p>
                        ))}
                    </div>
                    <div className="space-y-2 text-sm text-zinc-400">
                      {editingCompany?.bookingHistory
                        .slice(0, 10)
                        .map((booking) => (
                          <p key={booking.bookingReference}>
                            {booking.bookingReference} · {booking.guestCount} pax · {booking.status}
                          </p>
                        ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {companyViewMode === "compact" && (
            <div className="mt-4 overflow-hidden rounded-lg border border-[#8D7A2F]/30 bg-black/40">
              <div className="hidden min-h-9 grid-cols-[minmax(220px,2fr)_90px_90px_140px_90px_80px] items-center gap-3 border-b border-[#D8C36A]/25 bg-black/70 px-3 text-[0.62rem] font-semibold uppercase tracking-[0.06em] text-zinc-500 lg:grid">
                <span>Company</span><span>Contacts</span><span>Bookings</span>
                <span>Corporate Enquiries</span><span>Status</span><span>Action</span>
              </div>
              <div role="list" aria-label="Compact Companies">
                {companyPagination.items.map((company) => (
                  <div
                    key={company.id}
                    role="listitem"
                    className="grid min-h-14 gap-1 border-b border-white/[0.07] px-3 py-2 last:border-b-0 lg:min-h-11 lg:grid-cols-[minmax(220px,2fr)_90px_90px_140px_90px_80px] lg:items-center lg:gap-3 lg:py-1.5"
                  >
                    <button
                      type="button"
                      onClick={() => beginEdit(company)}
                      className="min-w-0 truncate text-left text-sm font-bold text-white transition hover:text-[#F2D66C] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D8C36A]"
                    >
                      {company.legalName}
                    </button>
                    <div className="flex items-center gap-3 text-xs text-zinc-400 lg:contents">
                      <span>{company.contacts.length}<span className="ml-1 lg:hidden">contacts</span></span>
                      <span>{company.bookingCount}<span className="ml-1 lg:hidden">bookings</span></span>
                      <span>{company.corporateRequestCount}<span className="ml-1 lg:hidden">enquiries</span></span>
                      <span className="rounded-full border border-white/15 px-2 py-0.5 text-[0.65rem] font-semibold uppercase text-zinc-300">
                        {companyStatus(company)}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => beginEdit(company)}
                      className="hidden rounded-full border border-[#D8C36A]/40 px-3 py-1.5 text-xs font-semibold text-[#F2D66C] transition hover:bg-[#D8C36A]/10 lg:inline-flex lg:justify-center"
                    >
                      Open
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {companyViewMode === "list" && (
            <div className="mt-4 space-y-2">
              {companyPagination.items.map((company) => (
                <article key={company.id} className="flex flex-col gap-3 rounded-lg border border-white/10 bg-black/40 p-3 sm:flex-row sm:items-center sm:justify-between">
                  <button type="button" onClick={() => beginEdit(company)} className="min-w-0 text-left">
                    <span className="block truncate text-sm font-bold text-white hover:text-[#F2D66C]">{company.legalName}</span>
                    <span className="mt-1 block truncate text-xs text-zinc-400">
                      {company.tradingName && company.tradingName !== company.legalName
                        ? `${company.tradingName} · `
                        : ""}
                      {company.billingEmail || "No billing email"}
                    </span>
                  </button>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-400">
                    <span>{company.contacts.length} contacts</span>
                    <span>{company.bookingCount} bookings</span>
                    <span>{company.corporateRequestCount} enquiries</span>
                    <span className="rounded-full border border-white/15 px-2 py-1 text-[0.65rem] font-semibold uppercase text-zinc-300">{companyStatus(company)}</span>
                    <button type="button" onClick={() => beginEdit(company)} className="rounded-full border border-[#D8C36A]/40 px-3 py-1.5 font-semibold text-[#F2D66C] hover:bg-[#D8C36A]/10">Open</button>
                  </div>
                </article>
              ))}
            </div>
          )}

          {companyViewMode === "grid" && (
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {companyPagination.items.map((company) => (
                <article key={company.id} className="rounded-lg border border-white/10 bg-black/40 p-3 transition hover:border-[#D8C36A]/40">
                  <button type="button" onClick={() => beginEdit(company)} className="w-full min-w-0 text-left">
                    <span className="block truncate text-sm font-bold text-white hover:text-[#F2D66C]">{company.legalName}</span>
                    <span className="mt-1 block truncate text-xs text-zinc-500">{company.tradingName || company.billingEmail || "Company profile"}</span>
                  </button>
                  <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-zinc-400">
                    <span>{company.contacts.length} contacts</span>
                    <span>{company.bookingCount} bookings</span>
                    <span>{company.corporateRequestCount} enquiries</span>
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-2">
                    <span className="rounded-full border border-white/15 px-2 py-1 text-[0.65rem] font-semibold uppercase text-zinc-300">{companyStatus(company)}</span>
                    <button type="button" onClick={() => beginEdit(company)} className="rounded-full border border-[#D8C36A]/40 px-3 py-1.5 text-xs font-semibold text-[#F2D66C] hover:bg-[#D8C36A]/10">Open</button>
                  </div>
                </article>
              ))}
            </div>
          )}

          {visibleCompanies.length === 0 && (
            <p className="mt-4 rounded-lg border border-white/10 bg-black/30 p-4 text-sm text-zinc-400">
              No Companies match this search.
            </p>
          )}

          <BookingPaginationControls
            key={`companies-${companyPageSize}`}
            itemLabel="Companies"
            onPageChange={setCompanyPage}
            onPageSizeChange={(pageSize) => {
              setCompanyPageSize(pageSize);
              setCompanyPage(1);
            }}
            pageSize={companyPageSize}
            window={companyPagination.window}
          />
        </section>
      )}

      {view === "review" && (
        <section className="rounded-lg border border-white/10 bg-zinc-950/80 p-4">
          <h3 className="text-lg font-bold text-white">CRM Data Review</h3>
          <p className="mt-1 text-sm text-zinc-400">
            Ambiguous records remain separate until an authorised staff member decides.
          </p>
          <div className="mt-4 space-y-3">
            {reviews.length === 0 ? (
              <p className="text-sm text-zinc-400">No review items are waiting.</p>
            ) : (
              reviews.map((review) => (
                <article key={review.id} className="rounded-lg border border-white/10 bg-black/40 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#D8C36A]">
                    {review.candidateType.replaceAll("-", " ")}
                  </p>
                  <p className="mt-2 font-semibold text-white">{review.displayNames.join(" / ")}</p>
                  <p className="mt-1 text-sm text-zinc-400">{review.reason}</p>
                  {(review.candidateType === "company-variant" ||
                    review.candidateType === "customer-duplicate") && (
                    <label className="mt-3 block max-w-lg text-xs font-semibold uppercase tracking-[0.1em] text-zinc-400">
                      Record to keep
                      <select
                        className={`${inputClass()} mt-2`}
                        value={reviewSelections[review.id] ?? ""}
                        onChange={(event) =>
                          setReviewSelections((current) => ({ ...current, [review.id]: event.target.value }))
                        }
                      >
                        <option value="">Select</option>
                        {review.subjectIds.map((id, index) => (
                          <option key={id} value={id}>{review.displayNames[index] ?? id}</option>
                        ))}
                      </select>
                    </label>
                  )}
                  <label className="mt-3 block text-xs font-semibold uppercase tracking-[0.1em] text-zinc-400">
                    Management Notes
                    <input
                      className={`${inputClass()} mt-2`}
                      value={reviewNotes[review.id] ?? ""}
                      onChange={(event) =>
                        setReviewNotes((current) => ({ ...current, [review.id]: event.target.value }))
                      }
                    />
                  </label>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {review.candidateType === "company-as-person" ? (
                      <button
                        type="button"
                        disabled={!canManage || loading}
                        onClick={() => void decideReview(review, "link-to-company")}
                        className="rounded-lg bg-[#D8C36A] px-3 py-2 text-xs font-bold text-black disabled:opacity-50"
                      >
                        Link to Company
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={!canManage || loading || !reviewSelections[review.id]}
                        onClick={() => void decideReview(review, "merge")}
                        className="rounded-lg bg-[#D8C36A] px-3 py-2 text-xs font-bold text-black disabled:opacity-50"
                      >
                        Merge
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={!canManage || loading}
                      onClick={() => void decideReview(review, "keep-separate")}
                      className="rounded-lg border border-white/20 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                    >
                      Keep Separate
                    </button>
                    <button
                      type="button"
                      disabled={!canManage || loading}
                      onClick={() => void decideReview(review, "not-a-duplicate")}
                      className="rounded-lg border border-white/20 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                    >
                      Not a Duplicate
                    </button>
                  </div>
                </article>
              ))
            )}
          </div>
        </section>
      )}
    </div>
  );
}
