"use client";

import { useState, type Dispatch, type SetStateAction } from "react";
import { calculateOutstandingAmount } from "@/lib/paymentControls";
import { operationalFinancialFields, validateOperationalFinancialComponents, type OperationalFinancialComponents } from "@/lib/bookingOperationalAuthority";

import {
  getReconciledPaymentStatus,
  toMoney,
  validateFinancialReconciliation,
  validateGuestCountReconciliation,
} from "@/lib/bookingReconciliation";
import {
  calculateAuthorizedLegacyIncrease,
  calculateAddedGuestFinancials,
  type AddedGuestPricingBasis,
  type LegacyGuestIncreasePaymentBasis,
} from "@/lib/addedGuestFinancials";
import { fetchSupabaseApi } from "@/lib/supabase/apiClient";
import { confirmGuestReductionComponents, previewGuestReduction, type GuestReductionBasis, type GuestReductionDisposition } from "@/lib/guestReductionPolicy";

export type BookingReconciliationDetails = {
  operationalAuthority?: boolean;
  financialComponents?: OperationalFinancialComponents;
  booking: {
    amountPaid: number;
    balanceOutstanding: number;
    bookingFee: number;
    bookingReference: string;
    bookingOrigin: string | null;
    complimentaryCategory: "standard" | "media" | "tradex" | null;
    depositAmount: number;
    guestCount: number;
    zoneEntitlements?: { zoneId: string; pax: number }[] | null;
    paymentStatus: string;
    tableCapacity: number | null;
    tableCode: string | null;
    totalAmount: number;
    updatedAt: string;
    zone: string;
  };
  legacyEvidence: {
    amount: number;
    label: string;
  }[];
  retainedValueBasis: {
    barTabAmount: number;
    sourceDocument: string;
    sourceGratuityAmount: number;
    sourceTicketAmount: number;
  } | null;
  providerBackedAmount: number;
  corporateFixedTotal: boolean;
  addedGuestPricingBasis: AddedGuestPricingBasis;
  reductionBasis?: GuestReductionBasis;
};

export type GuestCountReconciliationResult = {
  additional_amount: number;
  added_guests: number;
  balance_outstanding: number;
  booking_reference: string;
  floor_assignment_required?: boolean;
  payment_basis: "deposit" | "full" | null;
  unit_amount: number | null;
};

type BaseProps = {
  details: BookingReconciliationDetails;
  error: string;
  isSaving: boolean;
  onClose: () => void;
};

