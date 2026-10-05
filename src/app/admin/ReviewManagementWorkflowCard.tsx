"use client";

import { useCallback, useEffect, useState } from "react";
import { getAdminAuthSession } from "@/lib/supabase/auth";

type Configuration = { dailyActivatedAt: string | null; dailyEnabled: boolean; dailyRecipientStaffIds: string[]; dailyTime: string; immediateActivatedAt: string | null; immediateEnabled: boolean; immediateRecipientStaffIds: string[]; nextDailyRunAt: string | null };
type Staff = { email: string; full_name: string; id: string };
type Payload = { configuration: Configuration; dailyExample: { html: string; subject: string }; dailyRecipients: { cc: string[]; to: string[] }; immediateExample: { html: string; subject: string }; immediateRecipients: { cc: string[]; to: string[] }; staff: Staff[] };

async function request(path: string, init?: RequestInit) {
  const auth = await getAdminAuthSession();
  if (!auth) throw new Error("Your Admin session has expired. Sign in again.");
  return fetch(path, { ...init, headers: { ...init?.headers, Authorization: `Bearer ${auth.session.access_token}`, "Content-Type": "application/json" } });
}

export function ReviewManagementWorkflowCard({ isSuperAdmin }: { isSuperAdmin: boolean }) {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [draft, setDraft] = useState<Configuration | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<"daily" | "immediate" | null>(null);
  const [width, setWidth] = useState<390 | 620>(620);

  const load = useCallback(async () => {
    if (!isSuperAdmin) return;
    setLoading(true); setError("");
    try {
      const response = await request("/api/admin/workflows/review-management");
      const next = await response.json();
      if (!response.ok) throw new Error(next.error ?? "Preview could not be loaded.");
      setPayload(next); setDraft(next.configuration); setMessage("Recipient preview refreshed. No email was sent.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Preview could not be loaded."); }
    finally { setLoading(false); }
  }, [isSuperAdmin]);

  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);
  if (!isSuperAdmin) return null;

  const toggleRecipient = (kind: "dailyRecipientStaffIds" | "immediateRecipientStaffIds", id: string) => setDraft((current) => current ? { ...current, [kind]: current[kind].includes(id) ? current[kind].filter((value) => value !== id) : [...current[kind], id] } : current);
  async function save() {
    if (!draft) return;
    setLoading(true); setError(""); setMessage("");
    try {
      const response = await request("/api/admin/workflows/review-management", { method: "PUT", body: JSON.stringify(draft) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Review notifications could not be saved.");
      setDraft(result.configuration); setMessage("Review notification settings saved prospectively. No historical alert was sent.");
      await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Review notifications could not be saved."); }
    finally { setLoading(false); }
  }

  const choices = (kind: "dailyRecipientStaffIds" | "immediateRecipientStaffIds") => <div className="mt-3 grid gap-2 sm:grid-cols-2">{payload?.staff.map((staff) => <label key={`${kind}-${staff.id}`} className="flex items-start gap-3 rounded-lg border border-white/10 p-3 text-sm"><input type="checkbox" checked={draft?.[kind].includes(staff.id) ?? false} onChange={() => toggleRecipient(kind, staff.id)} className="mt-1" /><span><strong className="block text-white">{staff.full_name}</strong><span className="text-zinc-500">{staff.email}</span></span></label>)}</div>;
  const recipientText = (value?: { cc: string[]; to: string[] }) => `To: ${value?.to.join(", ") || "None"} · CC: ${value?.cc.join(", ") || "None"}`;
  const example = preview === "immediate" ? payload?.immediateExample : payload?.dailyExample;

  return <article className="mt-5 rounded-lg border border-[#D8C36A]/30 bg-zinc-950/80 p-5">
    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#D8C36A]">Guest Reviews</p>
    <h3 className="mt-2 text-xl font-bold">Review management notifications</h3>
    <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">Alert management when a review arrives and send one daily summary of new reviews. Ratings of 1–2 are marked Needs attention.</p>
    <div className="mt-5 grid gap-5 xl:grid-cols-2">
      <section className="rounded-lg border border-white/10 p-4"><div className="flex items-center justify-between gap-3"><h4 className="font-semibold">New Review Alert</h4><button type="button" onClick={() => setDraft((current) => current ? { ...current, immediateEnabled: !current.immediateEnabled } : current)} className="rounded-full border border-white/15 px-4 py-2 text-xs font-bold">{draft?.immediateEnabled ? "Enabled" : "Disabled"}</button></div><p className="mt-2 text-sm text-zinc-500">Sent once after a genuine review is saved.</p>{choices("immediateRecipientStaffIds")}<p className="mt-3 text-xs text-zinc-500">{recipientText(payload?.immediateRecipients)}</p><button type="button" onClick={() => setPreview("immediate")} className="mt-3 rounded-full border border-white/15 px-4 py-2 text-xs font-bold">Preview Email</button></section>
      <section className="rounded-lg border border-white/10 p-4"><div className="flex items-center justify-between gap-3"><h4 className="font-semibold">Daily Review Summary</h4><button type="button" onClick={() => setDraft((current) => current ? { ...current, dailyEnabled: !current.dailyEnabled } : current)} className="rounded-full border border-white/15 px-4 py-2 text-xs font-bold">{draft?.dailyEnabled ? "Enabled" : "Disabled"}</button></div><label className="mt-3 block text-sm text-zinc-400">Time (SAST)<input type="time" value={draft?.dailyTime ?? "08:00"} onChange={(event) => setDraft((current) => current ? { ...current, dailyTime: event.target.value } : current)} className="mt-2 block rounded-lg border border-zinc-700 bg-black px-4 py-3 text-white" /></label>{choices("dailyRecipientStaffIds")}<p className="mt-3 text-xs text-zinc-500">{recipientText(payload?.dailyRecipients)}</p><button type="button" onClick={() => setPreview("daily")} className="mt-3 rounded-full border border-white/15 px-4 py-2 text-xs font-bold">Preview Email</button></section>
    </div>
    {error && <p className="mt-4 text-sm text-red-300">{error}</p>}{message && <p className="mt-4 text-sm text-emerald-300">{message}</p>}
    <div className="mt-5 flex gap-3"><button type="button" disabled={!draft || loading} onClick={() => void save()} className="rounded-full bg-[#D8C36A] px-5 py-3 text-xs font-bold text-black disabled:opacity-50">SAVE SETTINGS</button><button type="button" disabled={loading} onClick={() => void load()} className="rounded-full border border-white/15 px-5 py-3 text-xs font-bold">REFRESH PREVIEW</button></div>
    {preview && example && <div role="dialog" aria-modal="true" aria-label="Review notification email preview" className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4"><div className="flex max-h-[92vh] w-full max-w-4xl flex-col rounded-lg border border-[#D8C36A]/35 bg-zinc-950 p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs uppercase tracking-[0.14em] text-zinc-500">No-send preview</p><h4 className="font-bold">{example.subject}</h4></div><div className="flex gap-2"><button type="button" onClick={() => setWidth(620)} className="rounded-full border border-white/15 px-3 py-2 text-xs">Desktop</button><button type="button" onClick={() => setWidth(390)} className="rounded-full border border-white/15 px-3 py-2 text-xs">Mobile</button><button type="button" onClick={() => setPreview(null)} className="rounded-full bg-[#D8C36A] px-4 py-2 text-xs font-bold text-black">Close</button></div></div><div className="mt-4 overflow-auto bg-zinc-900 p-3"><iframe title="Review notification preview" srcDoc={example.html} style={{ height: "68vh", width }} className="mx-auto max-w-full border-0 bg-white" /></div></div></div>}
  </article>;
}
