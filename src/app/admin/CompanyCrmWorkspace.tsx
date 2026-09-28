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
    if (selectedCustomer && !loaded && !loading) void loadWorkspace(false);
    // This is intentionally lazy: no Company request is added to Admin boot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCustomer?.id]);

  useEffect(() => {
    setCustomerCompanyId(selectedCustomer?.companyId ?? "");
    setCustomerJobTitle(selectedCustomer?.jobTitle ?? "");
  }, [selectedCustomer]);

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
  }

  function beginEdit(company: CompanyRecord) {
    setEditingCompanyId(company.id);
    setCompanyDraft(companyToInput(company));
    setShowCompanyForm(true);
    setError("");
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
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-bold text-white">Company Directory</h3>
              <p className="text-sm text-zinc-400">
                Company details are stored once and shared by linked contacts.
              </p>
            </div>
            <div className="flex gap-2">
              <input
                className={`${inputClass()} w-64`}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search Companies"
              />
              <button
                type="button"
                disabled={!canManage}
                onClick={beginCreate}
                className="rounded-lg bg-[#D8C36A] px-4 text-sm font-bold text-black disabled:opacity-50"
              >
                Create Company
              </button>
            </div>
          </div>

          {showCompanyForm && (
            <div className="mt-4 rounded-lg border border-[#D8C36A]/25 bg-black p-4">
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
                  disabled={loading}
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
            </div>
          )}

          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {visibleCompanies.map((company) => (
              <article key={company.id} className="rounded-lg border border-white/10 bg-black/40 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h4 className="font-bold text-white">{company.legalName}</h4>
                    {company.tradingName && company.tradingName !== company.legalName && (
                      <p className="text-sm text-zinc-400">Trading as {company.tradingName}</p>
                    )}
                  </div>
                  <button
                    type="button"
                    disabled={!canManage || Boolean(company.mergedIntoCompanyId)}
                    onClick={() => beginEdit(company)}
                    className="rounded-lg border border-[#D8C36A]/40 px-3 py-1.5 text-xs font-semibold text-[#F2D66C] disabled:opacity-50"
                  >
                    Edit
                  </button>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-sm text-zinc-300">
                  <span>{company.contacts.length} Contacts</span>
                  <span>{company.bookingCount} Bookings</span>
                  <span>{company.corporateRequestCount} Corporate enquiries</span>
                  <span>
                    {company.mergedIntoCompanyId
                      ? "Merged"
                      : company.archivedAt
                        ? "Archived"
                        : "Active"}
                  </span>
                </div>
                {company.contacts.length > 0 && (
                  <details className="mt-3 border-t border-white/10 pt-3">
                    <summary className="cursor-pointer text-sm font-semibold text-[#D8C36A]">Contacts and history</summary>
                    <div className="mt-2 space-y-2 text-sm text-zinc-300">
                      {company.contacts.map((contact) => (
                        <p key={contact.id}>
                          {contact.firstName} {contact.surname ?? ""}
                          {contact.jobTitle ? ` · ${contact.jobTitle}` : ""}
                          {contact.id === company.primaryContactCustomerId ? " · Primary Contact" : ""}
                        </p>
                      ))}
                      {company.bookingHistory.slice(0, 5).map((booking) => (
                        <p key={booking.bookingReference} className="text-zinc-500">
                          {booking.bookingReference} · {booking.guestCount} pax · {booking.status}
                        </p>
                      ))}
                    </div>
                  </details>
                )}
              </article>
            ))}
          </div>
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
