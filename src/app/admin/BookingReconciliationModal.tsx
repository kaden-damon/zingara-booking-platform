"use client";

import { useState } from "react";

import {
  getReconciledPaymentStatus,
  toMoney,
  validateFinancialReconciliation,
  validateGuestCountReconciliation,
} from "@/lib/bookingReconciliation";

export type BookingReconciliationDetails = {
  booking: {
    amountPaid: number;
    balanceOutstanding: number;
    bookingFee: number;
    bookingReference: string;
    depositAmount: number;
    guestCount: number;
    paymentStatus: string;
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
    onSave: (draft: { guestCount: number; reason: string }) => void;
    reason: string;
  },
) {
  const { booking } = props.details;
  const [draft, setDraft] = useState({
    guestCount: props.guestCount,
    reason: props.reason,
  });
  const validation = validateGuestCountReconciliation(draft);

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
      <p className="mt-1 text-xs text-zinc-500">The agreed booking obligation and all payment values remain unchanged. If the table no longer fits, the booking will move safely to the Floor Assignment Queue.</p>
      <label className="mt-4 block">
        <span className="mb-2 block text-xs font-semibold uppercase text-zinc-400">Reason for change *</span>
        <textarea rows={3} value={draft.reason} onChange={(event) => setDraft((current) => ({ ...current, reason: event.target.value }))} className="w-full rounded-xl border border-white/15 bg-black px-3 py-3 text-white outline-none focus:border-[#D8C36A]" />
      </label>
      {props.error && <p role="alert" className="mt-3 text-sm text-red-200">{props.error}</p>}
      <button type="button" disabled={props.isSaving || Boolean(validation) || draft.guestCount === booking.guestCount} onClick={() => props.onSave(draft)} className="mt-5 min-h-12 w-full rounded-full bg-[#D8C36A] px-5 text-sm font-semibold uppercase text-black disabled:cursor-not-allowed disabled:opacity-40">
        {props.isSaving ? "Saving..." : "Confirm Guest Count"}
      </button>
    </ModalFrame>
  );
}
