"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getAdminAuthSession } from "@/lib/supabase/auth";
import { trainingStatusLabels, type TrainingStatus } from "@/lib/staffTraining";

type StaffOption = { id: string; name: string };
type TrainingRecord = {
  acknowledgementAt: string | null;
  competencies: string[];
  createdAt: string;
  demonstratedIndependently: boolean;
  description: string;
  durationMinutes: number;
  id: string;
  staffId: string;
  staffName: string;
  startTime: string;
  status: TrainingStatus;
  title: string;
  trainerName: string;
  trainingDate: string;
};
type Payload = {
  canManage: boolean;
  pageSize: number;
  records: TrainingRecord[];
  staffOptions: StaffOption[];
  summary: Partial<Record<TrainingStatus, number>>;
  total: number;
};

async function request(path: string, init?: RequestInit) {
  const auth = await getAdminAuthSession();
  if (!auth) throw new Error("Your Admin session has expired. Sign in again.");
  return fetch(path, {
    ...init,
    headers: { ...init?.headers, Authorization: `Bearer ${auth.session.access_token}`, "Content-Type": "application/json" },
  });
}

const blankForm = {
  competencies: "",
  correctionReason: "",
  correctsRecordId: "",
  demonstratedIndependently: false,
  description: "",
  durationMinutes: "60",
  staffId: "",
  startTime: "09:00",
  title: "",
  trainingDate: new Date().toISOString().slice(0, 10),
};

