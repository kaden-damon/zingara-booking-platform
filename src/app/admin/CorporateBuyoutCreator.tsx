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
  type CorporateBuyoutBootstrap,
} from "@/lib/supabase/corporateBuyouts";
import { linkCustomerCompany, saveCompany } from "@/lib/supabase/companies";

export type CorporateBuyoutSelectedShow = {
  date: string;
  id: string;
  name: string;
  time: string;
  venue: string;
};

type Props = {
  onClose: () => void;
  onCreated?: () => Promise<unknown> | void;
  onReviewBookings: (showId: string) => void;
  open: boolean;
  selectedShow: CorporateBuyoutSelectedShow | null;
};

type CreatedCustomer = { crm_revision?: number; id?: string };

const fieldClass = () =>
  "mt-1 h-11 w-full rounded-xl border border-white/15 bg-black/55 px-3 text-sm text-white outline-none transition focus:border-[#D8C36A]/70 disabled:opacity-50";

function money(value: number) {
  return new Intl.NumberFormat("en-ZA", {
    currency: "ZAR",
    minimumFractionDigits: 2,
    style: "currency",
  }).format(value);
}

function formatShowDate(date: string) {
  return new Intl.DateTimeFormat("en-ZA", {
    day: "numeric",
    month: "long",
    timeZone: "Africa/Johannesburg",
    year: "numeric",
  }).format(new Date(`${date}T12:00:00+02:00`));
}

