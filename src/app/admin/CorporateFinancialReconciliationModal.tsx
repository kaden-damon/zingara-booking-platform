"use client";

import { useEffect, useRef, useState } from "react";

import {
  getImportedCorporateProvenance,
  parseImportedCorporateFinancialDraft,
  type ImportedCorporateFinancialDraft,
  validateImportedCorporateFinancialDraft,
} from "@/lib/corporateFinancialReconciliation";
import type { CorporateRequest } from "@/lib/zingaraDemo";

type Props = {
  error: string;
  isSaving: boolean;
  isSuccess: boolean;
  onClose: () => void;
  onSave: (draft: ImportedCorporateFinancialDraft) => void;
  request: CorporateRequest;
};

export default function CorporateFinancialReconciliationModal({
  error,
  isSaving,
  isSuccess,
  onClose,
  onSave,
  request,
}: Props) {
  const evidence = request.financialReconciliation;
  const provenance = getImportedCorporateProvenance(request);
  const [draft, setDraft] = useState<ImportedCorporateFinancialDraft>({
    additionalAmount: evidence?.additionalAmount.toString() ?? "",
    amountPaid: evidence?.amountPaid.toString() ?? "",
    gratuityAmount: evidence?.gratuityAmount.toString() ?? "",
    notes: evidence?.notes ?? "",
    paymentMethod: evidence?.paymentMethod ?? "UNKNOWN",
    ticketObligation: evidence?.ticketObligation.toString() ?? "",
  });
  const [errors, setErrors] = useState<
    Partial<Record<keyof ImportedCorporateFinancialDraft, string>>
  >({});
  const submitStartedRef = useRef(false);
  const total =
    Number(draft.ticketObligation || "0") +
    Number(draft.gratuityAmount || "0") +
    Number(draft.additionalAmount || "0");
  const outstanding = total - Number(draft.amountPaid || "0");

  useEffect(() => {
    if (!isSaving && !isSuccess) submitStartedRef.current = false;
  }, [isSaving, isSuccess]);

  function update(updates: Partial<ImportedCorporateFinancialDraft>) {
    setDraft((current) => ({ ...current, ...updates }));
    setErrors({});
  }

  function submit() {
    if (isSaving || isSuccess || submitStartedRef.current) return;
    const nextErrors = validateImportedCorporateFinancialDraft(draft);

    if (!parseImportedCorporateFinancialDraft(draft)) {
      setErrors(nextErrors);
      return;
    }

    submitStartedRef.current = true;
    onSave(draft);
  }

  return (
    <div className="fixed inset-0 z-[156] flex items-end justify-center bg-black/80 p-3 text-white backdrop-blur-md sm:items-center sm:p-6">
      <section
        aria-labelledby="corporate-financial-reconciliation-title"
        aria-modal="true"
        role="dialog"
        className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-[1.5rem] border border-[#D8C36A]/35 bg-zinc-950 p-5 shadow-2xl shadow-black/50 sm:p-7"
      >
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#D8C36A]">
          Imported Corporate Enquiry
        </p>
        <h2 id="corporate-financial-reconciliation-title" className="mt-2 text-2xl font-bold">
          Reconcile Financials
        </h2>
        <p className="mt-2 text-sm leading-6 text-zinc-400">
          Persist reviewed historical evidence for {request.companyName || request.contactName} before conversion. Current zone pricing is not used.
        </p>

        <div className="mt-5 rounded-xl border border-white/10 bg-black/35 px-4 py-3 text-sm text-zinc-300">
          <p><span className="text-zinc-500">Imported payment note</span> · {provenance?.paymentState || "Not supplied"}</p>
          <p className="mt-1"><span className="text-zinc-500">Source</span> · {provenance ? `${provenance.sourceFile} · row ${provenance.sourceRow}` : "Metadata requires review"}</p>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          {([
            ["ticketObligation", "Agreed Ticket Obligation"],
            ["gratuityAmount", "Gratuity"],
            ["additionalAmount", "Historical Additional Amounts"],
            ["amountPaid", "Amount Already Paid"],
          ] as const).map(([field, label]) => (
            <label key={field} className="grid gap-2 text-sm text-zinc-300">
              {label}
              <input
                inputMode="decimal"
                min="0"
                placeholder="R0.00"
                step="0.01"
                type="number"
                value={draft[field]}
                onChange={(event) => update({ [field]: event.target.value })}
                className="rounded-xl border border-white/15 bg-black px-4 py-3 text-white outline-none focus:border-[#D8C36A]"
              />
              {errors[field] && <span className="text-xs text-red-300">{errors[field]}</span>}
            </label>
          ))}

          <label className="grid gap-2 text-sm text-zinc-300">
            Payment Method
            <select
              value={draft.paymentMethod}
              onChange={(event) => update({ paymentMethod: event.target.value as ImportedCorporateFinancialDraft["paymentMethod"] })}
              className="rounded-xl border border-white/15 bg-black px-4 py-3 text-white outline-none focus:border-[#D8C36A]"
            >
              <option value="UNKNOWN">Method Unknown</option>
              <option value="EFT">EFT / Invoice</option>
              <option value="CC">Credit Card</option>
              <option value="COMP">Complimentary</option>
            </select>
            {errors.paymentMethod && <span className="text-xs text-red-300">{errors.paymentMethod}</span>}
          </label>

          <div className="rounded-xl border border-[#D8C36A]/25 bg-black/40 px-4 py-3 text-sm">
            <p><span className="text-zinc-500">Total obligation</span> · R{Number.isFinite(total) ? total.toFixed(2) : "—"}</p>
            <p className="mt-1 font-semibold text-[#F2D66C]"><span className="font-normal text-zinc-500">Outstanding</span> · R{Number.isFinite(outstanding) ? outstanding.toFixed(2) : "—"}</p>
            <p className="mt-2 text-xs leading-5 text-zinc-400">Outstanding is calculated server-side. Gratuity and additional amounts are added once to the ticket obligation.</p>
          </div>

          <label className="grid gap-2 text-sm text-zinc-300 sm:col-span-2">
            Reconciliation Notes
            <textarea
              rows={4}
              value={draft.notes}
              onChange={(event) => update({ notes: event.target.value })}
              placeholder="Record the invoice, workbook, remittance or other authoritative source used."
              className="resize-y rounded-xl border border-white/15 bg-black px-4 py-3 text-white outline-none focus:border-[#D8C36A]"
            />
            {errors.notes && <span className="text-xs text-red-300">{errors.notes}</span>}
          </label>
        </div>

        {error && <p role="alert" className="mt-4 rounded-xl border border-red-300/25 bg-red-950/20 px-4 py-3 text-sm text-red-100">{error}</p>}

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} disabled={isSaving || isSuccess} className="rounded-full border border-white/15 px-5 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-zinc-300 transition hover:bg-white hover:text-black disabled:opacity-50">
            Cancel
          </button>
          <button type="button" onClick={submit} disabled={isSaving || isSuccess} className="rounded-full bg-[#D8C36A] px-5 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-black transition hover:bg-[#F2D66C] disabled:cursor-not-allowed disabled:opacity-60">
            {isSaving ? "Saving..." : isSuccess ? "Saved ✓" : "Save Reconciliation"}
          </button>
        </div>
      </section>
    </div>
  );
}
