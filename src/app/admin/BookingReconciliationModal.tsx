"use client";

import { useState } from "react";

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

export type BookingReconciliationDetails = {
  booking: {
    amountPaid: number;
    balanceOutstanding: number;
    bookingFee: number;
    bookingReference: string;
    depositAmount: number;
    guestCount: number;
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
  providerBackedAmount: number;
  addedGuestPricingBasis: AddedGuestPricingBasis;
};

export type GuestCountReconciliationResult = {
  additional_amount: number;
  added_guests: number;
  balance_outstanding: number;
  booking_reference: string;
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
  label,
  onChange,
  value,
}: {
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

export function FinancialReconciliationModal(
  props: BaseProps & {
    amountPaid: number;
    onSave: (draft: {
      amountPaid: number;
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
    reason: props.reason,
    totalAmount: props.totalAmount,
  });
  const outstanding = Math.max(toMoney(draft.totalAmount - draft.amountPaid), 0);
  const validation = validateFinancialReconciliation(draft);

  return (
    <ModalFrame onClose={props.onClose} title="Edit Payment Details">
      <p className="mt-3 text-sm text-zinc-400">{booking.bookingReference}</p>
      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-white/10 bg-black/35 p-4">
          <p className="text-xs font-semibold uppercase text-zinc-500">Current</p>
          <p className="mt-2 text-sm text-zinc-200">Obligation R{booking.totalAmount.toFixed(2)}</p>
          <p className="text-sm text-zinc-200">Paid R{booking.amountPaid.toFixed(2)}</p>
          <p className="text-sm text-zinc-200">Outstanding R{booking.balanceOutstanding.toFixed(2)}</p>
          <p className="mt-2 text-xs text-zinc-500">Deposit/prepayment R{booking.depositAmount.toFixed(2)}</p>
          <p className="text-xs text-zinc-500">Booking Fee R{booking.bookingFee.toFixed(2)}</p>
          <p className="text-xs text-zinc-500">Status {booking.paymentStatus}</p>
        </div>
        <div className="rounded-xl border border-[#D8C36A]/25 bg-[#D8C36A]/5 p-4">
          <p className="text-xs font-semibold uppercase text-[#F2D66C]">New</p>
          <p className="mt-2 text-sm text-white">Obligation R{toMoney(draft.totalAmount).toFixed(2)}</p>
          <p className="text-sm text-white">Paid R{toMoney(draft.amountPaid).toFixed(2)}</p>
          <p className="text-sm text-white">Outstanding R{outstanding.toFixed(2)}</p>
          <p className="mt-2 text-xs text-zinc-400">Status {getReconciledPaymentStatus(draft.totalAmount, draft.amountPaid).replaceAll("_", " ")}</p>
        </div>
      </div>
      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <MoneyInput label="Booking obligation" value={draft.totalAmount} onChange={(totalAmount) => setDraft((current) => ({ ...current, totalAmount }))} />
        <MoneyInput label="Amount paid" value={draft.amountPaid} onChange={(amountPaid) => setDraft((current) => ({ ...current, amountPaid }))} />
      </div>
      <div className="mt-4 rounded-xl border border-white/10 p-4 text-xs text-zinc-400">
        <p>Provider-backed paid amount: R{props.details.providerBackedAmount.toFixed(2)} (preserved)</p>
        <p className="mt-2 font-semibold uppercase text-zinc-500">Legacy evidence</p>
        {props.details.legacyEvidence.length ? props.details.legacyEvidence.map((item) => (
          <p key={item.label}>{item.label}: R{item.amount.toFixed(2)}</p>
        )) : <p>No legacy payment evidence recorded.</p>}
      </div>
      <label className="mt-4 block">
        <span className="mb-2 block text-xs font-semibold uppercase text-zinc-400">Reason for adjustment *</span>
        <textarea rows={3} value={draft.reason} onChange={(event) => setDraft((current) => ({ ...current, reason: event.target.value }))} className="w-full rounded-xl border border-white/15 bg-black px-3 py-3 text-white outline-none focus:border-[#D8C36A]" />
      </label>
      {props.error && <p role="alert" className="mt-3 text-sm text-red-200">{props.error}</p>}
      <button type="button" disabled={props.isSaving || Boolean(validation)} onClick={() => props.onSave(draft)} className="mt-5 min-h-12 w-full rounded-full bg-[#D8C36A] px-5 text-sm font-semibold uppercase text-black disabled:cursor-not-allowed disabled:opacity-40">
        {props.isSaving ? "Saving..." : "Confirm Financial Reconciliation"}
      </button>
    </ModalFrame>
  );
}

export function GuestCountReconciliationModal(
  props: BaseProps & {
    guestCount: number;
    onSave: (draft: {
      guestCount: number;
      manualPaymentBasis?: LegacyGuestIncreasePaymentBasis;
      manualUnitAmount?: number;
      reason: string;
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
    reason: props.reason,
  });
  const validation = validateGuestCountReconciliation(draft);
  const financials = calculateAddedGuestFinancials({
    basis: props.details.addedGuestPricingBasis,
    currentGuestCount: booking.guestCount,
    currentOutstanding: booking.balanceOutstanding,
    newGuestCount: draft.guestCount,
  });
  const requiresManualFinancialBasis =
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
          <input type="number" min="1" step="1" value={draft.guestCount} onChange={(event) => setDraft((current) => ({ ...current, guestCount: Number(event.target.value) }))} className="mt-2 w-full bg-transparent text-2xl font-semibold text-white outline-none" />
        </label>
      </div>
      <p className="mt-4 text-sm text-zinc-300">Current table: {booking.tableCode ?? "Floor Assignment Queue"} · {booking.zone}</p>
      {financials.addedGuests > 0 ? (
        <div className="mt-4 rounded-xl border border-[#D8C36A]/25 bg-[#D8C36A]/5 p-4 text-sm text-zinc-200">
          <p>Added guests: {financials.addedGuests}</p>
          <p>Basis: {props.details.addedGuestPricingBasis.paymentBasis === "deposit" ? "Original deposit" : props.details.addedGuestPricingBasis.paymentBasis === "full" ? "Original agreed ticket rate" : "Not authoritative"}</p>
          <p>Rate: {props.details.addedGuestPricingBasis.unitAmount === null ? "Requires financial reconciliation" : `R${props.details.addedGuestPricingBasis.unitAmount.toFixed(2)} pp`}</p>
          <p>Additional obligation: {financials.additionalAmount === null ? "Unavailable" : `R${financials.additionalAmount.toFixed(2)}`}</p>
          <p>New outstanding: {financials.newOutstanding === null ? "Unavailable" : `R${financials.newOutstanding.toFixed(2)}`}</p>
        </div>
      ) : (
        <p className="mt-1 text-xs text-zinc-500">Reducing guests does not reduce the agreed obligation or create a refund. Use financial reconciliation for a separate approved adjustment.</p>
      )}
      {requiresManualFinancialBasis && (
        <section className="mt-4 rounded-xl border border-amber-300/30 bg-amber-950/15 p-4">
          <p className="text-xs font-semibold uppercase text-amber-200">Financial Reconciliation Required</p>
          <div className="mt-3 grid grid-cols-2 gap-3 text-sm text-zinc-200">
            <p>Existing payment<br /><strong>R{booking.amountPaid.toFixed(2)}</strong></p>
            <p>Existing outstanding<br /><strong>R{booking.balanceOutstanding.toFixed(2)}</strong></p>
            <p>Added guests<br /><strong>{financials.addedGuests}</strong></p>
          </div>
          <p className="mt-4 text-xs font-semibold uppercase text-zinc-400">Payment basis *</p>
          <div className="mt-2 grid grid-cols-2 gap-2" role="group" aria-label="Payment basis">
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
            <p className="font-semibold uppercase text-[#F2D66C]">Confirmation Preview</p>
            <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2">
              <p>Current guests<br /><strong>{booking.guestCount}</strong></p>
              <p>New guests<br /><strong>{draft.guestCount}</strong></p>
              <p>Added guests<br /><strong>{financials.addedGuests}</strong></p>
              <p>Payment basis<br /><strong>{draft.manualPaymentBasis === "full" ? "Full Ticket Rate" : draft.manualPaymentBasis === "deposit" ? "Deposit Basis" : "Select basis"}</strong></p>
              <p>Rate per added guest<br /><strong>{draft.manualUnitAmount > 0 ? `R${draft.manualUnitAmount.toFixed(2)}` : "Required"}</strong></p>
              <p>Additional obligation<br /><strong>{manualFinancials.additionalAmount === null ? "Unavailable" : `R${manualFinancials.additionalAmount.toFixed(2)}`}</strong></p>
              <p>Current paid<br /><strong>R{booking.amountPaid.toFixed(2)}</strong></p>
              <p>Current outstanding<br /><strong>R{booking.balanceOutstanding.toFixed(2)}</strong></p>
              <p>New obligation<br /><strong>{manualFinancials.newTotal === null ? "Unavailable" : `R${manualFinancials.newTotal.toFixed(2)}`}</strong></p>
              <p>New outstanding<br /><strong>{manualFinancials.newOutstanding === null ? "Unavailable" : `R${manualFinancials.newOutstanding.toFixed(2)}`}</strong></p>
              <p className="col-span-2">Table<br /><strong>{booking.tableCode ? `${booking.tableCode} · ${booking.tableCapacity !== null && draft.guestCount <= booking.tableCapacity ? `Fits ${draft.guestCount} guests` : "Moves safely to Floor Assignment Queue if undersized"}` : "Floor Assignment Queue"}</strong></p>
            </div>
          </div>
          <p className="mt-3 text-xs text-zinc-500">The entered basis is recorded as staff-authorised legacy reconciliation. Current venue pricing is not inferred.</p>
        </section>
      )}
      <p className="mt-2 text-xs text-zinc-500">If the table no longer fits, the booking will move safely to the Floor Assignment Queue.</p>
      <label className="mt-4 block">
        <span className="mb-2 block text-xs font-semibold uppercase text-zinc-400">Reason for change *</span>
        <textarea rows={3} value={draft.reason} onChange={(event) => setDraft((current) => ({ ...current, reason: event.target.value }))} className="w-full rounded-xl border border-white/15 bg-black px-3 py-3 text-white outline-none focus:border-[#D8C36A]" />
      </label>
      {props.error && <p role="alert" className="mt-3 text-sm text-red-200">{props.error}</p>}
      {!props.result && <button type="button" disabled={props.isSaving || Boolean(validation) || draft.guestCount === booking.guestCount || !manualFinancialsValid} onClick={() => props.onSave({ guestCount: draft.guestCount, manualPaymentBasis: requiresManualFinancialBasis ? draft.manualPaymentBasis || undefined : undefined, manualUnitAmount: requiresManualFinancialBasis ? draft.manualUnitAmount : undefined, reason: draft.reason })} className="mt-5 min-h-12 w-full rounded-full bg-[#D8C36A] px-5 text-sm font-semibold uppercase text-black disabled:cursor-not-allowed disabled:opacity-40">
        {props.isSaving ? "UPDATING..." : "CONFIRM GUEST COUNT"}
      </button>}
      {props.result ? (
        <div className="mt-5 rounded-xl border border-emerald-400/25 bg-emerald-950/20 p-4">
          <p className="text-sm font-semibold text-emerald-200">UPDATED ✓</p>
          {props.result.added_guests > 0 ? <p className="mt-1 text-xs text-zinc-300">R{props.result.additional_amount.toFixed(2)} added · R{props.result.balance_outstanding.toFixed(2)} outstanding</p> : <p className="mt-1 text-xs text-zinc-300">Guest count updated. The agreed financial obligation is unchanged.</p>}
          {props.result.added_guests > 0 && (!link ? (
            <button type="button" onClick={() => void createPaymentLink()} className="mt-3 min-h-11 w-full rounded-full bg-[#D8C36A] px-4 text-xs font-semibold uppercase text-black">Create Payment Link</button>
          ) : (
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button type="button" disabled={!link.canSend} onClick={() => void sendPaymentLink()} className="min-h-11 rounded-full border border-white/20 px-3 text-xs font-semibold uppercase text-white disabled:opacity-40">Send To Guest</button>
              <button type="button" onClick={() => { void navigator.clipboard.writeText(link.paymentUrl); setLinkStatus("PAYMENT LINK COPIED ✓"); }} className="min-h-11 rounded-full bg-[#D8C36A] px-3 text-xs font-semibold uppercase text-black">Copy Link</button>
            </div>
          ))}
          {props.result.added_guests > 0 && link && !link.canSend && <p className="mt-2 text-xs text-amber-200">No customer email is available. Copy Link remains available.</p>}
          {linkStatus && <p aria-live="polite" className="mt-2 text-xs text-zinc-300">{linkStatus}</p>}
        </div>
      ) : null}
    </ModalFrame>
  );
}