function ModalFrame({
  children,
  onClose,
  title,
}: {
  children: React.ReactNode;
  onClose: () => void;
  title: string;
}) {
  return (
    <div
      className="fixed inset-0 z-[120] flex items-end justify-center bg-black/75 p-3 sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-[#D8C36A]/35 bg-zinc-950 p-4 shadow-2xl sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase text-[#F2D66C]">Booking Details</p>
            <h2 className="mt-1 text-xl font-semibold text-white">{title}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 rounded-full border border-white/20 px-4 text-xs font-semibold uppercase text-zinc-200 hover:bg-white hover:text-black"
          >
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function MoneyInput({
  disabled = false,
  label,
  onChange,
  value,
}: {
  disabled?: boolean;
  label: string;
  onChange: (value: number) => void;
  value: number;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-semibold uppercase text-zinc-400">{label}</span>
      <div className="flex min-h-12 items-center rounded-xl border border-white/15 bg-black px-3 focus-within:border-[#D8C36A]">
        <span className="text-zinc-400">R</span>
        <input
          type="number"
          disabled={disabled}
          min="0"
          step="0.01"
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
          className="min-w-0 flex-1 bg-transparent px-2 py-3 text-white outline-none"
        />
      </div>
    </label>
  );
}

function formatMoney(value: number) {
  return `R${new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(toMoney(value))}`;
}

export type ManualEftPaymentDraft = {
  amountReceived: string; bankReference: string; confirmed: boolean;
  evidenceNote: string; idempotencyKey: string; receivedOn: string; reference: string;
};

// The existing EFT form is lazy-loaded with the other booking controls.
export function ManualEftPaymentModal(props: {
  booking?: { reference: string; status?: string; corporatePaymentExpiredAt?: string; customer: { name: string } };
  financials: { totalPrice: number; amountPaid: number } | null;
  draft: ManualEftPaymentDraft; isSaving: boolean; operationalAuthority: boolean;
  onChange: Dispatch<SetStateAction<ManualEftPaymentDraft | null>>;
  onClose: () => void; onSave: () => void;
}) {
  const {booking: markPaidBooking,financials: markPaidFinancials,draft: markPaidConfirmation,
    isSaving: isMarkPaidProcessing,onChange: setMarkPaidConfirmation,onClose: closeMarkPaidConfirmation,onSave: confirmMarkPaid} = props;
  const formatCurrency = formatMoney;
  return (<div className="fixed inset-0 z-[96] flex items-center justify-center bg-black/75 px-4 text-white backdrop-blur-md">
                <section className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-[2rem] border border-emerald-300/30 bg-zinc-950 p-6 shadow-2xl shadow-black/60">
                  <p className="text-sm font-semibold uppercase tracking-[0.24em] text-emerald-200">
                    {markPaidBooking?.status === "cancelled" &&
                    markPaidBooking.corporatePaymentExpiredAt
                      ? "Record Late Corporate EFT"
                      : "Record Manual EFT"}
                  </p>
                  <h2 className="mt-3 text-2xl font-bold">
                    {markPaidBooking?.customer.name ?? "Mark Booking Paid"}
                  </h2>
                  <p className="mt-3 text-sm leading-6 text-zinc-300">
                    Record only money confirmed in the bank. A proof of payment
                    on its own is not proof that the money was received.
                  </p>
                  {markPaidBooking?.status === "cancelled" &&
                    markPaidBooking.corporatePaymentExpiredAt && (
                      <p className="mt-3 rounded-xl border border-amber-300/30 bg-amber-950/20 px-4 py-3 text-sm leading-6 text-amber-100">
                        Recording this EFT payment does not restore booking entitlement. Reopen Reinstate Booking afterward to confirm live capacity and reactivate the booking.
                      </p>
                    )}
                  {markPaidBooking && markPaidFinancials && (
                    <div className="mt-4 grid gap-3 rounded-2xl border border-white/10 bg-black/35 p-4 text-sm sm:grid-cols-3">
                      <div>
                        <p className="text-xs uppercase tracking-[0.14em] text-zinc-500">Booking</p>
                        <p className="mt-1 font-semibold text-white">{markPaidBooking.reference}</p>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-[0.14em] text-zinc-500">Outstanding</p>
                        <p className="mt-1 font-semibold text-white">
                          {formatCurrency(
                            calculateOutstandingAmount(
                              markPaidFinancials.totalPrice,
                              markPaidFinancials.amountPaid,
                            ),
                          )}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-[0.14em] text-zinc-500">Method</p>
                        <p className="mt-1 font-semibold text-white">EFT</p>
                      </div>
                    </div>
                  )}

                  <div className="mt-5 grid gap-4 sm:grid-cols-2">
                    <label className="block">
                      <span className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
                        Amount received
                      </span>
                      <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={markPaidConfirmation.amountReceived}
                        onChange={(event) =>
                          setMarkPaidConfirmation((current) =>
                            current ? { ...current, amountReceived: event.target.value } : current,
                          )
                        }
                        disabled={isMarkPaidProcessing}
                        className="mt-2 w-full rounded-2xl border border-white/15 bg-black px-4 py-3 text-white outline-none transition focus:border-emerald-300/70 disabled:cursor-not-allowed disabled:opacity-50"
                      />
                    </label>
                    <label className="block">
                      <span className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
                        Date received
                      </span>
                      <input
                        type="date"
                        value={markPaidConfirmation.receivedOn}
                        onChange={(event) =>
                          setMarkPaidConfirmation((current) =>
                            current ? { ...current, receivedOn: event.target.value } : current,
                          )
                        }
                        disabled={isMarkPaidProcessing}
                        className="mt-2 w-full rounded-2xl border border-white/15 bg-black px-4 py-3 text-white outline-none transition focus:border-emerald-300/70 disabled:cursor-not-allowed disabled:opacity-50"
                      />
                    </label>
                  </div>

                  <label className="mt-4 block">
                    <span className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
                      Bank reference
                    </span>
                    <input
                      value={markPaidConfirmation.bankReference}
                      onChange={(event) =>
                        setMarkPaidConfirmation((current) =>
                          current ? { ...current, bankReference: event.target.value } : current,
                        )
                      }
                      maxLength={120}
                      disabled={isMarkPaidProcessing}
                      className="mt-2 w-full rounded-2xl border border-white/15 bg-black px-4 py-3 text-white outline-none transition focus:border-emerald-300/70 disabled:cursor-not-allowed disabled:opacity-50"
                      placeholder="Bank transaction or statement reference"
                    />
                  </label>

                  {!props.operationalAuthority && <>
<label className="mt-4 block">
                    <span className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
                      Evidence note
                    </span>
                    <textarea
                      value={markPaidConfirmation.evidenceNote}
                      onChange={(event) =>
                        setMarkPaidConfirmation((current) =>
                          current ? { ...current, evidenceNote: event.target.value } : current,
                        )
                      }
                      rows={3}
                      disabled={isMarkPaidProcessing}
                      className="mt-2 w-full rounded-2xl border border-white/15 bg-black px-4 py-3 text-white outline-none transition focus:border-emerald-300/70 disabled:cursor-not-allowed disabled:opacity-50"
                      placeholder="Where the bank receipt was verified and any useful context."
                    />
                  </label>

                  <label className="mt-4 flex items-start gap-3 rounded-2xl border border-emerald-300/25 bg-emerald-950/15 p-4 text-sm leading-6 text-zinc-200">
                    <input
                      type="checkbox"
                      checked={markPaidConfirmation.confirmed}
                      onChange={(event) =>
                        setMarkPaidConfirmation((current) =>
                          current ? { ...current, confirmed: event.target.checked } : current,
                        )
                      }
                      disabled={isMarkPaidProcessing}
                      className="mt-1 h-4 w-4 accent-emerald-300"
                    />
                    <span>
                      I confirm {markPaidBooking?.customer.name ?? "this customer"}&apos;s EFT of {formatCurrency(Number(markPaidConfirmation.amountReceived) || 0)} was received on {markPaidConfirmation.receivedOn || "the selected date"} with bank reference {markPaidConfirmation.bankReference.trim() || "not entered"}.
                      This will reduce the booking&apos;s outstanding balance.
                    </span>
                  </label>
</>}

                  <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
                    <button
                      type="button"
                      onClick={closeMarkPaidConfirmation}
                      disabled={isMarkPaidProcessing}
                      className="rounded-full border border-white/20 px-5 py-3 text-sm font-semibold uppercase tracking-[0.12em] text-zinc-300 transition hover:bg-white hover:text-black disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => void confirmMarkPaid()}
                      disabled={
                        isMarkPaidProcessing ||
                        !Number.isFinite(Number(markPaidConfirmation.amountReceived)) ||
                        Number(markPaidConfirmation.amountReceived) <= 0 ||
                        !markPaidConfirmation.receivedOn ||
                        markPaidConfirmation.bankReference.trim().length < 3 ||
                        markPaidConfirmation.evidenceNote.trim().length < 3 ||
                        !markPaidConfirmation.confirmed
                      }
                      className="rounded-full border border-emerald-300/45 bg-emerald-300 px-5 py-3 text-sm font-bold uppercase tracking-[0.12em] text-black transition hover:bg-emerald-200 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {isMarkPaidProcessing
                        ? "Recording payment..."
                        : props.operationalAuthority ? "Save payment"
                        : markPaidBooking?.status === "cancelled" &&
                            markPaidBooking.corporatePaymentExpiredAt
                          ? "Confirm Late EFT"
                          : "Confirm EFT Received"}
                    </button>
                  </div>
                </section>
              </div>);
}


export function FinancialReconciliationModal(
  props: BaseProps & {
    amountPaid: number;
    onRecordPayment?: () => void;
    onSave: (draft: {
      financialComponents?: OperationalFinancialComponents;
      amountPaid: number;
      legacyInvoiceEvidence?: {
        discountAmount?: number;
        sourceDocument: string;
        sourceGratuityAmount: number;
        sourceTicketAmount: number;
      };
      reason: string;
      totalAmount: number;
    }) => void;
    reason: string;
    totalAmount: number;
  },
) {
  const { booking } = props.details;
  const [draft, setDraft] = useState({
    amountPaid: props.amountPaid,
    reason: props.reason || (props.details.operationalAuthority ? "Authorised Box Office financial adjustment." : ""),
    totalAmount: props.totalAmount,
    sourceDocument: "",
    sourceGratuityAmount: 0,
    sourceTicketAmount: 0,
    discountAmount: 0,
  });
  const requiresImportedEvidence =
    booking.bookingOrigin === "data_import" &&
    booking.paymentStatus === "comp_vip" &&
    !props.details.retainedValueBasis;
  const [financialComponents, setFinancialComponents] = useState(props.details.financialComponents);
  const operational = props.details.operationalAuthority && !requiresImportedEvidence && financialComponents;
  const componentsValid = !operational || validateOperationalFinancialComponents(financialComponents, draft.totalAmount);
  const outstanding = Math.max(toMoney(draft.totalAmount - draft.amountPaid), 0);
  const validation = validateFinancialReconciliation(draft);
  const corporatePrice = props.details.corporateFixedTotal;

  return (
    <ModalFrame onClose={props.onClose} title={corporatePrice ? "Edit Agreed Price" : "Edit Payment Details"}>
      <p className="mt-3 text-sm text-zinc-400">{booking.bookingReference}</p>
      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-white/10 bg-black/35 p-4">
          <p className="text-xs font-semibold uppercase text-zinc-500">Current</p>
          <p className="mt-2 text-sm text-zinc-200">Total Booking Amount {formatMoney(booking.totalAmount)}</p>
          <p className="text-sm text-zinc-200">Total Amount Paid {formatMoney(booking.amountPaid)}</p>
          <p className="text-sm text-zinc-200">Outstanding Balance {formatMoney(booking.balanceOutstanding)}</p>
          <p className="mt-2 text-xs text-zinc-500">Deposit/prepayment R{booking.depositAmount.toFixed(2)}</p>
          <p className="text-xs text-zinc-500">Booking Fee R{booking.bookingFee.toFixed(2)}</p>
          <p className="text-xs text-zinc-500">Status {booking.paymentStatus}</p>
        </div>
        <div className="rounded-xl border border-[#D8C36A]/25 bg-[#D8C36A]/5 p-4">
          <p className="text-xs font-semibold uppercase text-[#F2D66C]">New</p>
          <p className="mt-2 text-sm text-white">Total Booking Amount {formatMoney(draft.totalAmount)}</p>
          <p className="text-sm text-white">Total Amount Paid {formatMoney(draft.amountPaid)}</p>
          <p className="text-sm text-white">Outstanding Balance {formatMoney(outstanding)}</p>
          <p className="mt-2 text-xs text-zinc-400">Payment Status {getReconciledPaymentStatus(draft.totalAmount, draft.amountPaid).replaceAll("_", " ")}</p>
        </div>
      </div>
      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <MoneyInput label={corporatePrice ? "Agreed Corporate Total" : "Total Booking Amount"} value={draft.totalAmount} onChange={(totalAmount) => {
          setDraft((current) => ({ ...current, totalAmount }));
          if (operational) setFinancialComponents((current) => current ? { ...current, ticketAmount: toMoney(current.ticketAmount + totalAmount - draft.totalAmount) } : current);
        }} />
        <div>
          <MoneyInput disabled={Boolean(props.details.operationalAuthority)} label="Total Amount Paid" value={draft.amountPaid} onChange={(amountPaid) => setDraft((current) => ({ ...current, amountPaid }))} />
          {props.onRecordPayment && booking.balanceOutstanding > 0 && <button type="button" onClick={props.onRecordPayment} disabled={props.isSaving} className="mt-2 rounded-full border border-[#D8C36A]/40 px-3 py-1.5 text-xs font-semibold text-[#F2D66C] transition hover:bg-[#D8C36A] hover:text-black disabled:opacity-40">Record payment</button>}
        </div>
      </div>
      <p className="mt-2 text-xs text-zinc-500">Total Booking Amount is the total value of this booking.</p>
      {operational && <details className="mt-4 rounded-xl border border-[#D8C36A]/25 p-4">
        <summary className="cursor-pointer text-sm font-medium text-[#D8C36A]">Agreed financial breakdown</summary>
        <p className="mt-2 text-xs text-zinc-400">Existing payments stay unchanged.</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {operationalFinancialFields.filter((key) => ["ticketAmount", "gratuityAmount", "barTabAmount", "otherAmount", "discountAmount"].includes(key) || Number(props.details.financialComponents?.[key]) > 0).map((key) => <MoneyInput key={key} label={{ ticketAmount: "Tickets", gratuityAmount: "Show gratuity", barTabAmount: "Prepaid bar", otherAmount: "Other charges", discountAmount: "Agreed deduction (not a payment)", forfeitedAmount: "Ticket forfeiture", gratuityForfeitedAmount: "Gratuity forfeiture", refundReviewAmount: "Refund reserved (not issued)", gratuityReviewAmount: "Gratuity reserved" }[key]}
            value={financialComponents[key]} onChange={(amount) => setFinancialComponents((current) => current ? { ...current, [key]: amount } : current)} />)}
        </div>
        {!componentsValid && <p role="alert" className="mt-3 text-sm text-red-200">The breakdown must match the total.</p>}
      </details>}
      {requiresImportedEvidence && (
        <section className="mt-4 rounded-xl border border-amber-300/30 bg-amber-950/15 p-4">
          <p className="text-xs font-semibold uppercase text-amber-200">Imported Quote / Invoice</p>
          <p className="mt-2 text-xs text-zinc-400">Record the reviewed invoice references and allocation. This does not create PayFast evidence.</p>
          <label className="mt-3 block text-xs font-semibold uppercase text-zinc-400">
            Invoice reference(s) *
            <input value={draft.sourceDocument} onChange={(event) => setDraft((current) => ({ ...current, sourceDocument: event.target.value }))} className="mt-2 min-h-11 w-full rounded-xl border border-white/15 bg-black px-3 text-sm normal-case text-white outline-none focus:border-[#D8C36A]" />
          </label>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <MoneyInput label="Ticket Value" value={draft.sourceTicketAmount} onChange={(sourceTicketAmount) => setDraft((current) => ({ ...current, sourceTicketAmount }))} />
            <MoneyInput label="Gratuity" value={draft.sourceGratuityAmount} onChange={(sourceGratuityAmount) => setDraft((current) => ({ ...current, sourceGratuityAmount }))} />
            <MoneyInput label="Agreed deduction (not a payment)" value={draft.discountAmount} onChange={(discountAmount) => setDraft((current) => ({ ...current, discountAmount }))} />
          </div>
        </section>
      )}
      <div className="mt-4 rounded-xl border border-white/10 p-4 text-xs text-zinc-400">
        <p>Provider-backed paid amount: R{props.details.providerBackedAmount.toFixed(2)} (preserved)</p>
        <p className="mt-2 font-semibold uppercase text-zinc-500">Legacy evidence</p>
        {props.details.legacyEvidence.length ? props.details.legacyEvidence.map((item) => (
          <p key={item.label}>{item.label}: R{item.amount.toFixed(2)}</p>
        )) : <p>No legacy payment evidence recorded.</p>}
      </div>
      {!props.details.operationalAuthority && <label className="mt-4 block">
        <span className="mb-2 block text-xs font-semibold uppercase text-zinc-400">Reason for adjustment *</span>
        <textarea rows={3} value={draft.reason} onChange={(event) => setDraft((current) => ({ ...current, reason: event.target.value }))} className="w-full rounded-xl border border-white/15 bg-black px-3 py-3 text-white outline-none focus:border-[#D8C36A]" />
      </label>}
      {props.error && <p role="alert" className="mt-3 text-sm text-red-200">{props.error}</p>}
      <button type="button" disabled={props.isSaving || Boolean(validation) || !componentsValid || (requiresImportedEvidence && (!draft.sourceDocument.trim() || draft.discountAmount < 0 || toMoney(draft.sourceTicketAmount + draft.sourceGratuityAmount - draft.discountAmount) !== toMoney(draft.totalAmount)))} onClick={() => props.onSave({ financialComponents: operational ? financialComponents : undefined, amountPaid: draft.amountPaid, reason: draft.reason, totalAmount: draft.totalAmount, legacyInvoiceEvidence: requiresImportedEvidence ? { discountAmount: draft.discountAmount, sourceDocument: draft.sourceDocument, sourceGratuityAmount: draft.sourceGratuityAmount, sourceTicketAmount: draft.sourceTicketAmount } : undefined })} className="mt-5 min-h-12 w-full rounded-full bg-[#D8C36A] px-5 text-sm font-semibold uppercase text-black disabled:cursor-not-allowed disabled:opacity-40">
        {props.isSaving ? "Saving..." : corporatePrice ? "Confirm agreed price" : "Save payment correction"}
      </button>
    </ModalFrame>
  );
}

export function GuestCountReconciliationModal(
  props: BaseProps & {
    canOverrideTwoSeaterLimit?: boolean;
    guestCount: number;
    onSave: (draft: {
      guestCount: number;
      reductionDisposition?: GuestReductionDisposition;
      reductionOperationId?: string;
      expectedReductionPreview?: ReturnType<typeof previewGuestReduction>;
      expectedAdditionalAmount?: number;
      manualPaymentBasis?: LegacyGuestIncreasePaymentBasis;
      manualUnitAmount?: number;
      reason: string;
      twoSeaterOverrideReason?: string;
      retainedValueTransfer?: {
        operationId: string;
        transferGratuityToBarTab: true;
        transferReleasedValueToBarTab: true;
      };
    }) => void;
    reason: string;
    result: GuestCountReconciliationResult | null;
  },
) {
  const { booking } = props.details;
  const [draft, setDraft] = useState({
    guestCount: props.guestCount,
    manualPaymentBasis: "" as LegacyGuestIncreasePaymentBasis | "",
    manualUnitAmount: 0,
    reason: props.reason || (props.details.operationalAuthority ? "Authorised Box Office guest count adjustment." : ""),
    transferRetainedValue: false,
  });
  const [operationId] = useState(() => crypto.randomUUID());
  const [submissionError, setSubmissionError] = useState("");
  const [reductionDisposition, setReductionDisposition] = useState<GuestReductionDisposition>("review-refund");
  const [components, setComponents] = useState({ ticketAmount: "", gratuityAmount: "", barTabAmount: "", otherAmount: "", sourceDocument: "", confirmed: false });
  const validation = validateGuestCountReconciliation(draft);
  const calculatedFinancials = calculateAddedGuestFinancials({
    basis: props.details.addedGuestPricingBasis,
    currentGuestCount: booking.guestCount,
    currentOutstanding: booking.balanceOutstanding,
    newGuestCount: draft.guestCount,
  });
  const financials = props.details.corporateFixedTotal && calculatedFinancials.addedGuests > 0
    ? {
        ...calculatedFinancials,
        additionalAmount: 0,
        newOutstanding: booking.balanceOutstanding,
      }
    : calculatedFinancials;
  const requiresManualFinancialBasis =
    !props.details.corporateFixedTotal &&
    financials.addedGuests > 0 && financials.additionalAmount === null;
  const manualFinancials = calculateAuthorizedLegacyIncrease({
    amountPaid: booking.amountPaid,
    currentGuestCount: booking.guestCount,
    currentTotal: booking.totalAmount,
    newGuestCount: draft.guestCount,
    paymentBasis: draft.manualPaymentBasis,
    unitAmount: draft.manualUnitAmount,
  });
  const manualFinancialsValid =
    !requiresManualFinancialBasis || manualFinancials.additionalAmount !== null;
  const isReduction = draft.guestCount < booking.guestCount;
  const savedBasis = props.details.reductionBasis;
  const confirmedBasis = savedBasis?.componentConfirmationRequired ? confirmGuestReductionComponents(savedBasis, {
    ...components,
    ...(props.details.operationalAuthority ? { confirmed: true, sourceDocument: "Authorised Box Office financial breakdown." } : {}),
    ticketAmount: components.ticketAmount.trim() ? Number(components.ticketAmount) : NaN,
    gratuityAmount: components.gratuityAmount.trim() ? Number(components.gratuityAmount) : NaN,
    barTabAmount: components.barTabAmount.trim() ? Number(components.barTabAmount) : NaN,
    otherAmount: components.otherAmount.trim() ? Number(components.otherAmount) : NaN,
  }) : null;
  const rawBasis = confirmedBasis ?? savedBasis;
  const operationalBasis = rawBasis?.operationalAuthority
    ? { ...rawBasis, operationalException: { waivePenalty: true, transferGratuity: reductionDisposition === "bar-credit" } } : null;
  const requestedOperationalPreview = operationalBasis ? previewGuestReduction(operationalBasis, draft.guestCount, reductionDisposition) : null;
  const hasOperationalAllocation = reductionDisposition === "bar-credit"
    ? Number(requestedOperationalPreview?.barCreditAmount) > 0
    : reductionDisposition === "outstanding-balance" && Number(requestedOperationalPreview?.outstandingBalanceAllocationAmount) > 0;
  const basis = hasOperationalAllocation ? operationalBasis : rawBasis;
  const isBuyoutReduction = Boolean(basis?.blockedReason?.startsWith("Buyout:"));
  const preserveFinancials = Boolean(props.details.operationalAuthority && savedBasis?.preserveFinancials);
  const isZeroCompReduction = booking.paymentStatus === "comp_vip" && booking.totalAmount === 0 && booking.amountPaid === 0;
  const defaultReductionPreview = basis ? previewGuestReduction(basis, draft.guestCount) : null;
  const effectiveDisposition = !hasOperationalAllocation && defaultReductionPreview?.eligibleTicketAmount === 0 ? "review-refund" : reductionDisposition;
  const reductionPreview = effectiveDisposition === "review-refund" ? defaultReductionPreview
    : basis ? previewGuestReduction(basis, draft.guestCount, effectiveDisposition) : null;
  const unpaidReduction = booking.amountPaid === 0 && reductionPreview?.fullRefundWindow === true;
  const operationalBarAvailable = rawBasis?.operationalAuthority && Number(previewGuestReduction({ ...rawBasis,
    operationalException: { waivePenalty: true, transferGratuity: true } }, draft.guestCount, "bar-credit")?.barCreditAmount) > 0;
  const reductionBlocked = isReduction && !preserveFinancials && !isBuyoutReduction && !isZeroCompReduction && !reductionPreview;
  const isComplimentaryIncrease =
    financials.addedGuests > 0 &&
    booking.paymentStatus === "comp_vip" &&
    props.details.addedGuestPricingBasis.source === "complimentary" &&
    props.details.addedGuestPricingBasis.unitAmount === 0;
  const isChargeableComp =
    (booking.complimentaryCategory === "media" ||
      booking.complimentaryCategory === "tradex") &&
    props.details.addedGuestPricingBasis.source === "complimentary" &&
    props.details.addedGuestPricingBasis.unitAmount !== null;
  const chargeableCompTotal = isChargeableComp
    ? Math.round(
        draft.guestCount *
          (props.details.addedGuestPricingBasis.unitAmount ?? 0) *
          100,
      ) / 100
    : null;
  const [link, setLink] = useState<{ canSend: boolean; paymentUrl: string; token: string } | null>(null);
  const [linkStatus, setLinkStatus] = useState("");

  async function createPaymentLink() {
    setLinkStatus("Creating payment link...");
    try {
      const created = await fetchSupabaseApi<{ canSend: boolean; paymentUrl: string; token: string }>(
        "/api/admin/bookings/payment-link",
        { body: { action: "create-outstanding", bookingReference: booking.bookingReference }, method: "POST" },
      );
      setLink(created);
      setLinkStatus("PAYMENT LINK CREATED ✓");
    } catch (error) {
      setLinkStatus(error instanceof Error ? error.message : "Payment link could not be created.");
    }
  }

  async function sendPaymentLink() {
    if (!link) return;
    setLinkStatus("Sending payment link...");
    try {
      await fetchSupabaseApi("/api/admin/bookings/payment-link", {
        body: { action: "send-existing-outstanding", bookingReference: booking.bookingReference, token: link.token },
        method: "POST",
      });
      setLinkStatus("PAYMENT LINK SENT ✓");
    } catch (error) {
      setLinkStatus(error instanceof Error ? error.message : "Payment link could not be sent.");
    }
  }

  function submitGuestCount() {
    if (reductionBlocked) {
      setSubmissionError(basis?.blockedReason || "Review the cancellation allocation before saving.");
      return;
    }

    setSubmissionError("");
    props.onSave({
      guestCount: draft.guestCount,
      reductionDisposition: isReduction && !preserveFinancials && !isBuyoutReduction && !isZeroCompReduction && !unpaidReduction ? effectiveDisposition : undefined,
      reductionOperationId: isReduction && !preserveFinancials && !isBuyoutReduction && !isZeroCompReduction ? operationId : undefined,
      expectedReductionPreview: reductionPreview ?? undefined,
      expectedAdditionalAmount: financials.additionalAmount ?? undefined,
      manualPaymentBasis: requiresManualFinancialBasis
        ? draft.manualPaymentBasis || undefined
        : undefined,
      manualUnitAmount: requiresManualFinancialBasis
        ? draft.manualUnitAmount
        : undefined,
      reason: draft.reason,
      twoSeaterOverrideReason: props.canOverrideTwoSeaterLimit
        ? draft.reason
        : undefined,
    });
  }

  return (
    <ModalFrame onClose={props.onClose} title="Edit Guest Count">
      <p className="mt-3 text-sm text-zinc-400">{booking.bookingReference}</p>
      <div className="mt-5 grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-white/10 bg-black/35 p-4">
          <p className="text-xs font-semibold uppercase text-zinc-500">Current guests</p>
          <p className="mt-2 text-2xl font-semibold text-white">{booking.guestCount}</p>
        </div>
        <label className="rounded-xl border border-[#D8C36A]/25 bg-[#D8C36A]/5 p-4">
          <span className="text-xs font-semibold uppercase text-[#F2D66C]">New guest count</span>
          <input type="number" min="1" step="1" value={draft.guestCount} onChange={(event) => { setDraft((current) => ({ ...current, guestCount: Number(event.target.value) })); setReductionDisposition("review-refund"); }} className="mt-2 w-full bg-transparent text-2xl font-semibold text-white outline-none" />
        </label>
      </div>
      <p className="mt-4 text-sm text-zinc-300">Current table: {booking.tableCode ?? "Needs a table"} · {booking.zone}</p>
      {financials.addedGuests > 0 ? (
        <div className="mt-4 rounded-xl border border-[#D8C36A]/25 bg-[#D8C36A]/5 p-4 text-sm text-zinc-200">
          <p>Added guests: {financials.addedGuests}</p>
          <p>Pricing: {props.details.corporateFixedTotal ? "Agreed Corporate total" : isComplimentaryIncrease ? "Complimentary" : props.details.addedGuestPricingBasis.paymentBasis === "deposit" ? "Original deposit" : props.details.addedGuestPricingBasis.paymentBasis === "full" ? "Original ticket price" : "Payment details need review"}</p>
          <p>Rate: {props.details.corporateFixedTotal ? "Fixed total · no automatic repricing" : isComplimentaryIncrease ? "Complimentary · R0.00 pp" : props.details.addedGuestPricingBasis.unitAmount === null ? "Check payment details" : `R${props.details.addedGuestPricingBasis.unitAmount.toFixed(2)} pp`}</p>
          {"gratuityRate" in props.details.addedGuestPricingBasis && props.details.addedGuestPricingBasis.gratuityRate ? (
            <p>Existing booked gratuity: 12.5% on the added tickets.</p>
          ) : null}
          <p>Additional amount: {financials.additionalAmount === null ? "Unavailable" : `R${financials.additionalAmount.toFixed(2)}`}</p>
          <p>New outstanding: {financials.newOutstanding === null ? "Unavailable" : `R${financials.newOutstanding.toFixed(2)}`}</p>
        </div>
      ) : (
        <p className="mt-1 text-xs text-zinc-500">
          {isChargeableComp
            ? `The ${booking.complimentaryCategory === "media" ? "Media" : "Tradex"} COMP total will update to ${formatMoney(chargeableCompTotal ?? 0)}. Existing payments remain unchanged.`
            : preserveFinancials ? "Existing financial amounts stay unchanged."
            : isBuyoutReduction ? "Fixed Buyout pricing and separately agreed terms remain unchanged."
            : "Review the cancellation allocation below. No payment or refund is processed by this change."}
        </p>
      )}
      {requiresManualFinancialBasis && (
        <section className="mt-4 rounded-xl border border-amber-300/30 bg-amber-950/15 p-4">
          <p className="text-xs font-semibold uppercase text-amber-200">Payment details need review</p>
          <div className="mt-3 grid grid-cols-2 gap-3 text-sm text-zinc-200">
            <p>Existing payment<br /><strong>R{booking.amountPaid.toFixed(2)}</strong></p>
            <p>Existing outstanding<br /><strong>R{booking.balanceOutstanding.toFixed(2)}</strong></p>
            <p>Added guests<br /><strong>{financials.addedGuests}</strong></p>
          </div>
          <p className="mt-4 text-xs font-semibold uppercase text-zinc-400">How was this booking priced? *</p>
          <div className="mt-2 grid grid-cols-2 gap-2" role="group" aria-label="How this booking was priced">
            {(["full", "deposit"] as const).map((basis) => (
              <button
                key={basis}
                type="button"
                aria-pressed={draft.manualPaymentBasis === basis}
                onClick={() => setDraft((current) => ({ ...current, manualPaymentBasis: basis }))}
                className={`min-h-11 rounded-full border px-3 text-xs font-semibold uppercase ${draft.manualPaymentBasis === basis ? "border-[#D8C36A] bg-[#D8C36A] text-black" : "border-white/20 text-white hover:border-[#D8C36A]"}`}
              >
                {basis === "full" ? "Full Ticket Rate" : "Deposit Basis"}
              </button>
            ))}
          </div>
          <div className="mt-4">
            <MoneyInput
              label={draft.manualPaymentBasis === "deposit" ? "Deposit per added guest" : "Agreed rate per added guest"}
              value={draft.manualUnitAmount}
              onChange={(manualUnitAmount) => setDraft((current) => ({ ...current, manualUnitAmount }))}
            />
          </div>
          <div className="mt-4 rounded-xl border border-white/10 bg-black/30 p-4 text-xs text-zinc-300">
            <p className="font-semibold uppercase text-[#F2D66C]">Review change</p>
            <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2">
              <p>Current guests<br /><strong>{booking.guestCount}</strong></p>
              <p>New guests<br /><strong>{draft.guestCount}</strong></p>
              <p>Added guests<br /><strong>{financials.addedGuests}</strong></p>
              <p>Pricing<br /><strong>{draft.manualPaymentBasis === "full" ? "Full Ticket Rate" : draft.manualPaymentBasis === "deposit" ? "Deposit Basis" : "Select pricing"}</strong></p>
              <p>Rate per added guest<br /><strong>{draft.manualUnitAmount > 0 ? `R${draft.manualUnitAmount.toFixed(2)}` : "Required"}</strong></p>
              <p>Additional amount<br /><strong>{manualFinancials.additionalAmount === null ? "Unavailable" : `R${manualFinancials.additionalAmount.toFixed(2)}`}</strong></p>
              <p>Current paid<br /><strong>R{booking.amountPaid.toFixed(2)}</strong></p>
              <p>Current outstanding<br /><strong>R{booking.balanceOutstanding.toFixed(2)}</strong></p>
              <p>New booking total<br /><strong>{manualFinancials.newTotal === null ? "Unavailable" : `R${manualFinancials.newTotal.toFixed(2)}`}</strong></p>
              <p>New outstanding<br /><strong>{manualFinancials.newOutstanding === null ? "Unavailable" : `R${manualFinancials.newOutstanding.toFixed(2)}`}</strong></p>
              <p className="col-span-2">Table<br /><strong>{booking.tableCode ? `${booking.tableCode} · ${booking.tableCapacity !== null && draft.guestCount <= booking.tableCapacity ? `Fits ${draft.guestCount} guests` : "Needs a table after this change"}` : "Needs a table"}</strong></p>
            </div>
          </div>
          <p className="mt-3 text-xs text-zinc-500">We can&apos;t confirm the original price for this booking. Check the payment details before adding guests. The price entered here applies only to the added guests.</p>
        </section>
      )}
      {isReduction && savedBasis?.componentConfirmationRequired && (
        <section className="mt-4 rounded-xl border border-[#D8C36A]/30 p-4 text-sm text-zinc-200">
          <h3 className="font-semibold text-[#F2D66C]">Confirm invoice breakdown</h3>
          <p className="mt-2 text-xs text-zinc-400">Enter the agreed amounts for all {booking.guestCount} guests, including VAT where applicable. Enter 0 for any amount not charged. Together they must equal {formatMoney(booking.totalAmount)}. Payments and the agreed total will not change.</p>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {([
              ["ticketAmount", "Tickets"], ["gratuityAmount", "Prepaid ticket gratuity"],
              ["barTabAmount", "Prepaid bar credit"], ["otherAmount", "Other charges / fees"],
            ] as const).map(([key, label]) => (
              <label key={key} className="block text-xs text-zinc-400">{label} (R)
                <input type="number" inputMode="decimal" min="0" step="0.01" required value={components[key]}
                  onChange={event => setComponents(current => ({ ...current, [key]: event.target.value, confirmed: false }))}
                  className="mt-2 min-h-11 w-full rounded-xl border border-white/15 bg-black px-3 text-sm text-white outline-none focus:border-[#D8C36A]" />
              </label>
            ))}
          </div>
          {!props.details.operationalAuthority && <><label className="mt-3 block text-xs text-zinc-400">Invoice / agreement reference
            <input maxLength={500} value={components.sourceDocument} required
              onChange={event => setComponents(current => ({ ...current, sourceDocument: event.target.value, confirmed: false }))}
              className="mt-2 min-h-11 w-full rounded-xl border border-white/15 bg-black px-3 text-sm text-white outline-none focus:border-[#D8C36A]" />
          </label></>}
          {!props.details.operationalAuthority && <label className="mt-3 flex min-h-11 items-center gap-3 text-xs text-zinc-300">
            <input type="checkbox" checked={components.confirmed} onChange={event => setComponents(current => ({ ...current, confirmed: event.target.checked }))} />
            I checked these amounts against the invoice or agreed breakdown.
          </label>}
          {!confirmedBasis && <p className="mt-2 text-xs text-amber-200">Enter a breakdown matching the total.</p>}
        </section>
      )}
      {isReduction && !preserveFinancials && !isBuyoutReduction && !isZeroCompReduction && !savedBasis?.componentConfirmationRequired && basis?.blockedReason && <p role="alert" className="mt-4 rounded-xl border border-amber-300/30 p-4 text-sm text-amber-100">{basis.blockedReason}</p>}
      {reductionPreview && (
        <section className="mt-4 rounded-xl border border-[#D8C36A]/30 bg-[#D8C36A]/5 p-4 text-sm text-zinc-200">
          <p className="text-xs font-semibold uppercase text-[#F2D66C]">{unpaidReduction ? "Guest reduction" : "Cancellation Allocation"}</p>
          <p className="mt-2 text-xs text-zinc-400">{basis?.bookingKind === "corporate" ? "Corporate · 7 days" : "Standard · 5 days"} · {reductionPreview.fullRefundWindow ? "Within permitted period" : "Late reduction"}.{!rawBasis?.operationalAuthority && " Forfeited amounts cannot become bar credit."}</p>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <p>Guests removed<br /><strong>{booking.guestCount - draft.guestCount}</strong></p>
            <p>Remaining tickets<br /><strong>{formatMoney(reductionPreview.ticketAmount)}</strong></p>
            {!unpaidReduction && <p>Tickets forfeited<br /><strong>{formatMoney(reductionPreview.forfeitedAmount)}</strong></p>}
            {!unpaidReduction && <p>Gratuity forfeited<br /><strong>{formatMoney(reductionPreview.gratuityForfeitedAmount)}</strong></p>}
            <p>Remaining gratuity<br /><strong>{formatMoney(reductionPreview.ticketGratuityAmount)}</strong></p>
            {(!unpaidReduction || reductionPreview.barTabAmount > 0) && <p>Bar allocation<br /><strong>{formatMoney(reductionPreview.barTabAmount)}</strong></p>}
            {reductionPreview.refundReviewAmount > 0 && <p>Eligible refund · Accounts processing<br /><strong>{formatMoney(reductionPreview.refundReviewAmount)}</strong></p>}
            {reductionPreview.gratuityReviewAmount > 0 && <p>Gratuity held for authorised review<br /><strong>{formatMoney(reductionPreview.gratuityReviewAmount)}</strong></p>}
            <p>Total Amount Paid<br /><strong>{formatMoney(booking.amountPaid)}</strong></p>
            <p>Revised retained total<br /><strong>{formatMoney(reductionPreview.totalRetainedValue)}</strong></p>
            <p>Outstanding<br /><strong>{formatMoney(reductionPreview.newOutstanding)}</strong></p>
            {reductionPreview.outstandingBalanceAllocationAmount > 0 && <p>Allocated towards balance<br /><strong>{formatMoney(reductionPreview.outstandingBalanceAllocationAmount)}</strong></p>}
          </div>
          {(reductionPreview.eligibleTicketAmount > 0 || operationalBarAvailable) && <label className="mt-4 block text-xs text-zinc-300">Cancellation allocation
            <select value={effectiveDisposition} onChange={(event) => setReductionDisposition(event.target.value as GuestReductionDisposition)} className="mt-2 min-h-11 w-full rounded-xl border border-white/20 bg-black px-3">
              <option value="review-refund">Refund through existing authorised process</option>
              <option value="bar-credit">Transfer eligible ticket value to bar</option>
              {(reductionPreview.fullRefundWindow || rawBasis?.operationalAuthority) && (reductionPreview.newOutstanding > 0 || reductionPreview.outstandingBalanceAllocationAmount > 0) && <option value="outstanding-balance">Allocate towards outstanding balance</option>}
            </select>
          </label>}
          <p className="mt-3 text-xs text-zinc-400">{unpaidReduction ? "No payment received. The unpaid balance will be reduced; no refund or bar credit is created." : rawBasis?.operationalAuthority ? "Existing payments stay unchanged. A bar transfer includes the cancelled guests' eligible paid gratuity." : "Original receipts remain unchanged. Released unpaid ticket balances are removed; paid value is retained as shown pending any authorised refund. No automatic refund or additional gratuity charge. Cancelled gratuity is never transferred to bar."}</p>
        </section>
      )}
      <p className="mt-2 text-xs text-zinc-500">If the table no longer fits, the booking will move safely to Needs a table.</p>
      {!props.details.operationalAuthority && <label className="mt-4 block">
        <span className="mb-2 block text-xs font-semibold uppercase text-zinc-400">Reason for change *</span>
        <textarea rows={3} value={draft.reason} onChange={(event) => setDraft((current) => ({ ...current, reason: event.target.value }))} className="w-full rounded-xl border border-white/15 bg-black px-3 py-3 text-white outline-none focus:border-[#D8C36A]" />
      </label>}
      {(submissionError || props.error) && <p id="guest-count-reconciliation-error" role="alert" className="mt-3 text-sm text-red-200">{submissionError || props.error}</p>}
      {!props.result && <button type="button" aria-describedby={submissionError ? "guest-count-reconciliation-error" : undefined} disabled={props.isSaving || Boolean(validation) || draft.guestCount === booking.guestCount || !manualFinancialsValid} onClick={submitGuestCount} className="mt-5 min-h-12 w-full rounded-full bg-[#D8C36A] px-5 text-sm font-semibold uppercase text-black disabled:cursor-not-allowed disabled:opacity-40">
        {props.isSaving ? "UPDATING..." : props.canOverrideTwoSeaterLimit ? "OVERRIDE LIMIT" : "CONFIRM GUEST COUNT"}
      </button>}
      {props.result ? (
        <div className="mt-5 rounded-xl border border-emerald-400/25 bg-emerald-950/20 p-4">
          <p className="text-sm font-semibold text-emerald-200">UPDATED ✓</p>
          {isReduction && !isBuyoutReduction ? <p className="mt-1 text-xs text-zinc-300">{preserveFinancials ? "Guest count saved. Existing financial amounts are unchanged." : "Guest count and cancellation allocation saved."}{reductionPreview?.manualResolutionRequired ? " Review the flagged balances with Accounts." : ""}</p> : props.result.floor_assignment_required ? (
            <p className="mt-1 text-xs text-zinc-300">
              Guest count updated. The previous table no longer fits this booking, so it now needs a table.
            </p>
          ) : isComplimentaryIncrease ? <p className="mt-1 text-xs text-zinc-300">Guest count updated. The booking remains complimentary.</p> : isChargeableComp ? <p className="mt-1 text-xs text-zinc-300">Booking total updated · R{props.result.balance_outstanding.toFixed(2)} outstanding</p> : props.result.added_guests > 0 ? <p className="mt-1 text-xs text-zinc-300">R{props.result.additional_amount.toFixed(2)} added · R{props.result.balance_outstanding.toFixed(2)} outstanding</p> : <p className="mt-1 text-xs text-zinc-300">Guest count updated. The booking price is unchanged.</p>}
          {props.result.added_guests > 0 && props.result.additional_amount > 0 && (!link ? (
            <button type="button" onClick={() => void createPaymentLink()} className="mt-3 min-h-11 w-full rounded-full bg-[#D8C36A] px-4 text-xs font-semibold uppercase text-black">Create Payment Link</button>
          ) : (
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button type="button" disabled={!link.canSend} onClick={() => void sendPaymentLink()} className="min-h-11 rounded-full border border-white/20 px-3 text-xs font-semibold uppercase text-white disabled:opacity-40">Send To Guest</button>
              <button type="button" onClick={() => { void navigator.clipboard.writeText(link.paymentUrl); setLinkStatus("PAYMENT LINK COPIED ✓"); }} className="min-h-11 rounded-full bg-[#D8C36A] px-3 text-xs font-semibold uppercase text-black">Copy Link</button>
            </div>
          ))}
          {props.result.added_guests > 0 && props.result.additional_amount > 0 && link && !link.canSend && <p className="mt-2 text-xs text-amber-200">No customer email is available. Copy Link remains available.</p>}
          {linkStatus && <p aria-live="polite" className="mt-2 text-xs text-zinc-300">{linkStatus}</p>}
        </div>
      ) : null}
    </ModalFrame>
  );
}
