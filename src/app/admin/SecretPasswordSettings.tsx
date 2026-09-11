"use client";

import { useEffect, useMemo, useState } from "react";

import type { SecretPasswordSchedule, SecretPasswordScope } from "@/lib/secretPassword";
import {
  deleteSecretPasswordSchedule,
  getSecretPasswordSchedules,
  saveSecretPasswordSchedule,
} from "@/lib/supabase/secretPasswords";
import {
  normalizeShowLocation,
  showLocationOptions,
  type DemoShow,
  type DemoVenueSettings,
  type EntryLocationKey,
} from "@/lib/zingaraDemo";

type SecretExperience = DemoVenueSettings["operationalSettings"]["secretPasswordExperience"];

type Props = {
  configuration: SecretExperience;
  onConfigurationChange: (location: EntryLocationKey, updates: Partial<SecretExperience[EntryLocationKey]>) => void;
  shows: DemoShow[];
};

const suggestions = [
  "Velvet Moon",
  "The Golden Key",
  "Midnight Rose",
  "Crimson Lantern",
  "Royal Whisper",
  "Silver Masquerade",
];

function emptyForm(): Omit<SecretPasswordSchedule, "createdAt" | "updatedAt"> {
  return {
    enabled: true,
    endDate: "",
    endTime: null,
    id: "",
    phrase: "",
    scopeType: "date",
    showId: null,
    startDate: "",
    startTime: null,
    venueLocation: "cape-town",
  };
}

function scopeLabel(scope: SecretPasswordScope) {
  if (scope === "show") return "Specific performance";
  if (scope === "date") return "Date / day";
  return "Date range / weekly period";
}

