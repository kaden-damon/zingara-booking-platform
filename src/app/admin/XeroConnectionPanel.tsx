"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchSupabaseApi } from "@/lib/supabase/apiClient";

type Candidate = { connectionId: string; tenantId: string; tenantName: string; tenantType: string };
type Connection = { id: string; organisation: { candidates?: Candidate[]; selected?: Candidate } | null; status: string; sync_paused: boolean; tenant_id: string | null; tenant_name: string | null };
type ConnectionPayload = { configured: boolean; connections: Connection[]; liveSyncAuthorised: boolean };
type Mapping = { account_code: string | null; approved_at: string | null; category: string; tax_code: string | null };
type MappingsPayload = { mappings: Mapping[]; required: string[] };

const button = "min-h-10 rounded-full border border-[#D8C36A]/45 px-4 text-xs font-semibold text-[#F2D66C] transition hover:border-[#F2D66C] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F2D66C] disabled:cursor-not-allowed disabled:opacity-40";
const input = "min-h-10 w-full rounded-lg border border-white/15 bg-black/40 px-3 text-sm text-white outline-none focus:border-[#D8C36A]";
function label(value: string) { return value.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase()); }

export default function XeroConnectionPanel({ onChanged }: { onChanged: () => Promise<void> }) {
  const [payload, setPayload] = useState<ConnectionPayload | null>(null); const [mappings, setMappings] = useState<MappingsPayload | null>(null);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [drafts, setDrafts] = useState<Record<string, { accountCode: string; taxCode: string }>>({});
  const current = payload?.connections[0] ?? null;
  const load = useCallback(async () => {
    const connection = await fetchSupabaseApi<ConnectionPayload>("/api/admin/xero/connection", { cache: "no-store" }); setPayload(connection);
    const tenantId = connection.connections[0]?.tenant_id;
    const mappingData = await fetchSupabaseApi<MappingsPayload>(`/api/admin/xero/mappings${tenantId ? `?tenantId=${encodeURIComponent(tenantId)}` : ""}`, { cache: "no-store" }); setMappings(mappingData);
    setDrafts(Object.fromEntries(mappingData.mappings.map((mapping) => [mapping.category, { accountCode: mapping.account_code ?? "", taxCode: mapping.tax_code ?? "" }])));
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => void load().catch((caught) => setError(caught instanceof Error ? caught.message : "Xero settings could not be loaded.")), 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  async function act(action: "disconnect" | "enable" | "pause" | "select", tenantId?: string) { if (!current) return; setBusy(true); setError(""); try { await fetchSupabaseApi("/api/admin/xero/connection", { body: { action, connectionId: current.id, tenantId }, method: "POST" }); await load(); await onChanged(); } catch (caught) { setError(caught instanceof Error ? caught.message : "Xero settings could not be updated."); } finally { setBusy(false); } }
  async function connect() { setBusy(true); setError(""); try { const result = await fetchSupabaseApi<{ authorizationUrl: string }>("/api/admin/xero/oauth/start", { method: "POST" }); window.location.assign(result.authorizationUrl); } catch (caught) { setError(caught instanceof Error ? caught.message : "Xero connection could not start."); setBusy(false); } }
  async function saveMapping(category: string) { if (!current?.tenant_id) return; const draft = drafts[category] ?? { accountCode: "", taxCode: "" }; setBusy(true); setError(""); try { await fetchSupabaseApi("/api/admin/xero/mappings", { body: { accountCode: draft.accountCode, category, taxCode: draft.taxCode, tenantId: current.tenant_id }, method: "PUT" }); await load(); await onChanged(); } catch (caught) { setError(caught instanceof Error ? caught.message : "The mapping could not be saved."); } finally { setBusy(false); } }
  const candidates = current?.organisation?.candidates ?? [];
  return <section className="mt-5 rounded-xl border border-white/10 bg-black/25 p-4" aria-labelledby="xero-connection-title">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 id="xero-connection-title" className="font-semibold text-white">Xero connection</h3><p className="mt-1 text-sm text-zinc-400">Local quotes and invoice drafts work now. Accounts connection and sync remain paused.</p></div><div className="flex flex-wrap gap-2">
      {!current?.tenant_id && <button type="button" className={button} disabled={busy || !payload?.configured} onClick={() => void connect()}>{payload?.configured ? "Connect Xero" : "Awaiting connection details"}</button>}
      {current?.tenant_id && <button type="button" className={button} disabled={busy || current.sync_paused} onClick={() => void act("pause")}>Pause Sync</button>}
      {current?.tenant_id && <button type="button" className={button} disabled={busy || !payload?.liveSyncAuthorised} title={payload?.liveSyncAuthorised ? "Enable approved sync" : "Separate Production approval is required"} onClick={() => void act("enable")}>Enable Sync</button>}
      {current && <button type="button" className={button} disabled={busy} onClick={() => void act("disconnect")}>Disconnect</button>}
    </div></div>
    {error && <p role="alert" className="mt-3 rounded-lg border border-red-400/30 bg-red-950/25 p-3 text-sm text-red-100">{error}</p>}
    {candidates.length > 0 && !current?.tenant_id && <div className="mt-4"><p className="text-xs font-semibold uppercase text-zinc-400">Choose the approved organisation</p><div className="mt-2 flex flex-wrap gap-2">{candidates.map((candidate) => <button key={candidate.tenantId} type="button" className={button} disabled={busy} onClick={() => void act("select", candidate.tenantId)}>{candidate.tenantName}</button>)}</div></div>}
    {current?.tenant_id && <div className="mt-4"><p className="text-sm font-semibold text-white">Accounts mappings</p><p className="mt-1 text-xs text-zinc-500">Every category must be approved before sync can be enabled.</p><div className="mt-3 grid gap-2">{(mappings?.required ?? []).map((category) => { const saved = mappings?.mappings.find((mapping) => mapping.category === category); const draft = drafts[category] ?? { accountCode: "", taxCode: "" }; return <div key={category} className="grid gap-2 rounded-lg border border-white/10 p-3 sm:grid-cols-[minmax(9rem,1fr)_1fr_1fr_auto] sm:items-center"><p className="text-sm text-white">{label(category)}{saved?.approved_at && <span className="block text-xs text-emerald-300">Approved</span>}</p><input aria-label={`${label(category)} account code`} className={input} placeholder="Account code" value={draft.accountCode} onChange={(event) => setDrafts((currentDrafts) => ({ ...currentDrafts, [category]: { ...draft, accountCode: event.target.value } }))} /><input aria-label={`${label(category)} VAT code`} className={input} placeholder="VAT code" value={draft.taxCode} onChange={(event) => setDrafts((currentDrafts) => ({ ...currentDrafts, [category]: { ...draft, taxCode: event.target.value } }))} /><button type="button" className={button} disabled={busy || !draft.accountCode.trim() || !draft.taxCode.trim()} onClick={() => void saveMapping(category)}>Approve</button></div>; })}</div></div>}
  </section>;
}
