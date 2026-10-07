"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import {
  calculateCorporateBuyoutCommercials,
  type CorporateBuyoutPackage,
  validateCorporateBuyoutGuestTerms,
} from "@/lib/corporateBuyouts";
import { fetchSupabaseApi } from "@/lib/supabase/apiClient";
import {
  createCorporateBuyout,
  getCorporateBuyoutBootstrap,
  getCorporateBuyoutEligibility,
  releaseCorporateBuyout,
  type CorporateBuyoutBootstrap,
  type CorporateBuyoutEligibility,
} from "@/lib/supabase/corporateBuyouts";
import { linkCustomerCompany, saveCompany } from "@/lib/supabase/companies";

type Props = {
  onCreated?: () => Promise<unknown> | void;
};

type CreatedCustomer = {
  crm_revision?: number;
  id?: string;
};

function money(value: number) {
  return new Intl.NumberFormat("en-ZA", {
    currency: "ZAR",
    minimumFractionDigits: 2,
    style: "currency",
  }).format(value);
}

function fieldClass() {
  return "mt-1 h-11 w-full rounded-xl border border-white/15 bg-black/55 px-3 text-sm text-white outline-none transition focus:border-[#D8C36A]/70 disabled:opacity-50";
}

function showLabel(show: CorporateBuyoutBootstrap["shows"][number]) {
  return `${show.venue} · ${show.date} · ${show.time.slice(0, 5)} · ${show.name}`;
}