export default function SecretPasswordSettings({ configuration, onConfigurationChange, shows }: Props) {
  const [schedules, setSchedules] = useState<SecretPasswordSchedule[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [status, setStatus] = useState<"error" | "idle" | "loading" | "saving">("loading");
  const [message, setMessage] = useState("");

  async function reload() {
    setStatus("loading");
    try {
      const payload = await getSecretPasswordSchedules();
      setSchedules(payload.schedules);
      setStatus("idle");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Schedules could not be loaded.");
    }
  }

  useEffect(() => {
    let active = true;
    void getSecretPasswordSchedules()
      .then((payload) => {
        if (!active) return;
        setSchedules(payload.schedules);
        setStatus("idle");
      })
      .catch((error) => {
        if (!active) return;
        setStatus("error");
        setMessage(
          error instanceof Error
            ? error.message
            : "Schedules could not be loaded.",
        );
      });
    return () => { active = false; };
  }, []);

  const venueShows = useMemo(
    () => shows.filter((show) => normalizeShowLocation(show.location ?? show.venueName) === form.venueLocation),
    [form.venueLocation, shows],
  );

  function edit(schedule: SecretPasswordSchedule) {
    setForm({ ...schedule });
    setMessage("");
  }

  async function submit() {
    if (status === "saving") return;
    setStatus("saving");
    setMessage("");
    try {
      const selectedShow = venueShows.find(
        (show) => (show.supabaseId ?? show.id) === form.showId,
      );
      const normalized = {
        ...form,
        endDate: form.scopeType === "show" ? selectedShow?.date ?? form.endDate : form.scopeType === "date" ? form.startDate : form.endDate,
        phrase: form.phrase.trim(),
        startDate: form.scopeType === "show" ? selectedShow?.date ?? form.startDate : form.startDate,
      };
      await saveSecretPasswordSchedule(normalized);
      setForm(emptyForm());
      setMessage("Schedule saved.");
      await reload();
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Schedule could not be saved.");
    }
  }

  async function disable(schedule: SecretPasswordSchedule) {
    try {
      await saveSecretPasswordSchedule({ ...schedule, enabled: false });
      await reload();
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Schedule could not be disabled.");
    }
  }

  async function remove(schedule: SecretPasswordSchedule) {
    try {
      await deleteSecretPasswordSchedule(schedule.id);
      await reload();
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Schedule could not be deleted.");
    }
  }

  return (
    <div className="mt-4 rounded-xl border border-[#D8C36A]/25 bg-[#D8C36A]/5 p-4">
      <p className="text-sm font-semibold uppercase tracking-[0.14em] text-[#F2D66C]">Secret Password Experience</p>
      <p className="mt-1 text-xs leading-5 text-zinc-400">A theatrical guest detail only. QR and ticket validation remain authoritative.</p>

      <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
        {showLocationOptions.map((location) => {
          const config = configuration[location.value];
          return (
            <fieldset key={location.value} className="rounded-lg border border-white/10 bg-black/40 p-4">
              <legend className="px-1 font-semibold text-white">{location.city}</legend>
              <label className="mt-2 flex items-center gap-2 text-sm text-zinc-300">
                <input type="checkbox" checked={config.enabled} onChange={(event) => onConfigurationChange(location.value, { enabled: event.target.checked })} />
                Enable Secret Password
              </label>
              <label className="mt-3 block text-sm text-zinc-400">Guest heading
                <input value={config.heading} onChange={(event) => onConfigurationChange(location.value, { heading: event.target.value })} className="mt-2 min-h-11 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-white" />
              </label>
              <label className="mt-3 block text-sm text-zinc-400">Guest instruction
                <input value={config.instruction} onChange={(event) => onConfigurationChange(location.value, { instruction: event.target.value })} className="mt-2 min-h-11 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-white" />
              </label>
              <label className="mt-3 flex items-start gap-2 text-sm text-zinc-300">
                <input type="checkbox" className="mt-1" checked={config.includeInCommunications} onChange={(event) => onConfigurationChange(location.value, { includeInCommunications: event.target.checked })} />
                Include in ticket and booking communications
              </label>
            </fieldset>
          );
        })}
      </div>

      <div className="mt-4 rounded-lg border border-white/10 bg-black/40 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><p className="font-semibold text-white">Password Schedule</p><p className="text-xs text-zinc-500">Performance overrides take precedence over non-overlapping date schedules.</p></div>
          <button type="button" onClick={() => setForm((current) => ({ ...current, phrase: suggestions[Math.floor(Math.random() * suggestions.length)] }))} className="rounded-lg border border-[#D8C36A]/40 px-3 py-2 text-xs font-semibold text-[#F2D66C]">Generate Suggestion</button>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          <label className="text-sm text-zinc-400">Venue<select value={form.venueLocation} onChange={(event) => setForm((current) => ({ ...current, showId: null, venueLocation: event.target.value as EntryLocationKey }))} className="mt-2 min-h-11 w-full rounded-lg border border-zinc-700 bg-black px-3 text-white"><option value="cape-town">Cape Town</option><option value="johannesburg">Johannesburg</option></select></label>
          <label className="text-sm text-zinc-400">Applies to<select value={form.scopeType} onChange={(event) => setForm((current) => ({ ...current, scopeType: event.target.value as SecretPasswordScope, showId: null }))} className="mt-2 min-h-11 w-full rounded-lg border border-zinc-700 bg-black px-3 text-white"><option value="show">Specific performance</option><option value="date">Date / day</option><option value="range">Date range / weekly period</option></select></label>
          <label className="text-sm text-zinc-400 xl:col-span-2">Password phrase<input value={form.phrase} maxLength={80} onChange={(event) => setForm((current) => ({ ...current, phrase: event.target.value }))} className="mt-2 min-h-11 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-white" /></label>
          {form.scopeType === "show" ? (
            <label className="text-sm text-zinc-400 md:col-span-2">Performance<select value={form.showId ?? ""} onChange={(event) => setForm((current) => ({ ...current, showId: event.target.value || null }))} className="mt-2 min-h-11 w-full rounded-lg border border-zinc-700 bg-black px-3 text-white"><option value="">Select performance</option>{venueShows.map((show) => <option key={show.id} value={show.supabaseId ?? show.id}>{show.date} · {show.time} · {show.label}</option>)}</select></label>
          ) : <>
            <label className="text-sm text-zinc-400">{form.scopeType === "date" ? "Date" : "Start date"}<input type="date" value={form.startDate} onChange={(event) => setForm((current) => ({ ...current, startDate: event.target.value }))} className="mt-2 min-h-11 w-full rounded-lg border border-zinc-700 bg-black px-3 text-white" /></label>
            {form.scopeType === "range" && <label className="text-sm text-zinc-400">End date<input type="date" value={form.endDate} onChange={(event) => setForm((current) => ({ ...current, endDate: event.target.value }))} className="mt-2 min-h-11 w-full rounded-lg border border-zinc-700 bg-black px-3 text-white" /></label>}
          </>}
          <label className="text-sm text-zinc-400">Optional start time<input type="time" value={form.startTime ?? ""} onChange={(event) => setForm((current) => ({ ...current, startTime: event.target.value || null }))} className="mt-2 min-h-11 w-full rounded-lg border border-zinc-700 bg-black px-3 text-white" /></label>
          <label className="text-sm text-zinc-400">Optional end time<input type="time" value={form.endTime ?? ""} onChange={(event) => setForm((current) => ({ ...current, endTime: event.target.value || null }))} className="mt-2 min-h-11 w-full rounded-lg border border-zinc-700 bg-black px-3 text-white" /></label>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3"><button type="button" disabled={status === "saving"} onClick={() => void submit()} className="rounded-lg bg-[#D8C36A] px-4 py-2 text-sm font-semibold text-black disabled:opacity-50">{status === "saving" ? "Saving..." : form.id ? "Save Changes" : "Add Password"}</button>{form.id && <button type="button" onClick={() => setForm(emptyForm())} className="rounded-lg border border-white/15 px-4 py-2 text-sm text-white">Cancel</button>}<span className={status === "error" ? "text-sm text-red-300" : "text-sm text-emerald-300"}>{message}</span></div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
        {schedules.map((schedule) => (
          <div key={schedule.id} className="rounded-lg border border-white/10 bg-black/40 p-4">
            <div className="flex items-start justify-between gap-3"><div><p className="text-xs uppercase tracking-[0.12em] text-zinc-500">{schedule.venueLocation === "cape-town" ? "Cape Town" : "Johannesburg"} · {scopeLabel(schedule.scopeType)}</p><p className="mt-1 font-semibold text-[#F2D66C]">{schedule.phrase}</p><p className="mt-1 text-sm text-zinc-400">{schedule.startDate}{schedule.endDate !== schedule.startDate ? ` – ${schedule.endDate}` : ""}{schedule.startTime ? ` · ${schedule.startTime}–${schedule.endTime}` : ""}</p></div><span className={`text-xs font-semibold uppercase ${schedule.enabled ? "text-emerald-300" : "text-zinc-500"}`}>{schedule.enabled ? "Scheduled" : "Disabled"}</span></div>
            <div className="mt-3 flex gap-2"><button type="button" onClick={() => edit(schedule)} className="text-sm text-[#F2D66C]">Edit</button>{schedule.enabled && <button type="button" onClick={() => void disable(schedule)} className="text-sm text-zinc-300">Disable</button>}<button type="button" onClick={() => void remove(schedule)} className="text-sm text-red-300">Delete future</button></div>
          </div>
        ))}
        {status !== "loading" && schedules.length === 0 && <p className="text-sm text-zinc-500">No Secret Password schedules configured.</p>}
      </div>
    </div>
  );
}
