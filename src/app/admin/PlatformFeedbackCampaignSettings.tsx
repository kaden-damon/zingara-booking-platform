"use client";

import { useCallback, useEffect, useState } from "react";
import { getAdminAuthSession } from "@/lib/supabase/auth";
import type { PlatformFeedbackEmailTemplate } from "@/lib/platformFeedback";

type StaffOption = { email: string; id: string; name: string };
type Payload = {
  campaign: {
    automationEnabled: boolean;
    id: string;
    status: string;
    template: PlatformFeedbackEmailTemplate;
    updatedAt: string;
  };
  defaultRecipientIds: string[];
  staffOptions: StaffOption[];
};

async function request(path: string, init?: RequestInit) {
  const auth = await getAdminAuthSession();
  if (!auth) throw new Error("Your Admin session has expired. Sign in again.");
  return fetch(path, {
    ...init,
    headers: {
      ...init?.headers,
      Authorization: `Bearer ${auth.session.access_token}`,
      "Content-Type": "application/json",
    },
  });
}

export default function PlatformFeedbackCampaignSettings() {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [draft, setDraft] = useState<PlatformFeedbackEmailTemplate | null>(null);
  const [editing, setEditing] = useState(false);
  const [choosingRecipients, setChoosingRecipients] = useState(false);
  const [recipientIds, setRecipientIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const response = await request("/api/admin/platform-feedback/config");
      const next = (await response.json()) as Payload & { error?: string };
      if (!response.ok) throw new Error(next.error ?? "The feedback email couldn't be loaded.");
      setPayload(next);
      setDraft(next.campaign.template);
      setRecipientIds((current) => current.length ? current : next.defaultRecipientIds);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The feedback email couldn't be loaded.");
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function save() {
    if (!draft) return;
    setBusy(true);
    setError("");
    setStatus("");
    try {
      const response = await request("/api/admin/platform-feedback/config", {
        body: JSON.stringify({ template: draft }),
        method: "PATCH",
      });
      const next = (await response.json()) as Payload & { error?: string };
      if (!response.ok) throw new Error(next.error ?? "The feedback email couldn't be saved.");
      setPayload(next);
      setDraft(next.campaign.template);
      setEditing(false);
      setStatus("Booking Experience Feedback email saved.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The feedback email couldn't be saved.");
    } finally {
      setBusy(false);
    }
  }

  async function sendTestEmail() {
    if (!recipientIds.length) {
      setError("Choose at least one staff recipient.");
      return;
    }
    setBusy(true);
    setError("");
    setStatus("");
    try {
      const response = await request("/api/admin/platform-feedback/approval", {
        body: JSON.stringify({
          idempotencyKey: crypto.randomUUID(),
          recipientStaffProfileIds: recipientIds,
        }),
        method: "POST",
      });
      const result = (await response.json()) as {
        error?: string;
        results?: Array<{ accepted: boolean; email: string; reason: string }>;
      };
      if (!response.ok) throw new Error(result.error ?? "The approval email couldn't be submitted.");
      const accepted = result.results?.filter((item) => item.accepted).length ?? 0;
      setStatus(`${accepted} customer-ready approval email${accepted === 1 ? "" : "s"} submitted to Microsoft 365. Inbox delivery is not implied.`);
      setChoosingRecipients(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The approval email couldn't be submitted.");
    } finally {
      setBusy(false);
    }
  }

  function update(field: keyof PlatformFeedbackEmailTemplate, value: string) {
    setDraft((current) => current ? { ...current, [field]: value } : current);
  }

  if (!payload || !draft) {
    return (
      <section className="rounded-lg border border-white/10 bg-black/35 p-4 sm:p-5">
        <p className="text-sm text-zinc-500">{error || "Loading Booking Experience Feedback…"}</p>
      </section>
    );
  }

  const canSendCampaign = payload.campaign.status === "approved" && payload.campaign.automationEnabled;

  return (
    <section className="rounded-lg border border-[#D8C36A]/30 bg-black/35 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#D8C36A]">Booking Experience Feedback</p>
          <p className="mt-2 text-sm leading-6 text-zinc-400">Edit → Save → Send Test → Approve → Send</p>
        </div>
        <span className="rounded-full border border-[#D8C36A]/30 px-3 py-1 text-xs font-semibold uppercase tracking-[0.1em] text-[#F2D66C]">
          {payload.campaign.status.replaceAll("_", " ")}
        </span>
      </div>

      <div className="mt-4 grid gap-3">
        <label className="text-sm text-zinc-400">Email subject
          <input value={draft.subject} disabled={!editing || busy} onChange={(event) => update("subject", event.target.value)} className="mt-2 w-full rounded-xl border border-zinc-700 bg-black px-4 py-3 text-white disabled:opacity-70" />
        </label>
        <label className="text-sm text-zinc-400">Email heading
          <input value={draft.heading} disabled={!editing || busy} onChange={(event) => update("heading", event.target.value)} className="mt-2 w-full rounded-xl border border-zinc-700 bg-black px-4 py-3 text-white disabled:opacity-70" />
        </label>
        <label className="text-sm text-zinc-400">Email body
          <textarea value={draft.body} disabled={!editing || busy} onChange={(event) => update("body", event.target.value)} rows={10} className="mt-2 w-full rounded-xl border border-zinc-700 bg-black px-4 py-3 text-white disabled:opacity-70" />
          <span className="mt-1 block text-xs text-zinc-500">Keep {"{{first_name}}"} and the secure {"{{feedback_url}}"} link.</span>
        </label>
        <label className="text-sm text-zinc-400">CTA button wording
          <input value={draft.cta} disabled={!editing || busy} onChange={(event) => update("cta", event.target.value)} className="mt-2 w-full rounded-xl border border-zinc-700 bg-black px-4 py-3 text-white disabled:opacity-70" />
        </label>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {editing ? (
          <>
            <button type="button" onClick={() => void save()} disabled={busy} className="min-h-11 rounded-full bg-[#D8C36A] px-5 text-xs font-bold uppercase tracking-[0.1em] text-black disabled:opacity-40">Save</button>
            <button type="button" onClick={() => { setDraft(payload.campaign.template); setEditing(false); }} disabled={busy} className="min-h-11 rounded-full border border-white/15 px-5 text-xs font-bold uppercase tracking-[0.1em] text-zinc-200">Cancel</button>
          </>
        ) : (
          <button type="button" onClick={() => setEditing(true)} className="min-h-11 rounded-full border border-[#D8C36A]/40 px-5 text-xs font-bold uppercase tracking-[0.1em] text-[#F2D66C]">Edit Email</button>
        )}
        <button type="button" onClick={() => setChoosingRecipients((current) => !current)} disabled={busy || editing} className="min-h-11 rounded-full border border-white/15 px-5 text-xs font-bold uppercase tracking-[0.1em] text-zinc-200 disabled:opacity-40">Send Test Email</button>
        <button type="button" disabled={!canSendCampaign || busy} title={!canSendCampaign ? "Campaign approval and the Staff Emails toggle are required." : undefined} className="min-h-11 rounded-full border border-white/10 px-5 text-xs font-bold uppercase tracking-[0.1em] text-zinc-500 disabled:cursor-not-allowed disabled:opacity-50">Send Campaign</button>
      </div>

      {choosingRecipients && (
        <div className="mt-4 rounded-lg border border-white/10 p-4">
          <p className="text-sm font-semibold text-white">Staff recipients</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {payload.staffOptions.map((staff) => (
              <label key={staff.id} className="flex min-w-0 items-start gap-2 text-sm text-zinc-300">
                <input type="checkbox" checked={recipientIds.includes(staff.id)} disabled={busy} onChange={() => setRecipientIds((current) => current.includes(staff.id) ? current.filter((id) => id !== staff.id) : [...current, staff.id])} className="mt-1 h-4 w-4 accent-[#D8C36A]" />
                <span className="min-w-0"><strong className="block truncate text-white">{staff.name}</strong><span className="block break-all text-xs text-zinc-500">{staff.email}</span></span>
              </label>
            ))}
          </div>
          <button type="button" onClick={() => void sendTestEmail()} disabled={busy || recipientIds.length === 0} className="mt-4 min-h-11 rounded-full bg-[#D8C36A] px-5 text-xs font-bold uppercase tracking-[0.1em] text-black disabled:opacity-40">
            {busy ? "Submitting…" : "Send Test Email"}
          </button>
        </div>
      )}

      {status && <p role="status" className="mt-4 rounded-lg border border-emerald-300/25 bg-emerald-950/20 p-3 text-sm text-emerald-200">{status}</p>}
      {error && <p role="alert" className="mt-4 rounded-lg border border-red-300/25 bg-red-950/20 p-3 text-sm text-red-200">{error}</p>}
    </section>
  );
}
