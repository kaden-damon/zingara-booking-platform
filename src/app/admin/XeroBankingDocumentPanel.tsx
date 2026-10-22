"use client";

import { useEffect, useRef, useState } from "react";
import { fetchSupabaseApi, fetchSupabaseBlob } from "@/lib/supabase/apiClient";
import { getSupabaseClient } from "@/lib/supabase/client";

type Payload = { canReplace: boolean; document: null | { activatedAt: string; fileSize: number; filename: string; uploadedAt: string; uploadedBy: string; version: number } };

export default function XeroBankingDocumentPanel() {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const input = useRef<HTMLInputElement>(null);
  async function load() { try { setPayload(await fetchSupabaseApi<Payload>("/api/admin/xero/banking-document", { cache: "no-store" })); } catch { setMessage("Banking confirmation details could not be loaded."); } }
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, []);
  async function view() { setBusy(true); setMessage(""); try { const blob = await fetchSupabaseBlob("/api/admin/xero/banking-document?download=true"); const url = URL.createObjectURL(blob); window.open(url, "_blank", "noopener,noreferrer"); window.setTimeout(() => URL.revokeObjectURL(url), 60_000); } catch (error) { setMessage(error instanceof Error ? error.message : "The PDF could not be opened."); } finally { setBusy(false); } }
  async function upload(file: File) { setBusy(true); setMessage(""); try { const session = await getSupabaseClient()?.auth.getSession(); const form = new FormData(); form.append("file", file); const response = await fetch("/api/admin/xero/banking-document", { body: form, headers: session?.data.session?.access_token ? { Authorization: `Bearer ${session.data.session.access_token}` } : {}, method: "POST" }); const result = await response.json(); if (!response.ok) throw new Error(result.error || "The PDF could not be approved."); setPayload(result); setMessage("The approved banking confirmation is now active for future quotation emails."); } catch (error) { setMessage(error instanceof Error ? error.message : "The PDF could not be approved."); } finally { setBusy(false); if (input.current) input.current.value = ""; } }
  return <section className="mt-5 rounded-xl border border-white/10 bg-black/25 p-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#D8C36A]">Confirmation of Banking Details</p>{payload?.document ? <><p className="mt-2 text-sm font-semibold text-white">{payload.document.filename}</p><p className="mt-1 text-xs text-zinc-500">Version {payload.document.version} · Approved {new Date(payload.document.activatedAt).toLocaleString("en-ZA")} · {payload.document.uploadedBy}</p></> : <p className="mt-2 text-sm text-amber-200">No approved PDF. Quotations cannot be emailed yet.</p>}</div><div className="flex flex-wrap gap-2">{payload?.document && <button className="min-h-11 rounded-full border border-[#D8C36A]/40 px-4 text-sm font-semibold text-[#F2D66C] disabled:opacity-40" disabled={busy} onClick={() => void view()} type="button">View PDF</button>}{payload?.canReplace && <><input accept="application/pdf,.pdf" className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); }} ref={input} type="file" /><button className="min-h-11 rounded-full bg-[#D8C36A] px-4 text-sm font-bold text-black disabled:opacity-40" disabled={busy} onClick={() => input.current?.click()} type="button">{payload.document ? "Replace PDF" : "Upload PDF"}</button></>}</div></div>{message && <p className="mt-3 text-sm text-zinc-300" role="status">{message}</p>}</section>;
}
