"use client";

import { useEffect, useState } from "react";
import { getAdminAuthSession } from "@/lib/supabase/auth";

type PendingRecord = { competencies: string[]; description: string; durationMinutes: number; id: string; title: string; trainerName: string; trainingDate: string };

async function authorisedRequest(init?: RequestInit) {
  const auth = await getAdminAuthSession();
  if (!auth) throw new Error("Your Admin session has expired. Sign in again.");
  return fetch("/api/admin/training", { ...init, headers: { ...init?.headers, Authorization: `Bearer ${auth.session.access_token}`, "Content-Type": "application/json" } });
}

export default function TrainingAcknowledgementPrompt({ canPrompt }: { canPrompt: boolean }) {
  const [records, setRecords] = useState<PendingRecord[]>([]);
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => { void (async () => {
    const auth = await getAdminAuthSession();
    if (!auth) return;
    const response = await fetch("/api/admin/training?mode=pending", { headers: { Authorization: `Bearer ${auth.session.access_token}` } });
    const payload = await response.json() as { records?: PendingRecord[] };
    if (response.ok) setRecords(payload.records ?? []);
  })(); }, []);
  const displayOpen = open || (canPrompt && records.length > 0 && !dismissed);
  async function acknowledge(choice: "further_training" | "understood") {
    const record = records[0];
    if (!record) return;
    setSaving(true); setMessage("");
    try {
      const response = await authorisedRequest({ body: JSON.stringify({ choice, recordId: record.id }), method: "PATCH" });
      const result = await response.json() as { emailStatus?: string; error?: string };
      if (!response.ok) throw new Error(result.error ?? "Your response couldn't be saved.");
      setRecords((current) => current.slice(1));
      setMessage(result.emailStatus === "failed" ? "Your response is saved. The confirmation email could not be sent." : "Your response has been recorded.");
      window.dispatchEvent(new Event("zingara:training-updated"));
      if (records.length <= 1) setOpen(false);
    } catch (caught) { setMessage(caught instanceof Error ? caught.message : "Your response couldn't be saved."); }
    finally { setSaving(false); }
  }
  if (!records.length) return message ? <div className="fixed bottom-5 left-5 z-[170] rounded-lg border border-[#D8C36A]/30 bg-zinc-950 px-4 py-3 text-sm text-white">{message}</div> : null;
  const record = records[0];
  return <>{(!displayOpen || !canPrompt) && <button type="button" onClick={() => setOpen(true)} className="fixed bottom-5 left-5 z-[170] rounded-lg bg-[#D8C36A] px-4 py-3 text-sm font-bold text-black shadow-xl">Training confirmation pending</button>}{displayOpen && canPrompt && <div className="fixed inset-0 z-[200] grid place-items-center bg-black/80 p-3" role="dialog" aria-modal="true" aria-labelledby="training-confirm-heading"><section className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-[#D8C36A]/40 bg-zinc-950 p-5 shadow-2xl sm:p-6"><p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#D8C36A]">Training Confirmation</p><h2 id="training-confirm-heading" className="mt-2 text-2xl font-bold text-white">{record.title}</h2><p className="mt-2 text-sm text-zinc-400">{record.trainingDate} · {record.durationMinutes} minutes · Trainer: {record.trainerName}</p><p className="mt-5 whitespace-pre-wrap text-sm leading-6 text-zinc-200">{record.description}</p>{record.competencies.length > 0 && <ul className="mt-4 space-y-2 text-sm text-zinc-300">{record.competencies.map((item) => <li key={item} className="rounded-lg border border-white/10 px-3 py-2">{item}</li>)}</ul>}<p className="mt-5 rounded-lg border border-[#D8C36A]/20 bg-[#D8C36A]/5 p-3 text-sm leading-6 text-zinc-200">I confirm that I received training on the topics listed above, understand the procedures demonstrated and can perform these tasks independently.</p>{message && <p role="status" className="mt-4 text-sm text-amber-200">{message}</p>}<div className="mt-6 grid gap-2 sm:grid-cols-2"><button disabled={saving} onClick={() => void acknowledge("understood")} className="min-h-12 rounded-lg bg-[#D8C36A] px-4 text-sm font-bold text-black disabled:opacity-50">I Understand & Confirm</button><button disabled={saving} onClick={() => void acknowledge("further_training")} className="min-h-12 rounded-lg border border-white/20 px-4 text-sm font-semibold text-white disabled:opacity-50">I Need Further Training</button></div><button type="button" onClick={() => { setDismissed(true); setOpen(false); }} className="mt-3 min-h-11 w-full text-sm text-zinc-400 underline underline-offset-4">Remind me later</button></section></div>}</>;
}
