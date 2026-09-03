"use client";

import { useMemo, useState } from "react";

import {
  parseCorporateConversionReview,
  type CorporateConversionPaymentBasis,
  type CorporateConversionReview,
  type CorporateConversionReviewDraft,
  validateCorporateConversionReview,
} from "../../lib/corporateConversionReview";
import {
  type CorporateRequest,
  type DemoShow,
  getShowLabel,
  getShowLocationOption,
  normalizeShowLocation,
  seatingZones,
} from "../../lib/zingaraDemo";

type Props = {
  error: string;
  initialZoneId: string;
  isSubmitting: boolean;
  onClose: () => void;
  onConfirm: (review: CorporateConversionReview) => void;
  request: CorporateRequest;
  shows: DemoShow[];
};

function initialVenue(request: CorporateRequest) {
  return normalizeShowLocation(request.locationAcknowledgement) ?? "";
}

export default function CorporateConversionModal({
  error,
  initialZoneId,
  isSubmitting,
  onClose,
  onConfirm,
  request,
  shows,
}: Props) {
  const venue = initialVenue(request);
  const initialShow = shows.find(
    (show) =>
      (show.operationalStatus ?? "active") === "active" &&
      show.date === request.preferredDate &&
      normalizeShowLocation(show.location ?? show.venueName) === venue,
  );
  const [draft, setDraft] = useState<CorporateConversionReviewDraft>({
    amountPaid: "",
    paymentBasis: "unpaid",
    pax: request.guestCount?.toString() ?? "",
    showId: initialShow?.id ?? "",
    ticketTotal: "",
    venue,
    zoneId: initialZoneId,
  });
  const [errors, setErrors] = useState<
    Partial<Record<keyof CorporateConversionReviewDraft, string>>
  >({});
  const eligibleShows = useMemo(
    () =>
      shows.filter(
        (show) =>
          !show.archivedAt &&
          (show.operationalStatus ?? "active") === "active" &&
          normalizeShowLocation(show.location ?? show.venueName) === draft.venue,
      ),
    [draft.venue, shows],
  );
  const ticketTotal = Number(draft.ticketTotal);
  const amountPaid = Number(draft.amountPaid);
  const outstanding =
    draft.ticketTotal.trim() && draft.amountPaid.trim()
      ? Math.max(ticketTotal - amountPaid, 0)
      : null;

  function updateDraft(updates: Partial<CorporateConversionReviewDraft>) {
    setDraft((current) => ({ ...current, ...updates }));
    setErrors({});
  }

  function submit() {
    const nextErrors = validateCorporateConversionReview(draft);
    const review = parseCorporateConversionReview(draft);

    if (!review) {
      setErrors(nextErrors);
      return;
    }

    onConfirm(review);
  }

  return (
    <div className="fixed inset-0 z-[155] flex items-end justify-center bg-black/80 p-3 text-white backdrop-blur-md sm:items-center sm:p-6">
      <section
        aria-labelledby="corporate-conversion-title"
        aria-modal="true"
        role="dialog"
        className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-[1.5rem] border border-[#D8C36A]/35 bg-[radial-gradient(circle_at_top,#241A08_0%,#111111_48%,#050505_100%)] p-5 shadow-2xl shadow-black/50 sm:p-7"
      >
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#D8C36A]">
          Corporate Enquiry
        </p>
        <h2 id="corporate-conversion-title" className="mt-2 text-2xl font-bold">
          Convert To Booking
        </h2>
        <p className="mt-2 text-sm leading-6 text-zinc-400">
          Review the agreed booking details for {request.companyName || request.contactName}.
          No amount is inferred from current zone pricing.
        </p>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="grid gap-2 text-sm text-zinc-300">
            Venue
            <select
              value={draft.venue}
              onChange={(event) =>
                updateDraft({
                  showId: "",
                  venue: event.target.value as CorporateConversionReviewDraft["venue"],
                })
              }
              className="rounded-xl border border-white/15 bg-black px-4 py-3 text-white outline-none focus:border-[#D8C36A]"
            >
              <option value="">Select venue</option>
              <option value="johannesburg">Johannesburg</option>
              <option value="cape-town">Cape Town</option>
            </select>
            {errors.venue && <span className="text-xs text-red-300">{errors.venue}</span>}
          </label>

          <label className="grid gap-2 text-sm text-zinc-300">
            Show / Date
            <select
              value={draft.showId}
              onChange={(event) => updateDraft({ showId: event.target.value })}
              className="rounded-xl border border-white/15 bg-black px-4 py-3 text-white outline-none focus:border-[#D8C36A]"
            >
              <option value="">Select performance</option>
              {eligibleShows.map((show) => (
                <option key={show.id} value={show.id}>
                  {getShowLabel(show)} · {getShowLocationOption(draft.venue || "cape-town").city}
                </option>
              ))}
            </select>
            {errors.showId && <span className="text-xs text-red-300">{errors.showId}</span>}
          </label>

          <label className="grid gap-2 text-sm text-zinc-300">
            Pax
            <input
              min="1"
              step="1"
              type="number"
              value={draft.pax}
              onChange={(event) => updateDraft({ pax: event.target.value })}
              className="rounded-xl border border-white/15 bg-black px-4 py-3 text-white outline-none focus:border-[#D8C36A]"
            />
            {errors.pax && <span className="text-xs text-red-300">{errors.pax}</span>}
          </label>

          <label className="grid gap-2 text-sm text-zinc-300">
            Seating Zone
            <select
              value={draft.zoneId}
              onChange={(event) => updateDraft({ zoneId: event.target.value })}
              className="rounded-xl border border-white/15 bg-black px-4 py-3 text-white outline-none focus:border-[#D8C36A]"
            >
              <option value="">Select seating zone</option>
              {seatingZones.map((zone) => (
                <option key={zone.id} value={zone.id}>{zone.title}</option>
              ))}
            </select>
            {errors.zoneId && <span className="text-xs text-red-300">{errors.zoneId}</span>}
          </label>

          <label className="grid gap-2 text-sm text-zinc-300">
            Agreed Ticket Obligation
            <input
              min="0"
              step="0.01"
              type="number"
              inputMode="decimal"
              placeholder="R0.00"
              value={draft.ticketTotal}
              onChange={(event) => updateDraft({ ticketTotal: event.target.value })}
              className="rounded-xl border border-white/15 bg-black px-4 py-3 text-white outline-none focus:border-[#D8C36A]"
            />
            {errors.ticketTotal && <span className="text-xs text-red-300">{errors.ticketTotal}</span>}
          </label>

          <label className="grid gap-2 text-sm text-zinc-300">
            Payment Basis
            <select
              value={draft.paymentBasis}
              onChange={(event) =>
                updateDraft({
                  paymentBasis: event.target.value as CorporateConversionPaymentBasis,
                })
              }
              className="rounded-xl border border-white/15 bg-black px-4 py-3 text-white outline-none focus:border-[#D8C36A]"
            >
              <option value="unpaid">Unpaid / Pending Payment</option>
              <option value="deposit">Deposit / Part Paid</option>
              <option value="fully-paid">Fully Paid</option>
              <option value="complimentary">Complimentary</option>
            </select>
          </label>

          <label className="grid gap-2 text-sm text-zinc-300">
            Amount Already Paid
            <input
              min="0"
              step="0.01"
              type="number"
              inputMode="decimal"
              placeholder="R0.00"
              value={draft.amountPaid}
              onChange={(event) => updateDraft({ amountPaid: event.target.value })}
              className="rounded-xl border border-white/15 bg-black px-4 py-3 text-white outline-none focus:border-[#D8C36A]"
            />
            {errors.amountPaid && <span className="text-xs text-red-300">{errors.amountPaid}</span>}
          </label>

          <div className="rounded-xl border border-[#D8C36A]/25 bg-black/40 px-4 py-3 text-sm sm:self-end">
            <span className="text-zinc-500">Outstanding</span>
            <p className="mt-1 text-lg font-semibold text-[#F2D66C]">
              {outstanding === null
                ? "Awaiting confirmed amounts"
                : `R${outstanding.toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            </p>
          </div>
        </div>

        <p className="mt-5 rounded-xl border border-sky-300/20 bg-sky-950/15 px-4 py-3 text-sm leading-6 text-sky-100">
          Large parties are created as a show and zone entitlement. Floor staff can assign multiple valid tables afterward.
        </p>
        {error && (
          <p role="alert" className="mt-4 rounded-xl border border-red-300/25 bg-red-950/20 px-4 py-3 text-sm text-red-100">
            {error}
          </p>
        )}

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="rounded-full border border-white/15 px-5 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-zinc-300 transition hover:bg-white hover:text-black disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={isSubmitting}
            className="rounded-full bg-[#D8C36A] px-5 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-black transition hover:bg-[#F2D66C] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? "Converting..." : "Confirm Conversion"}
          </button>
        </div>
      </section>
    </div>
  );
}
