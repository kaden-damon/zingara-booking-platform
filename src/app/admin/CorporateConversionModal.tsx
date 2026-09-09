"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import {
  parseCorporateConversionReview,
  type CorporateConversionPaymentBasis,
  type CorporateConversionReview,
  type CorporateConversionReviewDraft,
  validateCorporateConversionReview,
} from "../../lib/corporateConversionReview";
import { validateCorporateZoneEntitlements } from "../../lib/corporateZoneEntitlements";
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
  isSuccess: boolean;
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
  isSuccess,
  isSubmitting,
  onClose,
  onConfirm,
  request,
  shows,
}: Props) {
  const venue = initialVenue(request);
  const initialShow = shows.find(
    (show) =>
      ["active", "sold-out"].includes(show.operationalStatus ?? "active") &&
      show.date === request.preferredDate &&
      normalizeShowLocation(show.location ?? show.venueName) === venue,
  );
  const financialEvidence = request.financialReconciliation;
  const reconciledPaymentBasis: CorporateConversionPaymentBasis | null =
    financialEvidence?.paymentMethod === "COMP"
      ? "complimentary"
      : financialEvidence?.amountPaid === financialEvidence?.totalObligation
        ? "invoice-paid"
        : financialEvidence && financialEvidence.amountPaid > 0
          ? "deposit"
          : financialEvidence
            ? "invoice-outstanding"
            : null;
  const [draft, setDraft] = useState<CorporateConversionReviewDraft>({
    amountPaid: financialEvidence?.amountPaid.toString() ?? "",
    outstandingAmount: financialEvidence?.outstandingAmount.toString() ?? "",
    paymentBasis: reconciledPaymentBasis ?? "unpaid",
    pax: request.guestCount?.toString() ?? "",
    showId: initialShow?.id ?? "",
    ticketTotal: financialEvidence?.totalObligation.toString() ?? "",
    venue,
    zoneId: initialZoneId,
    zoneEntitlements: [{ pax: request.guestCount?.toString() ?? "", zoneId: initialZoneId }],
  });
  const [errors, setErrors] = useState<
    Partial<Record<keyof CorporateConversionReviewDraft, string>>
  >({});
  const submitStartedRef = useRef(false);
  const eligibleShows = useMemo(
    () =>
      shows.filter(
        (show) =>
          !show.archivedAt &&
          ["active", "sold-out"].includes(show.operationalStatus ?? "active") &&
          normalizeShowLocation(show.location ?? show.venueName) === draft.venue,
      ),
    [draft.venue, shows],
  );
  const ticketTotal = Number(draft.ticketTotal);
  const amountPaid = Number(draft.amountPaid);
  const outstanding =
    draft.paymentBasis === "invoice-outstanding"
      ? draft.outstandingAmount.trim()
        ? Number(draft.outstandingAmount)
        : null
      : draft.ticketTotal.trim() && draft.amountPaid.trim()
      ? Math.max(ticketTotal - amountPaid, 0)
      : null;
  const allocatedPax = draft.zoneEntitlements.reduce(
    (total, entitlement) => total + (Number(entitlement.pax) || 0),
    0,
  );
  const totalPax = Number(draft.pax) || 0;

  useEffect(() => {
    if (!isSubmitting && !isSuccess) {
      submitStartedRef.current = false;
    }
  }, [isSubmitting, isSuccess]);

  function updateDraft(updates: Partial<CorporateConversionReviewDraft>) {
    setDraft((current) => ({ ...current, ...updates }));
    setErrors({});
  }

  function submit() {
    if (isSubmitting || isSuccess || submitStartedRef.current) {
      return;
    }

    const nextErrors = validateCorporateConversionReview(draft);
    const review = parseCorporateConversionReview(draft);

    if (!review) {
      setErrors(nextErrors);
      return;
    }

    submitStartedRef.current = true;
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

        {financialEvidence && (
          <div className="mt-5 rounded-xl border border-emerald-300/25 bg-emerald-950/15 px-4 py-3 text-sm text-emerald-100">
            <p className="font-semibold uppercase tracking-[0.1em]">
              Authoritative Historical Reconciliation
            </p>
            <p className="mt-2 leading-6 text-emerald-100/80">
              Ticket {financialEvidence.ticketObligation.toFixed(2)} · Gratuity{" "}
              {financialEvidence.gratuityAmount.toFixed(2)} · Additional{" "}
              {financialEvidence.additionalAmount.toFixed(2)} · Method{" "}
              {financialEvidence.paymentMethod}. Financial values are locked to
              the saved evidence.
            </p>
          </div>
        )}

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
              onChange={(event) => {
                const pax = event.target.value;
                updateDraft({
                  pax,
                  zoneEntitlements:
                    draft.zoneEntitlements.length === 1
                      ? [{ ...draft.zoneEntitlements[0], pax }]
                      : draft.zoneEntitlements,
                });
              }}
              className="rounded-xl border border-white/15 bg-black px-4 py-3 text-white outline-none focus:border-[#D8C36A]"
            />
            {errors.pax && <span className="text-xs text-red-300">{errors.pax}</span>}
          </label>

          <div className="grid gap-3 text-sm text-zinc-300 sm:col-span-2">
            <div className="flex items-center justify-between gap-3">
              <span>Seating Zones</span>
              <button
                type="button"
                onClick={() =>
                  updateDraft({
                    zoneEntitlements: [
                      ...draft.zoneEntitlements,
                      { pax: "", zoneId: "" },
                    ],
                  })
                }
                className="text-xs font-semibold uppercase text-[#D8C36A]"
              >
                Add Seating Zone
              </button>
            </div>
            {draft.zoneEntitlements.map((entitlement, index) => (
              <div key={index} className="grid grid-cols-[minmax(0,1fr)_7rem_auto] gap-2">
                <select
                  aria-label={`Seating zone ${index + 1}`}
                  value={entitlement.zoneId}
                  onChange={(event) => {
                    const zoneEntitlements = draft.zoneEntitlements.map((row, rowIndex) =>
                      rowIndex === index ? { ...row, zoneId: event.target.value } : row,
                    );
                    updateDraft({
                      zoneEntitlements,
                      zoneId: index === 0 ? event.target.value : draft.zoneId,
                    });
                  }}
                  className="min-w-0 rounded-xl border border-white/15 bg-black px-3 py-3 text-white outline-none focus:border-[#D8C36A]"
                >
                  <option value="">Select zone</option>
                  {seatingZones.filter((zone) => zone.id !== "elevated-stage").map((zone) => (
                    <option key={zone.id} value={zone.id}>{zone.title}</option>
                  ))}
                </select>
                <input
                  aria-label={`Zone guests ${index + 1}`}
                  min="1"
                  step="1"
                  type="number"
                  value={entitlement.pax}
                  onChange={(event) =>
                    updateDraft({
                      zoneEntitlements: draft.zoneEntitlements.map((row, rowIndex) =>
                        rowIndex === index ? { ...row, pax: event.target.value } : row,
                      ),
                    })
                  }
                  className="min-w-0 rounded-xl border border-white/15 bg-black px-3 py-3 text-white outline-none focus:border-[#D8C36A]"
                />
                <button
                  type="button"
                  aria-label={`Remove seating zone ${index + 1}`}
                  disabled={draft.zoneEntitlements.length === 1}
                  onClick={() => {
                    const zoneEntitlements = draft.zoneEntitlements.filter((_, rowIndex) => rowIndex !== index);
                    updateDraft({
                      zoneEntitlements,
                      zoneId: zoneEntitlements[0]?.zoneId ?? "",
                    });
                  }}
                  className="px-2 text-zinc-400 disabled:opacity-30"
                >
                  ×
                </button>
              </div>
            ))}
            <div className="flex flex-wrap justify-between gap-2 text-xs uppercase tracking-[0.1em]">
              <span>Allocated {allocatedPax} / {totalPax}</span>
              <span className={allocatedPax === totalPax ? "text-emerald-300" : "text-amber-300"}>
                Remaining {totalPax - allocatedPax}
              </span>
            </div>
            {(errors.zoneEntitlements || validateCorporateZoneEntitlements(draft.zoneEntitlements, totalPax)) && (
              <span className="text-xs text-red-300">
                {errors.zoneEntitlements ?? validateCorporateZoneEntitlements(draft.zoneEntitlements, totalPax)}
              </span>
            )}
          </div>

          <label className="grid gap-2 text-sm text-zinc-300">
            Agreed Ticket Obligation
            <input
              disabled={Boolean(financialEvidence)}
              min="0"
              step="0.01"
              type="number"
              inputMode="decimal"
              placeholder="R0.00"
              value={draft.ticketTotal}
              onChange={(event) => {
                const ticketTotal = event.target.value;
                updateDraft({
                  amountPaid:
                    draft.paymentBasis === "invoice-paid"
                      ? ticketTotal
                      : draft.amountPaid,
                  outstandingAmount:
                    draft.paymentBasis === "invoice-outstanding"
                      ? ticketTotal
                      : draft.outstandingAmount,
                  ticketTotal,
                });
              }}
              className="rounded-xl border border-white/15 bg-black px-4 py-3 text-white outline-none focus:border-[#D8C36A] disabled:cursor-not-allowed disabled:opacity-60"
            />
            {errors.ticketTotal && <span className="text-xs text-red-300">{errors.ticketTotal}</span>}
          </label>

          <label className="grid gap-2 text-sm text-zinc-300">
            Payment Basis
            <select
              disabled={Boolean(financialEvidence)}
              value={draft.paymentBasis}
              onChange={(event) =>
                {
                  const paymentBasis = event.target
                    .value as CorporateConversionPaymentBasis;
                  updateDraft({
                    amountPaid:
                      paymentBasis === "invoice-paid"
                        ? draft.ticketTotal
                        : paymentBasis === "invoice-outstanding"
                          ? "0"
                          : draft.amountPaid,
                    outstandingAmount:
                      paymentBasis === "invoice-outstanding"
                        ? draft.ticketTotal
                        : "",
                    paymentBasis,
                  });
                }
              }
              className="rounded-xl border border-white/15 bg-black px-4 py-3 text-white outline-none focus:border-[#D8C36A] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <option value="unpaid">Unpaid / Pending Payment</option>
              <option value="deposit">Deposit / Part Paid</option>
              <option value="fully-paid">Fully Paid</option>
              <option value="invoice-outstanding">
                Invoiced – Outstanding Payment
              </option>
              <option value="invoice-paid">Invoiced – Paid In Full</option>
              <option value="complimentary">Complimentary</option>
            </select>
          </label>

          {draft.paymentBasis === "invoice-outstanding" ? (
            <label className="grid gap-2 text-sm text-zinc-300">
              Outstanding Amount
              <input
                disabled={Boolean(financialEvidence)}
                min="0.01"
                step="0.01"
                type="number"
                inputMode="decimal"
                placeholder="R0.00"
                value={draft.outstandingAmount}
                onChange={(event) =>
                  updateDraft({ outstandingAmount: event.target.value })
                }
                className="rounded-xl border border-white/15 bg-black px-4 py-3 text-white outline-none focus:border-[#D8C36A] disabled:cursor-not-allowed disabled:opacity-60"
              />
              <span className="text-xs leading-5 text-zinc-400">
                Payment will be collected manually by invoice/EFT. No payment
                link will be created.
              </span>
              {errors.outstandingAmount && (
                <span className="text-xs text-red-300">
                  {errors.outstandingAmount}
                </span>
              )}
              {errors.amountPaid && (
                <span className="text-xs text-red-300">{errors.amountPaid}</span>
              )}
            </label>
          ) : draft.paymentBasis === "invoice-paid" ? (
            <div className="rounded-xl border border-emerald-300/25 bg-emerald-950/20 px-4 py-3 text-sm text-emerald-100 sm:self-end">
              <p className="font-semibold uppercase tracking-[0.1em]">
                Paid In Full By Invoice / EFT
              </p>
              <p className="mt-1 text-xs leading-5 text-emerald-100/80">
                The full obligation will be recorded as manual EFT evidence. No
                online payment is required.
              </p>
              {errors.amountPaid && (
                <span className="mt-2 block text-xs text-red-300">
                  {errors.amountPaid}
                </span>
              )}
            </div>
          ) : (
            <label className="grid gap-2 text-sm text-zinc-300">
              Amount Already Paid
              <input
                disabled={Boolean(financialEvidence)}
                min="0"
                step="0.01"
                type="number"
                inputMode="decimal"
                placeholder="R0.00"
                value={draft.amountPaid}
                onChange={(event) => updateDraft({ amountPaid: event.target.value })}
                className="rounded-xl border border-white/15 bg-black px-4 py-3 text-white outline-none focus:border-[#D8C36A] disabled:cursor-not-allowed disabled:opacity-60"
              />
              {errors.amountPaid && <span className="text-xs text-red-300">{errors.amountPaid}</span>}
            </label>
          )}

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
            disabled={isSubmitting || isSuccess}
            className="rounded-full border border-white/15 px-5 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-zinc-300 transition hover:bg-white hover:text-black disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={isSubmitting || isSuccess}
            className="rounded-full bg-[#D8C36A] px-5 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-black transition hover:bg-[#F2D66C] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting
              ? "Converting Booking..."
              : isSuccess
                ? "Booking Created ✓"
                : "Confirm Conversion"}
          </button>
        </div>
      </section>
    </div>
  );
}
