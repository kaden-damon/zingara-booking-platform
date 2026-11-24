"use client";

import { useState } from "react";
import { fetchSupabaseApi } from "@/lib/supabase/apiClient";
import { bookingLimitZoneIds, getSeatingBookingLimit, type BookingLimitVenue } from "@/lib/seatingBookingLimits";
import { seatingZones, storeVenueSettings, type DemoVenueSettings } from "@/lib/zingaraDemo";

export function FloorBookingLimits({ venue, settings, onSaved }: {
  venue: BookingLimitVenue;
  settings: DemoVenueSettings;
  onSaved: (settings: DemoVenueSettings) => void;
}) {
  const [saving, setSaving] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  return (
    <details className="rounded-3xl border border-white/15 bg-black/25 p-4">
      <summary className="cursor-pointer text-sm font-semibold text-[#D8C36A]">Booking sizes · {venue === "cape-town" ? "Cape Town" : "Johannesburg"}</summary>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {bookingLimitZoneIds.map((zone) => {
          const limit = getSeatingBookingLimit(settings, venue, zone);
          return <form key={`${venue}:${zone}:${limit.minGuests}:${limit.maxGuests}`} className="flex flex-wrap items-end gap-2" onSubmit={async (event) => {
            event.preventDefault();
            if (saving) return;
            const data = new FormData(event.currentTarget);
            setSaving(zone); setMessage("");
            try {
              const result = await fetchSupabaseApi<{ settings: DemoVenueSettings }>("/api/admin/venue-settings", {
                method: "PUT", body: { bookingLimit: { venue, zone, limit: {
                  minGuests: Number(data.get("minimum")), maxGuests: Number(data.get("maximum")),
                } } },
              });
              storeVenueSettings(result.settings);
              onSaved(result.settings); setMessage("Booking sizes saved.");
            } catch { setMessage("Booking sizes could not be saved. Please try again."); }
            finally { setSaving(null); }
          }}>
            <p className="w-full text-sm text-zinc-300">{seatingZones.find((item) => item.id === zone)?.title}</p>
            {(["minimum", "maximum"] as const).map((field) => <label key={field} className="text-xs text-zinc-400">
              {field === "minimum" ? "Minimum" : "Maximum"}
              <input aria-label={`${zone} ${field} guests`} name={field} type="number" required min={1} max={zone === "royal-booths" ? 8 : 19}
                defaultValue={field === "minimum" ? limit.minGuests : limit.maxGuests} disabled={Boolean(saving)}
                className="mt-1 block min-h-11 w-20 rounded-full border border-white/15 bg-black/30 px-3 text-sm text-white outline-none focus:border-[#D8C36A] disabled:opacity-40" />
            </label>)}
            <button type="submit" disabled={Boolean(saving)} className="min-h-11 rounded-full border border-[#D8C36A]/40 px-4 text-xs font-semibold text-[#D8C36A] transition hover:bg-[#D8C36A]/15 active:bg-[#D8C36A]/25 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#D8C36A] disabled:opacity-40">{saving === zone ? "Saving..." : "Save"}</button>
          </form>;
        })}
      </div>
      <p className="mt-3 text-xs text-zinc-500">Public capacity stays at 415. Existing bookings and seating are unchanged.</p>
      <p role="status" className="mt-2 text-sm text-zinc-300">{message}</p>
    </details>
  );
}