export default function CorporateBuyoutCreator({ onCreated }: Props) {
  const [open, setOpen] = useState(false);
  const [bookingType, setBookingType] = useState<"group" | "buyout" | null>(null);
  const [data, setData] = useState<CorporateBuyoutBootstrap | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [showId, setShowId] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [contactId, setContactId] = useState("");
  const [packageId, setPackageId] = useState("");
  const [expectedGuests, setExpectedGuests] = useState("400");
  const [finalGuests, setFinalGuests] = useState("");
  const [eligibility, setEligibility] =
    useState<CorporateBuyoutEligibility | null>(null);
  const [eligibilityLoading, setEligibilityLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState("");
  const [creatingCompany, setCreatingCompany] = useState(false);
  const [releaseTarget, setReleaseTarget] = useState<CorporateBuyoutBootstrap["shows"][number] | null>(null);
  const [releaseReason, setReleaseReason] = useState("");
  const [newCompanyName, setNewCompanyName] = useState("");
  const [newContactName, setNewContactName] = useState("");
  const [newContactEmail, setNewContactEmail] = useState("");
  const [newContactMobile, setNewContactMobile] = useState("");
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const next = await getCorporateBuyoutBootstrap();
      setData(next);
      setPackageId((current) => current || next.packages[0]?.id || "");
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Full Show Buyouts could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() => {
      void load();
      closeButtonRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !saving) {
        setConfirming(false);
        setOpen(false);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, saving]);

  useEffect(() => {
    if (!showId) return;
    const controller = new AbortController();
    getCorporateBuyoutEligibility(showId, controller.signal)
      .then(setEligibility)
      .catch((loadError) => {
        if (loadError instanceof DOMException && loadError.name === "AbortError") {
          return;
        }
        setError(
          loadError instanceof Error
            ? loadError.message
            : "This performance could not be checked.",
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setEligibilityLoading(false);
      });
    return () => controller.abort();
  }, [showId]);

  const selectedCompany = data?.companies.find(
    (company) => company.id === companyId,
  );
  const selectedShow = data?.shows.find((show) => show.id === showId);
  const selectedPackage = data?.packages.find(
    (item) => item.id === packageId,
  );
  const selectedContact = selectedCompany?.contacts.find(
    (contact) => contact.id === contactId,
  );
  const currentGuestCount = Number(finalGuests || expectedGuests);
  const guestError = selectedPackage
    ? validateCorporateBuyoutGuestTerms({
        additionalGuestRate: selectedPackage.additionalGuestRate,
        guestCount: currentGuestCount,
        includedGuestCount: selectedPackage.includedGuestCount,
        maximumGuestCount: selectedPackage.maximumGuestCount,
      })
    : "Choose a Buyout package.";
  const commercials = selectedPackage
    ? calculateCorporateBuyoutCommercials({
        additionalGuestRate: selectedPackage.additionalGuestRate,
        guestCount: currentGuestCount,
        package: selectedPackage,
      })
    : null;
  const ready = Boolean(
    data?.canCreate &&
      selectedShow &&
      selectedCompany &&
      selectedContact &&
      selectedPackage &&
      eligibility?.available &&
      !guestError,
  );

  const packageCards = useMemo(
    () => data?.packages ?? [],
    [data?.packages],
  );
  const activeBuyoutShows = useMemo(
    () => data?.shows.filter((show) => Boolean(show.activeBuyout)) ?? [],
    [data?.shows],
  );

  async function createCompanyAndContact() {
    if (!newCompanyName.trim() || !newContactName.trim()) {
      setError("Enter the Company and Contact names.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const customerPayload = await fetchSupabaseApi<{ row: CreatedCustomer }>(
        "/api/admin/customers",
        {
          body: {
            input: {
              email: newContactEmail,
              mobile: newContactMobile,
              name: newContactName,
            },
          },
          method: "POST",
        },
      );
      const customer = customerPayload.row;
      if (!customer.id) throw new Error("The Contact could not be created.");
      const company = await saveCompany({
        expectedRevision: 0,
        values: {
          billingEmail: newContactEmail,
          legalName: newCompanyName,
        },
      });
      await linkCustomerCompany({
        companyId: company.id,
        customerId: customer.id,
        expectedRevision: Number(customer.crm_revision ?? 1),
        jobTitle: "",
      });
      const next = await getCorporateBuyoutBootstrap();
      setData(next);
      setCompanyId(company.id);
      setContactId(customer.id);
      setCreatingCompany(false);
      setStatus("Company and Contact ready.");
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "The Company and Contact could not be saved.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function submit() {
    if (!ready || !selectedPackage) return;
    setSaving(true);
    setError("");
    try {
      const key = idempotencyKey || crypto.randomUUID();
      setIdempotencyKey(key);
      const result = await createCorporateBuyout({
        companyId,
        contactCustomerId: contactId,
        expectedGuestCount: Number(expectedGuests),
        finalGuestCount: finalGuests ? Number(finalGuests) : null,
        idempotencyKey: key,
        packageId: selectedPackage.id,
        showId,
      });
      setConfirming(false);
      setStatus(`Full Show Buyout ${result.bookingReference} created.`);
      await onCreated?.();
      await load();
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "The Full Show Buyout could not be created.",
      );
      setConfirming(false);
    } finally {
      setSaving(false);
    }
  }

  async function releaseBuyout() {
    const buyout = releaseTarget?.activeBuyout;
    if (!buyout || !releaseReason.trim()) return;
    setSaving(true);
    setError("");
    try {
      await releaseCorporateBuyout({
        buyoutId: buyout.id,
        expectedRevision: buyout.revision,
        reason: releaseReason.trim(),
      });
      setReleaseTarget(null);
      setReleaseReason("");
      setStatus(`Full Show Buyout ${buyout.bookingReference} released.`);
      await onCreated?.();
      await load();
    } catch (releaseError) {
      setError(
        releaseError instanceof Error
          ? releaseError.message
          : "The Full Show Buyout could not be released.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          setBookingType(null);
          setError("");
          setStatus("");
        }}
        className="rounded-full bg-[#D8C36A] px-5 py-3 text-sm font-bold text-black transition hover:bg-[#F2D66C] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F2D66C]"
      >
        Create Booking
      </button>

      {open && (
        <div className="fixed inset-0 z-[170] flex items-end justify-center bg-black/80 p-3 backdrop-blur-sm sm:items-center sm:p-6">
          <section
            aria-labelledby="buyout-creator-title"
            aria-modal="true"
            role="dialog"
            className="max-h-[94vh] w-full max-w-4xl overflow-y-auto rounded-2xl border border-[#D8C36A]/35 bg-[#080808] p-5 shadow-2xl sm:p-7"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#D8C36A]">
                  Corporate
                </p>
                <h2 id="buyout-creator-title" className="mt-1 text-2xl font-bold text-white">
                  Create Booking
                </h2>
              </div>
              <button
                ref={closeButtonRef}
                type="button"
                aria-label="Close Corporate booking creator"
                onClick={() => !saving && setOpen(false)}
                className="grid h-11 w-11 place-items-center rounded-full border border-white/15 text-xl text-zinc-300 transition hover:border-white/35 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#D8C36A]"
              >
                ×
              </button>
            </div>

            {error && (
              <p role="alert" className="mt-4 rounded-xl border border-red-400/35 bg-red-950/30 p-3 text-sm text-red-100">
                {error}
              </p>
            )}
            {status && (
              <p role="status" className="mt-4 rounded-xl border border-emerald-400/35 bg-emerald-950/30 p-3 text-sm text-emerald-100">
                {status}
              </p>
            )}

            {!bookingType ? (
              <div className="mt-6 grid gap-4 md:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setBookingType("group")}
                  className="min-h-40 rounded-2xl border border-white/15 bg-black/35 p-5 text-left transition hover:border-[#D8C36A]/55 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#D8C36A]"
                >
                  <span className="text-lg font-bold text-white">Group Booking</span>
                  <span className="mt-2 block text-sm leading-6 text-zinc-400">
                    Continue with the existing Corporate group-booking process.
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setBookingType("buyout")}
                  className="min-h-40 rounded-2xl border border-[#D8C36A]/45 bg-[#171107] p-5 text-left transition hover:border-[#F2D66C] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#D8C36A]"
                >
                  <span className="text-lg font-bold text-[#F2D66C]">Full Show Buyout</span>
                  <span className="mt-2 block text-sm leading-6 text-zinc-300">
                    One Company owns the full performance under a fixed package.
                  </span>
                </button>
              </div>
            ) : bookingType === "group" ? (
              <div className="mt-6 rounded-2xl border border-white/10 bg-black/35 p-5">
                <h3 className="text-lg font-bold text-white">Group Booking</h3>
                <p className="mt-2 text-sm leading-6 text-zinc-300">
                  Group Booking is unchanged. Use the + action on the required performance in Show &amp; Availability Management, then choose Corporate Booking.
                </p>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="mt-5 rounded-full bg-[#D8C36A] px-5 py-3 text-sm font-bold text-black"
                >
                  Close
                </button>
              </div>
            ) : loading || !data ? (
              <p className="mt-8 text-sm text-zinc-400">Loading Buyout details...</p>
            ) : (
              <div className="mt-6 space-y-6">
                {!data.canCreate && (
                  <p className="rounded-xl border border-amber-300/30 bg-amber-950/25 p-3 text-sm text-amber-100">
                    Booking and show management access is required to create a Full Show Buyout.
                  </p>
                )}

                {activeBuyoutShows.length > 0 && (
                  <section aria-labelledby="active-buyouts-title" className="rounded-2xl border border-white/10 bg-black/35 p-4">
                    <h3 id="active-buyouts-title" className="text-sm font-bold text-white">Active Full Show Buyouts</h3>
                    <div className="mt-3 space-y-2">
                      {activeBuyoutShows.map((show) => (
                        <div key={show.id} className="flex flex-col gap-3 rounded-xl border border-[#D8C36A]/20 p-3 sm:flex-row sm:items-center sm:justify-between">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-white">{show.activeBuyout?.companyName} · {show.activeBuyout?.packageName}</p>
                            <p className="mt-1 text-xs text-zinc-400">{showLabel(show)} · {show.activeBuyout?.currentGuestCount} guests</p>
                          </div>
                          {data.canCreate && (
                            <button type="button" onClick={() => setReleaseTarget(show)} className="rounded-full border border-red-300/30 px-4 py-2 text-xs font-bold text-red-100 transition hover:border-red-200">
                              Release Buyout
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                <div className="grid gap-4 md:grid-cols-2">
                  <label className="text-sm font-semibold text-zinc-300">
                    Performance
                    <select value={showId} onChange={(event) => { setShowId(event.target.value); setEligibility(null); setEligibilityLoading(Boolean(event.target.value)); }} className={fieldClass()}>
                      <option value="">Choose performance</option>
                      {data.shows.map((show) => (
                        <option key={show.id} value={show.id} disabled={Boolean(show.activeBuyout)}>
                          {showLabel(show)}{show.activeBuyout ? " · Buyout already exists" : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-sm font-semibold text-zinc-300">
                    Company
                    <select value={companyId} onChange={(event) => { setCompanyId(event.target.value); setContactId(""); }} className={fieldClass()}>
                      <option value="">Choose Company</option>
                      {data.companies.map((company) => (
                        <option key={company.id} value={company.id}>{company.legalName}</option>
                      ))}
                    </select>
                  </label>
                  <label className="text-sm font-semibold text-zinc-300 md:col-start-2">
                    Contact
                    <select value={contactId} onChange={(event) => setContactId(event.target.value)} disabled={!selectedCompany} className={fieldClass()}>
                      <option value="">Choose Contact</option>
                      {(selectedCompany?.contacts ?? []).map((contact) => (
                        <option key={contact.id} value={contact.id}>
                          {[contact.firstName, contact.surname].filter(Boolean).join(" ")}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <button type="button" onClick={() => setCreatingCompany((value) => !value)} className="text-sm font-semibold text-[#F2D66C] underline-offset-4 hover:underline">
                  {creatingCompany ? "Use an existing Company" : "Create Company and Contact"}
                </button>
                {creatingCompany && (
                  <div className="grid gap-3 rounded-2xl border border-white/10 bg-black/35 p-4 sm:grid-cols-2">
                    <label className="text-sm text-zinc-300">Company name<input className={fieldClass()} value={newCompanyName} onChange={(event) => setNewCompanyName(event.target.value)} /></label>
                    <label className="text-sm text-zinc-300">Contact name<input className={fieldClass()} value={newContactName} onChange={(event) => setNewContactName(event.target.value)} /></label>
                    <label className="text-sm text-zinc-300">Contact email<input type="email" className={fieldClass()} value={newContactEmail} onChange={(event) => setNewContactEmail(event.target.value)} /></label>
                    <label className="text-sm text-zinc-300">Contact mobile<input className={fieldClass()} value={newContactMobile} onChange={(event) => setNewContactMobile(event.target.value)} /></label>
                    <button type="button" disabled={saving} onClick={() => void createCompanyAndContact()} className="rounded-full border border-[#D8C36A]/45 px-5 py-3 text-sm font-bold text-[#F2D66C] disabled:opacity-50 sm:col-span-2 sm:w-fit">
                      {saving ? "Saving..." : "Save Company and Contact"}
                    </button>
                  </div>
                )}

                {showId && (
                  <div className={`rounded-xl border p-3 text-sm ${eligibility?.available ? "border-emerald-400/30 bg-emerald-950/25 text-emerald-100" : "border-amber-300/30 bg-amber-950/25 text-amber-100"}`}>
                    {eligibilityLoading
                      ? "Checking this performance..."
                      : eligibility?.available
                        ? "This performance has no active bookings and is available for a Buyout."
                        : `This performance cannot be used for a Buyout. ${eligibility?.activeBookingCount ?? 0} active booking${eligibility?.activeBookingCount === 1 ? "" : "s"} with ${eligibility?.activeGuestCount ?? 0} guests currently hold entitlement.`}
                  </div>
                )}

                <fieldset>
                  <legend className="text-sm font-semibold text-zinc-300">Package</legend>
                  <div className="mt-2 grid gap-3 lg:grid-cols-3">
                    {packageCards.map((item) => (
                      <PackageCard key={item.id} item={item} selected={item.id === packageId} onSelect={() => setPackageId(item.id)} />
                    ))}
                  </div>
                </fieldset>

                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="text-sm font-semibold text-zinc-300">
                    Expected guests
                    <input type="number" min="1" step="1" value={expectedGuests} onChange={(event) => setExpectedGuests(event.target.value)} className={fieldClass()} />
                  </label>
                  <label className="text-sm font-semibold text-zinc-300">
                    Final guests <span className="font-normal text-zinc-500">(optional)</span>
                    <input type="number" min="1" step="1" value={finalGuests} onChange={(event) => setFinalGuests(event.target.value)} className={fieldClass()} />
                  </label>
                </div>
                {guestError && <p className="text-sm text-amber-200">{guestError}</p>}

                {selectedPackage && commercials && (
                  <div className="grid gap-4 rounded-2xl border border-[#D8C36A]/25 bg-[#130e06] p-5 lg:grid-cols-[1fr_auto]">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#D8C36A]">Review</p>
                      <h3 className="mt-2 text-xl font-bold text-white">Full Show Buyout</h3>
                      <p className="mt-2 text-sm text-zinc-300">{selectedCompany?.legalName ?? "Choose Company"} · {selectedPackage.displayName}</p>
                      <p className="mt-1 text-sm text-zinc-400">{selectedShow ? showLabel(selectedShow) : "Choose performance"}</p>
                      <p className="mt-1 text-sm text-zinc-400">{currentGuestCount || 0} guests · Awaiting Payment</p>
                      <p className="mt-3 text-sm text-amber-100">Public booking will close for this performance. Guests remain unallocated until Floor planning is completed.</p>
                    </div>
                    <dl className="min-w-52 space-y-2 text-sm">
                      <div className="flex justify-between gap-5"><dt className="text-zinc-400">Base</dt><dd>{money(commercials.baseAmount)}</dd></div>
                      <div className="flex justify-between gap-5"><dt className="text-zinc-400">Gratuity</dt><dd>{money(commercials.gratuityAmount)}</dd></div>
                      <div className="flex justify-between gap-5"><dt className="text-zinc-400">VAT</dt><dd>{money(commercials.vatAmount)}</dd></div>
                      {commercials.additionalGuests > 0 && <div className="flex justify-between gap-5"><dt className="text-zinc-400">Extra guests</dt><dd>{money(commercials.additionalGuestAmount)}</dd></div>}
                      <div className="flex justify-between gap-5 border-t border-white/10 pt-2 text-base font-bold"><dt>Total</dt><dd className="text-[#F2D66C]">{money(commercials.totalAmount)}</dd></div>
                    </dl>
                  </div>
                )}

                <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                  <button type="button" onClick={() => setBookingType(null)} className="rounded-full border border-white/15 px-5 py-3 text-sm font-semibold text-zinc-200">Back</button>
                  <button type="button" disabled={!ready || saving} onClick={() => setConfirming(true)} className="rounded-full bg-[#D8C36A] px-6 py-3 text-sm font-bold text-black disabled:cursor-not-allowed disabled:opacity-40">Review Buyout</button>
                </div>
              </div>
            )}
          </section>
        </div>
      )}

      {confirming && selectedShow && selectedCompany && selectedPackage && (
        <div className="fixed inset-0 z-[180] flex items-center justify-center bg-black/85 p-4">
          <section aria-labelledby="confirm-buyout-title" aria-modal="true" role="alertdialog" className="w-full max-w-lg rounded-2xl border border-[#D8C36A]/40 bg-[#090909] p-6 shadow-2xl">
            <h2 id="confirm-buyout-title" className="text-xl font-bold text-white">Create this Full Show Buyout?</h2>
            <p className="mt-3 text-sm leading-6 text-zinc-300">{selectedCompany.legalName} · {selectedPackage.displayName} · {currentGuestCount} guests</p>
            <p className="mt-2 text-sm leading-6 text-amber-100">Public booking will close for this performance. Existing bookings will not be changed.</p>
            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button type="button" disabled={saving} onClick={() => setConfirming(false)} className="rounded-full border border-white/15 px-5 py-3 text-sm font-semibold text-zinc-200">Cancel</button>
              <button type="button" disabled={saving} onClick={() => void submit()} className="rounded-full bg-[#D8C36A] px-6 py-3 text-sm font-bold text-black disabled:opacity-50">{saving ? "Creating..." : "Create Buyout"}</button>
            </div>
          </section>
        </div>
      )}


      {releaseTarget?.activeBuyout && (
        <div className="fixed inset-0 z-[185] flex items-center justify-center bg-black/85 p-4">
          <section aria-labelledby="release-buyout-title" aria-modal="true" role="alertdialog" className="w-full max-w-lg rounded-2xl border border-red-300/30 bg-[#090909] p-6 shadow-2xl">
            <h2 id="release-buyout-title" className="text-xl font-bold text-white">Release this Full Show Buyout?</h2>
            <p className="mt-3 text-sm leading-6 text-zinc-300">
              {releaseTarget.activeBuyout.bookingReference} · {releaseTarget.activeBuyout.companyName}
            </p>
            <p className="mt-2 text-sm leading-6 text-amber-100">
              The booking will be cancelled and public booking will follow the performance&apos;s normal status, dates and capacity. Payments must be reviewed first.
            </p>
            <label className="mt-4 block text-sm font-semibold text-zinc-300">
              Reason
              <textarea value={releaseReason} onChange={(event) => setReleaseReason(event.target.value)} rows={3} className="mt-1 w-full rounded-xl border border-white/15 bg-black/55 p-3 text-sm text-white outline-none focus:border-[#D8C36A]/70" />
            </label>
            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button type="button" disabled={saving} onClick={() => { setReleaseTarget(null); setReleaseReason(""); }} className="rounded-full border border-white/15 px-5 py-3 text-sm font-semibold text-zinc-200">Cancel</button>
              <button type="button" disabled={saving || !releaseReason.trim()} onClick={() => void releaseBuyout()} className="rounded-full bg-red-200 px-6 py-3 text-sm font-bold text-red-950 disabled:opacity-50">{saving ? "Releasing..." : "Release Buyout"}</button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}

function PackageCard({
  item,
  onSelect,
  selected,
}: {
  item: CorporateBuyoutPackage;
  onSelect: () => void;
  selected: boolean;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={`rounded-2xl border p-4 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#D8C36A] ${selected ? "border-[#D8C36A] bg-[#181107]" : "border-white/10 bg-black/35 hover:border-white/25"}`}
    >
      <span className="font-bold text-white">{item.displayName}</span>
      <span className="mt-2 block text-lg font-bold text-[#F2D66C]">{money(item.totalAmount)}</span>
      <span className="mt-1 block text-xs text-zinc-400">Fixed package · up to {item.includedGuestCount} guests</span>
      <span className="mt-3 block text-xs leading-5 text-zinc-400">{item.inclusions.slice(0, 3).join(" · ")}</span>
    </button>
  );
}
