"use client";

import { useState } from "react";
import { fetchSupabaseApi } from "@/lib/supabase/apiClient";
import { bookingLimitZoneIds, getSeatingBookingLimit, validateSeatingBookingLimit, type BookingLimitVenue, type BookingLimitZone } from "@/lib/seatingBookingLimits";
import { seatingZones, storeVenueSettings, type DemoVenueSettings } from "@/lib/zingaraDemo";

export function FloorBookingLimits({ venue, settings, onSaved }: {
  venue: BookingLimitVenue;
  settings: DemoVenueSettings;
  onSaved: (settings: DemoVenueSettings) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<Partial<Record<BookingLimitZone, { minGuests?: string; maxGuests?: string }>>>({});
  const [notice, setNotice] = useState<{ error: boolean; text: string } | null>(null);
  const limits = bookingLimitZoneIds.map((zone) => {
    const saved = getSeatingBookingLimit(settings, venue, zone);
    const limit = {
      minGuests: Number(draft[zone]?.minGuests ?? saved.minGuests),
      maxGuests: Number(draft[zone]?.maxGuests ?? saved.maxGuests),
    };
    return { zone, saved, limit };
  });
  const changed = limits.filter(({ saved, limit }) => saved.minGuests !== limit.minGuests || saved.maxGuests !== limit.maxGuests);
  return (
    <details className="mt-4 border-t border-white/10 pt-4">
      <summary className="cursor-pointer text-sm font-semibold text-[#D8C36A]">Seating Limits</summary>
      <p className="mt-3 text-xs text-zinc-400">{venue === "cape-town" ? "Cape Town" : "Johannesburg"} · Venue-wide · Standard bookings</p>
      <form className="mt-3" onSubmit={async (event) => {
        event.preventDefault();
        if (saving || changed.length === 0) return;
        if (changed.some(({ zone, limit }) => !validateSeatingBookingLimit(zone, limit))) {
          setNotice({ error: true, text: "Check the minimum and maximum for each zone." });
          return;
        }
        setSaving(true); setNotice(null);
        let savedCount = 0;
        try {
          // Reuse the existing audited save; untouched zones make no requests.
          for (const { zone, limit } of changed) {
              const result = await fetchSupabaseApi<{ settings: DemoVenueSettings }>("/api/admin/venue-settings", {
                method: "PUT", body: { bookingLimit: { venue, zone, limit } },
              });
              storeVenueSettings(result.settings);
              onSaved(result.settings);
              savedCount++;
          }
          setDraft({});
          setNotice({ error: false, text: "Seating limits saved." });
        } catch {
          setNotice({ error: true, text: savedCount ? "Some changes were saved. Retry the remaining changes." : "Seating limits could not be saved. Please retry." });
        } finally { setSaving(false); }
      }}>
        <div className="grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4">
          {limits.map(({ zone, saved }) => <div key={zone} className="min-w-0 rounded-2xl border border-white/10 bg-black/20 p-2 sm:p-3">
            <h3 className="min-h-10 text-sm font-medium leading-5 sm:min-h-5">{seatingZones.find((item) => item.id === zone)?.title}</h3>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {(["minGuests", "maxGuests"] as const).map((field) => <label key={field} className="min-w-0 text-xs text-zinc-400">
                {field === "minGuests" ? "Min" : "Max"}
                <input aria-label={`${zone} ${field === "minGuests" ? "minimum" : "maximum"} guests`} type="number" required min={1} max={zone === "royal-booths" ? 8 : 19}
                  value={draft[zone]?.[field] ?? String(saved[field])} disabled={saving}
                  onChange={(event) => {
                    const value = event.target.value;
                    setDraft((current) => ({ ...current, [zone]: { ...current[zone], [field]: value } }));
                    setNotice(null);
                  }}
                  className="mt-1 min-h-11 w-full min-w-0 rounded-full border border-white/15 bg-black/30 px-2 text-sm text-white outline-none [appearance:textfield] focus:border-[#D8C36A] disabled:opacity-40 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" />
              </label>)}
            </div>
          </div>)}
        </div>
        <div className="mt-3 flex justify-end">
          <button type="submit" disabled={saving || changed.length === 0} className="min-h-11 w-40 rounded-full bg-[#D8C36A] px-5 text-sm font-semibold text-black transition hover:bg-[#F2D66C] active:bg-[#C5AC48] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#D8C36A] disabled:cursor-not-allowed disabled:opacity-40">{saving ? "Saving..." : "Save Changes"}</button>
        </div>
        {notice && <p role={notice.error ? "alert" : "status"} className={`mt-2 text-sm ${notice.error ? "text-red-200" : "text-zinc-300"}`}>{notice.text}</p>}
      </form>
    </details>
  );
}
