"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchSupabaseApi } from "@/lib/supabase/apiClient";
import { isXeroMappingApprovalSupported, isXeroPaymentMappingCategory, xeroCategoriesForVenue, xeroMappingKey, type XeroMappingCategory, type XeroMappingVenue } from "@/lib/xero/mappings";

type Candidate = { connectionId: string; tenantId: string; tenantName: string; tenantType: string };
type Connection = { id: string; organisation: { candidates?: Candidate[]; selected?: Candidate } | null; status: string; sync_paused: boolean; tenant_id: string | null; tenant_name: string | null };
type ConnectionPayload = { configured: boolean; connections: Connection[]; liveSyncAuthorised: boolean };
type Mapping = { account_code: string | null; account_id: string | null; account_name: string | null; approved_at: string | null; category: XeroMappingCategory; tax_code: string | null; tax_name: string | null; tax_rate: number | null; venue: XeroMappingVenue; verified_at: string | null };
type MappingsPayload = { mappings: Mapping[] };
type Account = { accountId: string; bankAccountSuffix: string; code: string; eftAccountMatch: boolean; enablePaymentsToAccount: boolean; name: string; payfastIdentifierMatch: boolean; status: string; taxType: string; type: string };
type TaxRate = { canApplyToRevenue: boolean; displayRate: number; effectiveRate: number; name: string; status: string; taxType: string };
type DiscoveryPayload = {
  accounts: Account[];
  invoiceNumbering: string;
  organisation: { baseCurrency: string; defaultSalesTax: string; isDemoCompany: boolean; legalName: string; name: string; organisationStatus: string };
  paymentAccounts: Account[];
  taxRates: TaxRate[];
  trackingCategories: Array<{ id: string; name: string; status: string }>;
};
type SyncItem = { attempt_count: number; document_id: string | null; id: string; last_error: string | null; operation: string; status: string; updated_at: string };
type SyncPayload = { items: SyncItem[]; total: number };
type ReconciliationPayload = { items: Array<{ category: string; id: string; last_seen_at: string; provider_resource_type: string }>; total: number };
type Draft = { accountCode: string; taxCode: string };

const button = "min-h-10 rounded-full border border-[#D8C36A]/45 px-4 text-xs font-semibold text-[#F2D66C] transition hover:border-[#F2D66C] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F2D66C] disabled:cursor-not-allowed disabled:opacity-40";
const input = "min-h-10 w-full rounded-lg border border-white/15 bg-black/40 px-3 text-sm text-white outline-none focus:border-[#D8C36A]";
const VENUES: Array<{ label: string; value: XeroMappingVenue }> = [{ label: "All Venues", value: "all" }, { label: "Johannesburg", value: "johannesburg" }, { label: "Cape Town", value: "cape-town" }];
const CATEGORY_LABELS: Partial<Record<XeroMappingCategory, string>> = {
  eft_payment_account: "Manual EFT Bank",
  payfast_clearing_account: "PayFast Clearing",
};
function label(value: string) { return CATEGORY_LABELS[value as XeroMappingCategory] ?? value.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase()); }
function resolveAccount(accounts: Account[], value: string) {
  const search = value.trim().toLocaleLowerCase();
  return accounts.find((account) => account.code.toLocaleLowerCase() === search || account.name.toLocaleLowerCase() === search || `${account.code} — ${account.name}`.toLocaleLowerCase() === search);
}
function accountDetail(account: Account) {
  if (account.payfastIdentifierMatch) return `${account.code} — ${account.name} · PayFast 36090701`;
  if (account.eftAccountMatch) return `${account.code} — ${account.name} · FNB ending 8468`;
  return `${account.code} — ${account.name}`;
}