export default function TrainingRegister() {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [searchDraft, setSearchDraft] = useState("");
  const [status, setStatus] = useState("");
  const [staffId, setStaffId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<TrainingRecord | null>(null);
  const [events, setEvents] = useState<Array<{ action: string; actorName: string; createdAt: string; id: string }>>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(blankForm);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: "10" });
      if (search) params.set("search", search);
      if (status) params.set("status", status);
      if (staffId) params.set("staffId", staffId);
      const response = await request(`/api/admin/training?${params}`);
      const next = await response.json() as Payload & { error?: string };
      if (!response.ok) throw new Error(next.error ?? "Training records couldn't be loaded.");
      setPayload(next);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Training records couldn't be loaded.");
    } finally {
      setLoading(false);
    }
  }, [page, search, staffId, status]);

  useEffect(() => {
    // The bounded remote list is the external state synchronized by this effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);
  useEffect(() => {
    const refresh = () => void load();
    window.addEventListener("zingara:training-updated", refresh);
    return () => window.removeEventListener("zingara:training-updated", refresh);
  }, [load]);

  const pageCount = Math.max(1, Math.ceil((payload?.total ?? 0) / (payload?.pageSize ?? 10)));
  const summaries = useMemo(() => Object.entries(trainingStatusLabels) as Array<[TrainingStatus, string]>, []);

  async function openRecord(record: TrainingRecord) {
    setSelected(record);
    setEvents([]);
    try {
      const response = await request(`/api/admin/training?id=${record.id}`);
      const details = await response.json() as { events?: typeof events; record?: TrainingRecord };
      if (response.ok) {
        setSelected(details.record ?? record);
        setEvents(details.events ?? []);
      }
    } catch { /* The list record remains usable. */ }
  }

  async function createRecord(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const response = await request("/api/admin/training", {
        body: JSON.stringify({
          ...form,
          competencies: form.competencies.split("\n").map((value) => value.trim()).filter(Boolean),
          durationMinutes: Number(form.durationMinutes),
        }),
        method: "POST",
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Training record couldn't be saved.");
      setForm(blankForm);
      setShowCreate(false);
      setPage(1);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Training record couldn't be saved.");
    } finally {
      setSaving(false);
    }
  }

  async function downloadExport() {
    const response = await request("/api/admin/training/export");
    if (!response.ok) { setError("Training register couldn't be exported."); return; }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `Zingara_Staff_Training_Register_${new Date().toISOString().slice(0, 10)}.xlsx`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="rounded-2xl border border-[#D8C36A]/25 bg-black/55 p-4 sm:p-5">
      <div className="flex flex-col gap-4 border-b border-white/10 pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#D8C36A]">Academy</p>
          <h2 className="mt-1 text-2xl font-bold text-white">Training Register</h2>
          <p className="mt-1 text-sm text-zinc-400">Recorded staff training, confirmation and demonstrated proficiency.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {payload?.canManage && <button type="button" onClick={() => void downloadExport()} className="min-h-11 rounded-lg border border-white/15 px-4 text-sm font-semibold text-white">Download Excel</button>}
          {payload?.canManage && <button type="button" onClick={() => setShowCreate(true)} className="min-h-11 rounded-lg bg-[#D8C36A] px-4 text-sm font-bold text-black">+ Record Training</button>}
        </div>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
        <div className="rounded-lg border border-white/10 bg-zinc-950 px-3 py-2"><p className="text-[0.65rem] font-semibold uppercase text-zinc-500">Total Training Sessions</p><p className="mt-1 text-xl font-bold text-white">{payload?.total ?? 0}</p></div>
        {summaries.map(([key, label]) => <div key={key} className="rounded-lg border border-white/10 bg-zinc-950 px-3 py-2"><p className="text-[0.65rem] font-semibold uppercase text-zinc-500">{label}</p><p className="mt-1 text-xl font-bold text-white">{payload?.summary[key] ?? 0}</p></div>)}
      </div>

      <form onSubmit={(event) => { event.preventDefault(); setPage(1); setSearch(searchDraft.trim()); }} className="mt-4 grid gap-2 lg:grid-cols-[1fr_220px_220px_auto]">
        <input value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)} placeholder="Search training topics" className="min-h-11 rounded-lg border border-white/15 bg-zinc-950 px-3 text-sm text-white" />
        <select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }} className="min-h-11 rounded-lg border border-white/15 bg-zinc-950 px-3 text-sm text-white"><option value="">All statuses</option>{summaries.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>
        <select value={staffId} onChange={(event) => { setStaffId(event.target.value); setPage(1); }} className="min-h-11 rounded-lg border border-white/15 bg-zinc-950 px-3 text-sm text-white"><option value="">All staff</option>{payload?.staffOptions.map((staff) => <option key={staff.id} value={staff.id}>{staff.name}</option>)}</select>
        <button className="min-h-11 rounded-lg border border-[#D8C36A]/45 px-4 text-sm font-semibold text-[#F2D66C]">Search</button>
      </form>

      {error && <p role="alert" className="mt-4 rounded-lg border border-red-400/30 bg-red-950/40 p-3 text-sm text-red-100">{error}</p>}
      <div className="mt-4 hidden overflow-x-auto sm:block">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="text-[0.68rem] uppercase tracking-[0.1em] text-zinc-500"><tr><th className="px-3 py-2">Staff</th><th className="px-3 py-2">Topic</th><th className="px-3 py-2">Date</th><th className="px-3 py-2">Duration</th><th className="px-3 py-2">Trainer</th><th className="px-3 py-2">Status</th></tr></thead>
          <tbody>{!loading && payload?.records.map((record) => <tr key={record.id} onClick={() => void openRecord(record)} className="cursor-pointer border-t border-white/10 text-zinc-300 hover:bg-white/5"><td className="px-3 py-3 font-semibold text-white">{record.staffName}</td><td className="px-3 py-3">{record.title}</td><td className="px-3 py-3">{record.trainingDate}</td><td className="px-3 py-3">{record.durationMinutes} min</td><td className="px-3 py-3">{record.trainerName}</td><td className="px-3 py-3"><span className="rounded-full border border-[#D8C36A]/30 px-2 py-1 text-xs text-[#F2D66C]">{trainingStatusLabels[record.status]}</span></td></tr>)}</tbody>
        </table>
      </div>
      <div className="mt-4 space-y-2 sm:hidden">
        {payload?.records.map((record) => <button key={record.id} type="button" onClick={() => void openRecord(record)} className="w-full rounded-lg border border-white/10 bg-zinc-950 p-3 text-left"><div className="flex items-start justify-between gap-3"><div><p className="font-semibold text-white">{record.title}</p><p className="mt-1 text-xs text-zinc-400">{record.staffName} · {record.trainingDate}</p></div><span className="shrink-0 rounded-full border border-[#D8C36A]/30 px-2 py-1 text-[0.65rem] text-[#F2D66C]">{record.durationMinutes} min</span></div><p className="mt-2 text-xs text-zinc-500">{record.trainerName} · {trainingStatusLabels[record.status]}</p></button>)}
      </div>
      {loading && <p className="py-8 text-center text-sm text-zinc-400">Loading training records...</p>}
      {!loading && payload?.records.length === 0 && <p className="py-8 text-center text-sm text-zinc-400">No training records match these filters.</p>}
      <div className="mt-4 flex items-center justify-between gap-3 text-sm"><button disabled={page <= 1} onClick={() => setPage((value) => value - 1)} className="min-h-11 rounded-lg border border-white/15 px-4 disabled:opacity-35">Previous</button><span>Page {page} of {pageCount} · {payload?.total ?? 0} records</span><button disabled={page >= pageCount} onClick={() => setPage((value) => value + 1)} className="min-h-11 rounded-lg border border-white/15 px-4 disabled:opacity-35">Next</button></div>

      {showCreate && <div className="fixed inset-0 z-[190] grid place-items-center bg-black/80 p-3" role="dialog" aria-modal="true" aria-labelledby="record-training-heading"><form onSubmit={createRecord} className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-[#D8C36A]/35 bg-zinc-950 p-5"><div className="flex items-start justify-between"><div><p className="text-xs font-semibold uppercase text-[#D8C36A]">Training Register</p><h2 id="record-training-heading" className="mt-1 text-2xl font-bold">{form.correctsRecordId ? "Record Correction" : "Record Training"}</h2></div><button type="button" onClick={() => setShowCreate(false)} aria-label="Close" className="rounded-lg border border-white/15 px-3 py-2">Close</button></div><div className="mt-5 grid gap-4 sm:grid-cols-2">
        <label className="text-sm text-zinc-300">Staff member<select required value={form.staffId} onChange={(e) => setForm({...form, staffId:e.target.value})} className="mt-1 min-h-11 w-full rounded-lg border border-white/15 bg-black px-3"><option value="">Select staff</option>{payload?.staffOptions.map((staff) => <option key={staff.id} value={staff.id}>{staff.name}</option>)}</select></label>
        <label className="text-sm text-zinc-300">Training topic<input required value={form.title} onChange={(e) => setForm({...form,title:e.target.value})} className="mt-1 min-h-11 w-full rounded-lg border border-white/15 bg-black px-3" /></label>
        <label className="text-sm text-zinc-300">Date<input type="date" required value={form.trainingDate} onChange={(e) => setForm({...form,trainingDate:e.target.value})} className="mt-1 min-h-11 w-full rounded-lg border border-white/15 bg-black px-3" /></label>
        <label className="text-sm text-zinc-300">Start time<input type="time" required value={form.startTime} onChange={(e) => setForm({...form,startTime:e.target.value})} className="mt-1 min-h-11 w-full rounded-lg border border-white/15 bg-black px-3" /></label>
        <label className="text-sm text-zinc-300">Duration (minutes)<input type="number" min="1" max="1440" required value={form.durationMinutes} onChange={(e) => setForm({...form,durationMinutes:e.target.value})} className="mt-1 min-h-11 w-full rounded-lg border border-white/15 bg-black px-3" /></label>
        <label className="flex items-center gap-3 self-end rounded-lg border border-white/10 p-3 text-sm"><input type="checkbox" checked={form.demonstratedIndependently} onChange={(e) => setForm({...form,demonstratedIndependently:e.target.checked})} /> Demonstrated independently</label>
        <label className="sm:col-span-2 text-sm text-zinc-300">Description<textarea required rows={4} value={form.description} onChange={(e) => setForm({...form,description:e.target.value})} className="mt-1 w-full rounded-lg border border-white/15 bg-black p-3" /></label>
        <label className="sm:col-span-2 text-sm text-zinc-300">Competencies (one per line)<textarea rows={4} value={form.competencies} onChange={(e) => setForm({...form,competencies:e.target.value})} className="mt-1 w-full rounded-lg border border-white/15 bg-black p-3" /></label>
        {form.correctsRecordId && <label className="sm:col-span-2 text-sm text-zinc-300">Reason for correction<textarea required rows={3} value={form.correctionReason} onChange={(e) => setForm({...form,correctionReason:e.target.value})} className="mt-1 w-full rounded-lg border border-white/15 bg-black p-3" /></label>}
      </div><div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setShowCreate(false)} className="min-h-11 rounded-lg border border-white/15 px-4">Cancel</button><button disabled={saving} className="min-h-11 rounded-lg bg-[#D8C36A] px-5 font-bold text-black disabled:opacity-50">{saving ? "Saving..." : "Save Training Record"}</button></div></form></div>}

      {selected && <div className="fixed inset-0 z-[190] grid place-items-center bg-black/80 p-3" role="dialog" aria-modal="true" aria-labelledby="training-details-heading"><section className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-[#D8C36A]/35 bg-zinc-950 p-5"><div className="flex justify-between gap-3"><div><p className="text-xs font-semibold uppercase text-[#D8C36A]">{trainingStatusLabels[selected.status]}</p><h2 id="training-details-heading" className="mt-1 text-2xl font-bold">{selected.title}</h2></div><button onClick={() => setSelected(null)} className="h-fit rounded-lg border border-white/15 px-3 py-2">Close</button></div><dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2"><div><dt className="text-zinc-500">Staff</dt><dd>{selected.staffName}</dd></div><div><dt className="text-zinc-500">Trainer</dt><dd>{selected.trainerName}</dd></div><div><dt className="text-zinc-500">Date & time</dt><dd>{selected.trainingDate} · {selected.startTime}</dd></div><div><dt className="text-zinc-500">Duration</dt><dd>{selected.durationMinutes} minutes</dd></div></dl><p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-zinc-300">{selected.description}</p>{selected.competencies.length > 0 && <div className="mt-4 flex flex-wrap gap-2">{selected.competencies.map((item) => <span key={item} className="rounded-full border border-white/10 px-3 py-1 text-xs">{item}</span>)}</div>}<h3 className="mt-6 text-sm font-bold uppercase text-zinc-400">Audit history</h3><div className="mt-2 space-y-2">{events.map((event) => <div key={event.id} className="rounded-lg border border-white/10 p-3 text-sm"><p className="font-semibold text-white">{event.action.replaceAll("_", " ")}</p><p className="mt-1 text-zinc-500">{event.actorName} · {new Date(event.createdAt).toLocaleString("en-ZA")}</p></div>)}</div>{payload?.canManage && <button type="button" onClick={() => { setForm({ competencies: selected.competencies.join("\n"), correctionReason: "", correctsRecordId: selected.id, demonstratedIndependently: selected.demonstratedIndependently, description: selected.description, durationMinutes: String(selected.durationMinutes), staffId: selected.staffId, startTime: selected.startTime.slice(0,5), title: selected.title, trainingDate: selected.trainingDate }); setSelected(null); setShowCreate(true); }} className="mt-5 min-h-11 rounded-lg border border-[#D8C36A]/40 px-4 text-sm font-semibold text-[#F2D66C]">Record an audited correction</button>}</section></div>}
    </section>
  );
}
