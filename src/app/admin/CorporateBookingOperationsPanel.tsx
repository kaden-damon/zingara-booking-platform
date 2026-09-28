"use client";

import { useEffect, useMemo, useState } from "react";
import {
  corporateChecklistItems,
  getCorporateOperationsReadiness,
  type CorporateBookingOperations,
  type CorporateOperationsBookingSnapshot,
  type CorporateOperationsDocument,
} from "@/lib/corporateBookingOperations";
import {
  downloadCorporateOperationsDocument,
  getCorporateBookingOperations,
  saveCorporateBookingOperations,
} from "@/lib/supabase/corporateBookingOperations";

type Editor = CorporateOperationsDocument | null;

function money(value: number) {
  return new Intl.NumberFormat("en-ZA", { currency: "ZAR", style: "currency" }).format(value);
}

function download(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

const inputClass = "mt-1 w-full rounded border border-white/15 bg-black/35 px-3 py-2 text-sm text-white outline-none transition focus:border-[#D8C36A]/60 disabled:cursor-not-allowed disabled:opacity-60";
const labelClass = "text-xs font-semibold uppercase tracking-[0.1em] text-zinc-400";

function TextArea(props: { disabled: boolean; label: string; onChange: (value: string) => void; placeholder?: string; value: string }) {
  return (
    <label className="block">
      <span className={labelClass}>{props.label}</span>
      <textarea
        className={`${inputClass} min-h-20 resize-y`}
        disabled={props.disabled}
        onChange={(event) => props.onChange(event.target.value)}
        placeholder={props.placeholder}
        value={props.value}
      />
    </label>
  );
}

export default function CorporateBookingOperationsPanel(props: {
  bookingReference: string;
  canManage: boolean;
  readOnly: boolean;
}) {
  const [operations, setOperations] = useState<CorporateBookingOperations | null>(null);
  const [snapshot, setSnapshot] = useState<CorporateOperationsBookingSnapshot | null>(null);
  const [draft, setDraft] = useState<CorporateBookingOperations | null>(null);
  const [editor, setEditor] = useState<Editor>(null);
  const [status, setStatus] = useState("Loading function details...");
  const [busy, setBusy] = useState<"download" | "save" | null>(null);

  useEffect(() => {
    let active = true;
    void getCorporateBookingOperations(props.bookingReference)
      .then((payload) => {
        if (!active) return;
        setOperations(payload.operations);
        setDraft(payload.operations);
        setSnapshot(payload.snapshot);
        setStatus("");
      })
      .catch((error) => {
        if (active) setStatus(error instanceof Error ? error.message : "Function details could not be loaded.");
      });
    return () => { active = false; };
  }, [props.bookingReference]);

  const readiness = useMemo(
    () => operations ? getCorporateOperationsReadiness(operations) : null,
    [operations],
  );
  const disabled = !props.canManage || props.readOnly || busy === "save";

  function update<K extends keyof CorporateBookingOperations>(key: K, value: CorporateBookingOperations[K]) {
    setDraft((current) => current ? { ...current, [key]: value } : current);
  }

  async function save() {
    if (!draft) return;
    setBusy("save");
    setStatus("Saving...");
    try {
      const payload = await saveCorporateBookingOperations(props.bookingReference, draft);
      setOperations(payload.operations);
      setDraft(payload.operations);
      setSnapshot(payload.snapshot);
      setStatus("Saved to the shared Corporate operations record.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Details could not be saved.");
    } finally {
      setBusy(null);
    }
  }

  async function exportPdf(documentType: CorporateOperationsDocument) {
    setBusy("download");
    setStatus("Preparing PDF...");
    try {
      const blob = await downloadCorporateOperationsDocument(props.bookingReference, documentType);
      download(`${props.bookingReference}_${documentType.replaceAll("-", "_")}.pdf`, blob);
      setStatus("PDF generated from the current live booking record.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "PDF could not be generated.");
    } finally {
      setBusy(null);
    }
  }

  function open(next: CorporateOperationsDocument) {
    setDraft(operations);
    setEditor(next);
    setStatus("");
  }

  const cards = readiness ? [
    { document: "function-brief" as const, label: "Function Brief", state: readiness.function },
    { document: "bar-brief" as const, label: "Bar Brief", state: readiness.bar },
    { document: "checklist" as const, label: "Checklist", state: readiness.checklist },
  ] : [];

  return (
    <section className="mt-4 border-y border-white/10 py-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#F2D66C]">Function &amp; Event Details</p>
          <p className="mt-1 text-sm text-zinc-400">One shared operational record for this Corporate booking.</p>
        </div>
        {operations?.updatedAt && (
          <p className="text-xs text-zinc-500">Updated {new Intl.DateTimeFormat("en-ZA", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Johannesburg" }).format(new Date(operations.updatedAt))}{operations.updatedByName ? ` by ${operations.updatedByName}` : ""}</p>
        )}
      </div>
      {cards.length > 0 ? (
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          {cards.map((card) => (
            <div key={card.document} className="rounded border border-white/10 bg-black/20 p-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-white">{card.label}</p>
                  <p className={`mt-1 text-xs ${card.state.ready ? "text-emerald-300" : "text-amber-200"}`}>
                    {card.document === "checklist" ? `${card.state.completed}/${card.state.total}` : card.state.ready ? "Ready" : "Needs info"}
                  </p>
                </div>
                <button type="button" onClick={() => open(card.document)} className="rounded border border-[#D8C36A]/35 px-2.5 py-1.5 text-xs font-semibold text-[#F2D66C] transition hover:bg-[#D8C36A] hover:text-black">Open</button>
              </div>
              <button type="button" disabled={busy !== null} onClick={() => void exportPdf(card.document)} className="mt-3 text-xs font-semibold text-zinc-300 underline decoration-white/25 underline-offset-4 disabled:opacity-40">Download PDF</button>
            </div>
          ))}
        </div>
      ) : <p className="mt-3 text-sm text-zinc-400">{status}</p>}
      {status && operations && <p className="mt-3 text-xs text-zinc-400">{status}</p>}

      {editor && draft && snapshot && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 p-3 backdrop-blur-sm">
          <button aria-label="Close Function and Event Details" className="absolute inset-0" onClick={() => setEditor(null)} type="button" />
          <div className="relative z-10 flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded border border-[#D8C36A]/30 bg-zinc-950 shadow-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-white/10 p-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#F2D66C]">Corporate Operations</p>
                <h3 className="mt-1 text-lg font-semibold text-white">{editor === "function-brief" ? "Function Brief" : editor === "bar-brief" ? "Bar Brief" : "Corporate Checklist"}</h3>
                <p className="mt-1 text-sm text-zinc-400">{snapshot.companyName} · {snapshot.bookingReference}</p>
              </div>
              <button type="button" onClick={() => setEditor(null)} className="rounded border border-white/15 px-3 py-2 text-xs font-semibold text-zinc-200">Close</button>
            </div>
            <div className="overflow-y-auto p-4">
              <div className="grid gap-2 rounded border border-white/10 bg-black/25 p-3 text-sm text-zinc-300 sm:grid-cols-2">
                <p><span className="text-zinc-500">Performance:</span> {snapshot.venue} · {snapshot.showDate} · {snapshot.showTime}</p>
                <p><span className="text-zinc-500">Guests:</span> {snapshot.guestCount} · {snapshot.seating}</p>
                <p><span className="text-zinc-500">Organiser:</span> {snapshot.organiserName}</p>
                <p><span className="text-zinc-500">Tables:</span> {snapshot.tableSummary}</p>
                <p><span className="text-zinc-500">Total / paid:</span> {money(snapshot.totalAmount)} / {money(snapshot.amountPaid)}</p>
                <p><span className="text-zinc-500">Outstanding:</span> {money(snapshot.outstandingAmount)}</p>
              </div>

              {editor === "function-brief" && (
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <TextArea disabled={disabled} label="Event requirements" value={draft.eventRequirements} onChange={(value) => update("eventRequirements", value)} />
                  <TextArea disabled={disabled} label="Running order" value={draft.runningOrder} onChange={(value) => update("runningOrder", value)} />
                  <TextArea disabled={disabled} label="Operational dietary details" placeholder={snapshot.dietaryRequirements.join(", ") || "Record None when confirmed"} value={draft.dietaryNotes} onChange={(value) => update("dietaryNotes", value)} />
                  <TextArea disabled={disabled} label="Accessibility requirements" placeholder="Record None when confirmed" value={draft.accessibilityNotes} onChange={(value) => update("accessibilityNotes", value)} />
                  <TextArea disabled={disabled} label="Gratuity / staff allocation" value={draft.gratuityAllocation} onChange={(value) => update("gratuityAllocation", value)} />
                  <TextArea disabled={disabled} label="Special requests" value={draft.specialRequests} onChange={(value) => update("specialRequests", value)} />
                  <div className="sm:col-span-2"><TextArea disabled={disabled} label="Function notes" value={draft.functionNotes} onChange={(value) => update("functionNotes", value)} /></div>
                </div>
              )}

              {editor === "bar-brief" && (
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <label className="block"><span className={labelClass}>Bar service plan</span><select className={inputClass} disabled={disabled} value={draft.barServicePlan} onChange={(event) => update("barServicePlan", event.target.value as CorporateBookingOperations["barServicePlan"])}><option value="not-confirmed">Not confirmed</option><option value="no-bar-tab">No Bar Tab</option><option value="limited">Limited Bar Tab</option><option value="open">Open Bar Tab</option></select></label>
                  <label className="block"><span className={labelClass}>Operational bar limit</span><input className={inputClass} disabled={disabled || draft.barServicePlan !== "limited"} min="0" step="0.01" type="number" value={draft.operationalBarLimit ?? ""} onChange={(event) => update("operationalBarLimit", event.target.value ? Number(event.target.value) : null)} /></label>
                  <TextArea disabled={disabled} label="Wristband details" value={draft.wristbandDetails} onChange={(value) => update("wristbandDetails", value)} />
                  <TextArea disabled={disabled} label="Limit instructions" value={draft.barLimitInstructions} onChange={(value) => update("barLimitInstructions", value)} />
                  <TextArea disabled={disabled} label="Alcohol restrictions" placeholder="Record None when confirmed" value={draft.alcoholRestrictions} onChange={(value) => update("alcoholRestrictions", value)} />
                  <TextArea disabled={disabled} label="Settlement person / instruction" value={draft.settlementContact} onChange={(value) => update("settlementContact", value)} />
                  <div className="sm:col-span-2"><TextArea disabled={disabled} label="Bar requests" value={draft.barRequests} onChange={(value) => update("barRequests", value)} /></div>
                  <p className="sm:col-span-2 text-xs text-zinc-500">Accounting Bar Tab remains derived from the booking: {money(snapshot.barTabAmount)}. This operational limit does not alter payment data.</p>
                </div>
              )}

              {editor === "checklist" && (
                <div className="mt-4 space-y-3">
                  {corporateChecklistItems.map((item) => {
                    const entry = draft.checklist[item.id];
                    return (
                      <div key={item.id} className="grid gap-2 border-b border-white/10 pb-3 sm:grid-cols-[minmax(0,1fr)_180px]">
                        <div><p className="text-sm font-semibold text-white">{item.label}</p><input className={inputClass} disabled={disabled} placeholder="Optional note" value={entry.note} onChange={(event) => update("checklist", { ...draft.checklist, [item.id]: { ...entry, note: event.target.value } })} /></div>
                        <label><span className={labelClass}>Status</span><select className={inputClass} disabled={disabled} value={entry.status} onChange={(event) => update("checklist", { ...draft.checklist, [item.id]: { ...entry, status: event.target.value as typeof entry.status } })}><option value="needs-attention">Needs attention</option><option value="complete">Complete</option><option value="not-applicable">Not applicable</option></select></label>
                      </div>
                    );
                  })}
                  <div className="grid gap-4 sm:grid-cols-2"><label><span className={labelClass}>Employee name</span><input className={inputClass} disabled={disabled} value={draft.employeeName} onChange={(event) => update("employeeName", event.target.value)} /></label><label><span className={labelClass}>Manager name</span><input className={inputClass} disabled={disabled} value={draft.managerName} onChange={(event) => update("managerName", event.target.value)} /></label></div>
                  <p className="text-xs text-zinc-500">Names provide review context. Immutable staff attribution is recorded automatically when this checklist is saved.</p>
                </div>
              )}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 p-4">
              <p className="text-xs text-zinc-400">{status}</p>
              <div className="flex gap-2"><button type="button" disabled={busy !== null} onClick={() => void exportPdf(editor)} className="rounded border border-white/15 px-3 py-2 text-xs font-semibold text-zinc-200 disabled:opacity-40">Download PDF</button><button type="button" disabled={disabled} onClick={() => void save()} className="rounded bg-[#D8C36A] px-4 py-2 text-xs font-semibold text-black disabled:cursor-not-allowed disabled:opacity-40">{busy === "save" ? "Saving..." : "Save details"}</button></div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