export default function CorporateBuyoutCreator({
  onClose,
  onCreated,
  onReviewBookings,
  open,
  selectedShow,
}: Props) {
  const [data, setData] = useState<CorporateBuyoutBootstrap | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [contactId, setContactId] = useState("");
  const [packageId, setPackageId] = useState("");
  const [expectedGuests, setExpectedGuests] = useState("400");
  const [finalGuests, setFinalGuests] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState("");
  const [creatingCompany, setCreatingCompany] = useState(false);
  const [newCompanyName, setNewCompanyName] = useState("");
  const [newContactName, setNewContactName] = useState("");
  const [newContactEmail, setNewContactEmail] = useState("");
  const [newContactMobile, setNewContactMobile] = useState("");
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  async function load(showId: string, signal?: AbortSignal) {
    setLoading(true);
    setError("");
    try {
      const next = await getCorporateBuyoutBootstrap(showId, signal);
      setData(next);
      setPackageId((current) => current || next.packages[0]?.id || "");
    } catch (loadError) {
      if (loadError instanceof DOMException && loadError.name === "AbortError") return;
      setError(loadError instanceof Error ? loadError.message : "Full Show Buyout details could not be loaded.");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }

  useEffect(() => {
    if (!open || !selectedShow) return;
    const controller = new AbortController();
    const frame = window.requestAnimationFrame(() => {
      void load(selectedShow.id, controller.signal);
      closeButtonRef.current?.focus();
    });
    return () => {
      controller.abort();
      window.cancelAnimationFrame(frame);
    };
  }, [open, selectedShow]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !saving) {
        setConfirming(false);
        onClose();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose, open, saving]);

  const authoritativeShow = data?.shows[0];
  const selectedCompany = data?.companies.find((company) => company.id === companyId);
  const selectedContact = selectedCompany?.contacts.find((contact) => contact.id === contactId);
  const selectedPackage = data?.packages.find((item) => item.id === packageId);
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
    data?.canCreate && authoritativeShow && selectedCompany && selectedContact &&
      selectedPackage && data.eligibility?.available && !guestError,
  );
  const packageCards = useMemo(() => data?.packages ?? [], [data?.packages]);

  async function createCompanyAndContact() {
    if (!selectedShow || !newCompanyName.trim() || !newContactName.trim()) {
      setError("Enter the Company and Contact names.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const response = await fetchSupabaseApi<{ row: CreatedCustomer }>(
        "/api/admin/customers",
        {
          body: { input: { email: newContactEmail, mobile: newContactMobile, name: newContactName } },
          method: "POST",
        },
      );
      if (!response.row.id) throw new Error("The Contact could not be created.");
      const company = await saveCompany({
        expectedRevision: 0,
        values: { billingEmail: newContactEmail, legalName: newCompanyName },
      });
      await linkCustomerCompany({
        companyId: company.id,
        customerId: response.row.id,
        expectedRevision: Number(response.row.crm_revision ?? 1),
        jobTitle: "",
      });
      setData(await getCorporateBuyoutBootstrap(selectedShow.id));
      setCompanyId(company.id);
      setContactId(response.row.id);
      setCreatingCompany(false);
      setStatus("Company and Contact ready.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "The Company and Contact could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  async function submit() {
    if (!ready || !selectedPackage || !authoritativeShow) return;
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
        showId: authoritativeShow.id,
      });
      setConfirming(false);
      setStatus(`Full Show Buyout ${result.bookingReference} created.`);
      await onCreated?.();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "The Full Show Buyout could not be created.");
      setConfirming(false);
    } finally {
      setSaving(false);
    }
  }

  if (!open || !selectedShow) return null;
  const displayShow = authoritativeShow ?? { ...selectedShow, activeBuyout: null, status: "active" };
  const eligibility = data?.eligibility;

  return (
    <>
      <div className="fixed inset-0 z-[170] flex items-end justify-center bg-black/80 p-3 backdrop-blur-sm sm:items-center sm:p-6">
        <section aria-labelledby="buyout-creator-title" aria-modal="true" role="dialog" className="max-h-[94vh] w-full max-w-4xl overflow-y-auto rounded-2xl border border-[#D8C36A]/35 bg-[#080808] p-5 shadow-2xl sm:p-7">
          <div className="flex items-start justify-between gap-4">
            <div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#D8C36A]">Create Booking</p><h2 id="buyout-creator-title" className="mt-1 text-2xl font-bold text-white">Full Show Buyout</h2></div>
            <button ref={closeButtonRef} type="button" aria-label="Close Full Show Buyout" onClick={() => !saving && onClose()} className="grid h-11 w-11 place-items-center rounded-full border border-white/15 text-xl text-zinc-300 transition hover:border-white/35 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#D8C36A]">×</button>
          </div>

          <dl className="mt-5 grid grid-cols-1 gap-3 rounded-2xl border border-[#D8C36A]/25 bg-[#130e06] p-4 sm:grid-cols-3">
            {[["Venue", displayShow.venue], ["Date", formatShowDate(displayShow.date)], ["Time", displayShow.time.slice(0, 5)]].map(([label, value]) => <div key={label}><dt className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-[#D8C36A]">{label}</dt><dd className="mt-1 text-sm font-semibold text-white">{value}</dd></div>)}
          </dl>

          {error && <p role="alert" className="mt-4 rounded-xl border border-red-400/35 bg-red-950/30 p-3 text-sm text-red-100">{error}</p>}
          {status && <p role="status" className="mt-4 rounded-xl border border-emerald-400/35 bg-emerald-950/30 p-3 text-sm text-emerald-100">{status}</p>}
          {loading || !data ? <p className="mt-8 text-sm text-zinc-400">Loading Buyout details...</p> : (
            <div className="mt-6 space-y-6">
              {!data.canCreate && <p className="rounded-xl border border-amber-300/30 bg-amber-950/25 p-3 text-sm text-amber-100">Booking and show management access is required to create a Full Show Buyout.</p>}
              {eligibility && !eligibility.available && (
                <div className="rounded-xl border border-amber-300/30 bg-amber-950/25 p-4 text-sm text-amber-100">
                  {eligibility.activeBookingCount > 0 ? <><p>This show already has {eligibility.activeBookingCount} booking{eligibility.activeBookingCount === 1 ? "" : "s"} for {eligibility.activeGuestCount} guest{eligibility.activeGuestCount === 1 ? "" : "s"}. Resolve these bookings before creating a Full Show Buyout.</p><button type="button" onClick={() => onReviewBookings(authoritativeShow?.id ?? selectedShow.id)} className="mt-3 min-h-11 rounded-full border border-[#D8C36A]/55 px-4 py-2 text-sm font-bold text-[#F2D66C] transition hover:bg-[#D8C36A] hover:text-black">Review Bookings</button></> : eligibility.buyoutState ? <p>This show already has an active Full Show Buyout.</p> : <p>This show is not currently available for a Full Show Buyout.</p>}
                </div>
              )}
              {eligibility?.available && <p className="rounded-xl border border-emerald-400/30 bg-emerald-950/25 p-3 text-sm text-emerald-100">This show has no active bookings and is available for a Full Show Buyout.</p>}

              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_2.75rem] sm:items-end">
                <label className="text-sm font-semibold text-zinc-300">Company<select value={companyId} onChange={(event) => { setCompanyId(event.target.value); setContactId(""); }} className={fieldClass()}><option value="">Choose Company</option>{data.companies.map((company) => <option key={company.id} value={company.id}>{company.legalName}</option>)}</select></label>
                <label className="text-sm font-semibold text-zinc-300">Contact<select value={contactId} onChange={(event) => setContactId(event.target.value)} disabled={!selectedCompany} className={fieldClass()}><option value="">Choose Contact</option>{(selectedCompany?.contacts ?? []).map((contact) => <option key={contact.id} value={contact.id}>{[contact.firstName, contact.surname].filter(Boolean).join(" ")}</option>)}</select></label>
                <button type="button" aria-label="Create Company and Contact" title="Create Company and Contact" aria-expanded={creatingCompany} onClick={() => setCreatingCompany((value) => !value)} className="grid h-11 w-11 place-items-center rounded-full bg-[#D8C36A] text-2xl font-light text-black transition hover:bg-[#F2D66C] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F2D66C]">+</button>
              </div>
              {creatingCompany && <div className="grid gap-3 rounded-2xl border border-white/10 bg-black/35 p-4 sm:grid-cols-2"><label className="text-sm text-zinc-300">Company name<input className={fieldClass()} value={newCompanyName} onChange={(event) => setNewCompanyName(event.target.value)} /></label><label className="text-sm text-zinc-300">Contact name<input className={fieldClass()} value={newContactName} onChange={(event) => setNewContactName(event.target.value)} /></label><label className="text-sm text-zinc-300">Contact email<input type="email" className={fieldClass()} value={newContactEmail} onChange={(event) => setNewContactEmail(event.target.value)} /></label><label className="text-sm text-zinc-300">Contact mobile<input className={fieldClass()} value={newContactMobile} onChange={(event) => setNewContactMobile(event.target.value)} /></label><button type="button" disabled={saving} onClick={() => void createCompanyAndContact()} className="min-h-11 rounded-full border border-[#D8C36A]/45 px-5 py-3 text-sm font-bold text-[#F2D66C] disabled:opacity-50 sm:col-span-2 sm:w-fit">{saving ? "Saving..." : "Save Company and Contact"}</button></div>}

              <fieldset><legend className="text-sm font-semibold text-zinc-300">Package</legend><div className="mt-2 grid gap-3 lg:grid-cols-3">{packageCards.map((item) => <PackageCard key={item.id} item={item} selected={item.id === packageId} onSelect={() => setPackageId(item.id)} />)}</div></fieldset>
              <div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-semibold text-zinc-300">Expected guests<input type="number" min="1" step="1" value={expectedGuests} onChange={(event) => setExpectedGuests(event.target.value)} className={fieldClass()} /></label><label className="text-sm font-semibold text-zinc-300">Final guests <span className="font-normal text-zinc-500">(optional)</span><input type="number" min="1" step="1" value={finalGuests} onChange={(event) => setFinalGuests(event.target.value)} className={fieldClass()} /></label></div>
              {guestError && <p className="text-sm text-amber-200">{guestError}</p>}
              {selectedPackage && commercials && <div className="grid gap-4 rounded-2xl border border-[#D8C36A]/25 bg-[#130e06] p-5 lg:grid-cols-[1fr_auto]"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#D8C36A]">Review</p><h3 className="mt-2 text-xl font-bold text-white">Full Show Buyout</h3><p className="mt-2 text-sm text-zinc-300">{selectedCompany?.legalName ?? "Choose Company"} · {selectedContact ? [selectedContact.firstName, selectedContact.surname].filter(Boolean).join(" ") : "Choose Contact"}</p><p className="mt-1 text-sm text-zinc-400">{displayShow.venue} · {formatShowDate(displayShow.date)} · {displayShow.time.slice(0, 5)} · {selectedPackage.displayName}</p><p className="mt-1 text-sm text-zinc-400">{currentGuestCount || 0} guests · Awaiting Payment</p><p className="mt-3 text-sm text-amber-100">Public booking will close for this performance. Guests remain unallocated until Floor planning is completed.</p></div><dl className="min-w-52 space-y-2 text-sm"><div className="flex justify-between gap-5"><dt className="text-zinc-400">Base</dt><dd>{money(commercials.baseAmount)}</dd></div><div className="flex justify-between gap-5"><dt className="text-zinc-400">Gratuity</dt><dd>{money(commercials.gratuityAmount)}</dd></div><div className="flex justify-between gap-5"><dt className="text-zinc-400">VAT</dt><dd>{money(commercials.vatAmount)}</dd></div>{commercials.additionalGuests > 0 && <div className="flex justify-between gap-5"><dt className="text-zinc-400">Extra guests</dt><dd>{money(commercials.additionalGuestAmount)}</dd></div>}<div className="flex justify-between gap-5 border-t border-white/10 pt-2 text-base font-bold"><dt>Total</dt><dd className="text-[#F2D66C]">{money(commercials.totalAmount)}</dd></div></dl></div>}
              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><button type="button" onClick={onClose} className="min-h-11 rounded-full border border-white/15 px-5 py-3 text-sm font-semibold text-zinc-200">Cancel</button><button type="button" disabled={!ready || saving} onClick={() => setConfirming(true)} className="min-h-11 rounded-full bg-[#D8C36A] px-6 py-3 text-sm font-bold text-black disabled:cursor-not-allowed disabled:opacity-40">Review Buyout</button></div>
            </div>
          )}
        </section>
      </div>
      {confirming && authoritativeShow && selectedCompany && selectedPackage && <div className="fixed inset-0 z-[180] flex items-center justify-center bg-black/85 p-4"><section aria-labelledby="confirm-buyout-title" aria-modal="true" role="alertdialog" className="w-full max-w-lg rounded-2xl border border-[#D8C36A]/40 bg-[#090909] p-6 shadow-2xl"><h2 id="confirm-buyout-title" className="text-xl font-bold text-white">Create this Full Show Buyout?</h2><p className="mt-3 text-sm leading-6 text-zinc-300">{selectedCompany.legalName} · {selectedPackage.displayName} · {currentGuestCount} guests</p><p className="mt-2 text-sm leading-6 text-zinc-400">{authoritativeShow.venue} · {formatShowDate(authoritativeShow.date)} · {authoritativeShow.time.slice(0, 5)}</p><p className="mt-2 text-sm leading-6 text-amber-100">Public booking will close for this performance. Existing bookings will not be changed.</p><div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><button type="button" disabled={saving} onClick={() => setConfirming(false)} className="min-h-11 rounded-full border border-white/15 px-5 py-3 text-sm font-semibold text-zinc-200">Cancel</button><button type="button" disabled={saving} onClick={() => void submit()} className="min-h-11 rounded-full bg-[#D8C36A] px-6 py-3 text-sm font-bold text-black disabled:opacity-50">{saving ? "Creating..." : "Create Buyout"}</button></div></section></div>}
    </>
  );
}

function PackageCard({ item, onSelect, selected }: { item: CorporateBuyoutPackage; onSelect: () => void; selected: boolean }) {
  return <button type="button" aria-pressed={selected} onClick={onSelect} className={`rounded-2xl border p-4 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#D8C36A] ${selected ? "border-[#D8C36A] bg-[#181107]" : "border-white/10 bg-black/35 hover:border-white/25"}`}><span className="font-bold text-white">{item.displayName}</span><span className="mt-2 block text-lg font-bold text-[#F2D66C]">{money(item.totalAmount)}</span><span className="mt-1 block text-xs text-zinc-400">Fixed package · up to {item.includedGuestCount} guests</span><span className="mt-3 block text-xs leading-5 text-zinc-400">{item.inclusions.slice(0, 3).join(" · ")}</span></button>;
}