export default function XeroConnectionPanel({ onChanged }: { onChanged: () => Promise<void> }) {
  const [payload, setPayload] = useState<ConnectionPayload | null>(null);
  const [mappings, setMappings] = useState<MappingsPayload>({ mappings: [] });
  const [discovery, setDiscovery] = useState<DiscoveryPayload | null>(null);
  const [syncItems, setSyncItems] = useState<SyncPayload>({ items: [], total: 0 });
  const [reconciliation, setReconciliation] = useState<ReconciliationPayload>({ items: [], total: 0 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [selectedVenue, setSelectedVenue] = useState<XeroMappingVenue>("all");
  const current = payload?.connections[0] ?? null;

  const load = useCallback(async () => {
    const [connection, syncData, reconciliationData] = await Promise.all([
      fetchSupabaseApi<ConnectionPayload>("/api/admin/xero/connection", { cache: "no-store" }),
      fetchSupabaseApi<SyncPayload>("/api/admin/xero/sync", { cache: "no-store" }),
      fetchSupabaseApi<ReconciliationPayload>("/api/admin/xero/reconciliation", { cache: "no-store" }),
    ]);
    setPayload(connection); setSyncItems(syncData); setReconciliation(reconciliationData);
    const tenantId = connection.connections[0]?.tenant_id;
    if (!tenantId) { setMappings({ mappings: [] }); setDiscovery(null); return; }
    const [mappingData, discoveryData] = await Promise.all([
      fetchSupabaseApi<MappingsPayload>(`/api/admin/xero/mappings?tenantId=${encodeURIComponent(tenantId)}`, { cache: "no-store" }),
      fetchSupabaseApi<DiscoveryPayload>("/api/admin/xero/discovery", { cache: "no-store" }),
    ]);
    setMappings(mappingData); setDiscovery(discoveryData);
    setDrafts(Object.fromEntries(mappingData.mappings.map((mapping) => [xeroMappingKey(mapping.venue, mapping.category), { accountCode: mapping.account_code ?? "", taxCode: mapping.tax_code ?? "" }])));
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load().catch((caught) => setError(caught instanceof Error ? caught.message : "Xero settings could not be loaded.")), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function act(action: "disconnect" | "enable" | "pause" | "select", tenantId?: string) {
    if (!current) return;
    setBusy(true); setError("");
    try { await fetchSupabaseApi("/api/admin/xero/connection", { body: { action, connectionId: current.id, tenantId }, method: "POST" }); await load(); await onChanged(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Xero settings could not be updated."); }
    finally { setBusy(false); }
  }
  async function connect() {
    setBusy(true); setError("");
    try { const result = await fetchSupabaseApi<{ authorizationUrl: string }>("/api/admin/xero/oauth/start", { method: "POST" }); window.location.assign(result.authorizationUrl); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Xero connection could not start."); setBusy(false); }
  }
  async function saveMapping(category: XeroMappingCategory) {
    if (!current?.tenant_id || !discovery) return;
    const key = xeroMappingKey(selectedVenue, category);
    const draft = drafts[key] ?? { accountCode: "", taxCode: "" };
    const candidates = isXeroPaymentMappingCategory(category) ? discovery.paymentAccounts : discovery.accounts;
    const account = resolveAccount(candidates, draft.accountCode);
    if (!account) { setError("Choose an account from the verified Xero list."); return; }
    setBusy(true); setError("");
    try {
      await fetchSupabaseApi("/api/admin/xero/mappings", { body: { accountCode: account.code, accountId: account.accountId, category, taxCode: draft.taxCode, tenantId: current.tenant_id, venue: selectedVenue }, method: "PUT" });
      await load(); await onChanged();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "The mapping could not be saved."); }
    finally { setBusy(false); }
  }
  async function retry(outboxId: string) {
    setBusy(true); setError("");
    try { await fetchSupabaseApi("/api/admin/xero/sync", { body: { action: "retry", outboxId }, method: "POST" }); await load(); await onChanged(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "The sync item could not be retried."); }
    finally { setBusy(false); }
  }

  const candidates = current?.organisation?.candidates ?? [];
  const categories = xeroCategoriesForVenue(selectedVenue);
  const revenueTaxRates = useMemo(() => discovery?.taxRates.filter((taxRate) => taxRate.canApplyToRevenue) ?? [], [discovery]);
  const approvedCount = mappings.mappings.filter((mapping) => mapping.approved_at).length;

  return <section className="mt-5 rounded-xl border border-white/10 bg-black/25 p-4" aria-labelledby="xero-connection-title">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 id="xero-connection-title" className="font-semibold text-white">Xero connection</h3><p className="mt-1 text-sm text-zinc-400">Local quotes and invoice drafts work now. Accounts connection and sync remain paused.</p></div><div className="flex flex-wrap gap-2">
      {!current?.tenant_id && <button type="button" className={button} disabled={busy || !payload?.configured} onClick={() => void connect()}>{payload?.configured ? "Connect Xero" : "Awaiting connection details"}</button>}
      {current?.tenant_id && <button type="button" className={button} disabled={busy || current.sync_paused} onClick={() => void act("pause")}>Pause Sync</button>}
      {current?.tenant_id && <button type="button" className={button} disabled={busy || !payload?.liveSyncAuthorised} title={payload?.liveSyncAuthorised ? "Enable approved sync" : "Separate Production approval is required"} onClick={() => void act("enable")}>Enable Sync</button>}
      {current && <button type="button" className={button} disabled={busy} onClick={() => void act("disconnect")}>Disconnect</button>}
    </div></div>
    {error && <p role="alert" className="mt-3 rounded-lg border border-red-400/30 bg-red-950/25 p-3 text-sm text-red-100">{error}</p>}
    {candidates.length > 0 && !current?.tenant_id && <div className="mt-4"><p className="text-xs font-semibold uppercase text-zinc-400">Choose the approved organisation</p><div className="mt-2 flex flex-wrap gap-2">{candidates.map((candidate) => <button key={candidate.tenantId} type="button" className={button} disabled={busy} onClick={() => void act("select", candidate.tenantId)}>{candidate.tenantName}</button>)}</div></div>}

    {current?.tenant_id && discovery && <div className="mt-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><p className="text-sm font-semibold text-white">Accounts mappings</p><p className="mt-1 text-xs text-zinc-500">{discovery.organisation.name} · {discovery.organisation.baseCurrency} · Invoice numbers generated by Xero</p></div>
        <p className="text-xs text-zinc-400">{approvedCount} approved · Live sync paused</p>
      </div>
      <div className="mt-3 inline-flex max-w-full flex-wrap rounded-lg border border-white/10 p-1" role="tablist" aria-label="Mapping venue">
        {VENUES.map((venue) => <button key={venue.value} type="button" role="tab" aria-selected={selectedVenue === venue.value} className={`min-h-9 px-3 text-xs font-semibold transition ${selectedVenue === venue.value ? "bg-[#D8C36A] text-black" : "text-zinc-300 hover:text-white"}`} onClick={() => setSelectedVenue(venue.value)}>{venue.label}</button>)}
      </div>
      {selectedVenue === "all" && <p className="mt-3 text-xs text-zinc-500">Shared settings are limited to verified payment clearing. Revenue always uses its venue-specific mapping.</p>}
      <div className="mt-3 grid gap-2">{categories.map((category) => {
        const key = xeroMappingKey(selectedVenue, category);
        const saved = mappings.mappings.find((mapping) => mapping.venue === selectedVenue && mapping.category === category);
        const draft = drafts[key] ?? { accountCode: saved?.account_code ?? "", taxCode: saved?.tax_code ?? "" };
        const accountOptions = isXeroPaymentMappingCategory(category) ? discovery.paymentAccounts : discovery.accounts;
        const selectedAccount = resolveAccount(accountOptions, draft.accountCode);
        const accountSearch = draft.accountCode.trim().toLocaleLowerCase();
        const suggestions = selectedAccount || !accountSearch ? [] : accountOptions.filter((account) => `${account.code} ${account.name} ${account.bankAccountSuffix}`.toLocaleLowerCase().includes(accountSearch)).slice(0, 5);
        const taxRequired = !isXeroPaymentMappingCategory(category);
        const approvalSupported = isXeroMappingApprovalSupported(selectedVenue, category);
        return <div key={key} className="grid gap-2 rounded-lg border border-white/10 p-3 lg:grid-cols-[minmax(10rem,0.8fr)_minmax(14rem,1.5fr)_minmax(12rem,1fr)_auto] lg:items-center">
          <div><p className="text-sm text-white">{label(category)}</p><p className={`text-xs ${saved?.approved_at ? "text-emerald-300" : "text-amber-200"}`}>{saved?.approved_at ? "Approved and verified" : approvalSupported ? "Unapproved" : category === "deposits" ? "Part-payment policy · no sales mapping" : "Awaiting Accounts treatment"}</p></div>
          <div><input aria-label={`${label(category)} Xero account`} autoComplete="off" className={input} list={`xero-accounts-${key}`} placeholder="Search account code, name or last four" value={draft.accountCode} onChange={(event) => setDrafts((currentDrafts) => ({ ...currentDrafts, [key]: { ...draft, accountCode: event.target.value } }))} /><datalist id={`xero-accounts-${key}`}>{accountOptions.map((account) => <option key={account.accountId} value={account.code}>{accountDetail(account)}</option>)}</datalist><p className="mt-1 truncate text-xs text-zinc-500">{selectedAccount ? accountDetail(selectedAccount) : saved?.account_name ?? "Choose from verified Xero accounts"}</p>{suggestions.length > 0 && <div className="mt-1 flex flex-wrap gap-1" aria-label={`${label(category)} matching Xero accounts`}>{suggestions.map((account) => <button key={account.accountId} type="button" className="rounded border border-white/10 px-2 py-1 text-left text-xs text-zinc-300 hover:border-[#D8C36A]/60 hover:text-white" onClick={() => setDrafts((currentDrafts) => ({ ...currentDrafts, [key]: { ...draft, accountCode: account.code } }))}>{accountDetail(account)}</button>)}</div>}</div>
          {taxRequired ? <select aria-label={`${label(category)} tax treatment`} className={input} value={draft.taxCode} onChange={(event) => setDrafts((currentDrafts) => ({ ...currentDrafts, [key]: { ...draft, taxCode: event.target.value } }))}><option value="">Choose tax treatment</option>{revenueTaxRates.map((taxRate) => <option key={taxRate.taxType} value={taxRate.taxType}>{taxRate.name} · {taxRate.displayRate}%</option>)}</select> : <p className="text-xs text-zinc-500">No invoice tax treatment</p>}
          <button type="button" className={button} disabled={busy || !approvalSupported || !selectedAccount || (taxRequired && !draft.taxCode)} title={approvalSupported ? "Approve verified mapping" : "Accounts confirmation is required"} onClick={() => void saveMapping(category)}>Approve</button>
        </div>;
      })}</div>
      <p className="mt-3 text-xs text-zinc-500">Invoices use the full booking value. Verified deposits are allocated later as part-payments and never mapped as duplicate sales.</p>
      {discovery.trackingCategories.length > 0 && <p className="mt-3 text-xs text-zinc-500">Xero tracking categories were found but are not used by Zingara.</p>}
    </div>}

    {(syncItems.total > 0 || reconciliation.total > 0) && <div className="mt-4 grid gap-3 sm:grid-cols-2">
      <div className="rounded-lg border border-white/10 p-3"><p className="text-sm font-semibold text-white">Sync attention</p><p className="mt-1 text-xs text-zinc-500">{syncItems.total} item{syncItems.total === 1 ? "" : "s"} waiting or paused.</p><div className="mt-2 space-y-2">{syncItems.items.filter((item) => item.status === "blocked").map((item) => <div key={item.id} className="flex items-center justify-between gap-2 text-xs"><span className="min-w-0 truncate text-zinc-300">{item.last_error || "Sync needs review."}</span><button type="button" className={button} disabled={busy} onClick={() => void retry(item.id)}>Retry</button></div>)}</div></div>
      <div className="rounded-lg border border-white/10 p-3"><p className="text-sm font-semibold text-white">Reconciliation</p><p className="mt-1 text-xs text-zinc-500">{reconciliation.total} open difference{reconciliation.total === 1 ? "" : "s"}.</p>{reconciliation.items.slice(0, 5).map((item) => <p key={item.id} className="mt-2 text-xs text-zinc-300">{label(item.category)} · {label(item.provider_resource_type)}</p>)}</div>
    </div>}
  </section>;
}
