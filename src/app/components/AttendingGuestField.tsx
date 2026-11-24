"use client";

export default function AttendingGuestField({ value, onChange, disabled = false }: {
  value: string | undefined;
  onChange: (value: string | undefined) => void;
  disabled?: boolean;
}) {
  return <div className="space-y-3">
    <label className="flex min-h-11 items-center gap-3 text-sm text-zinc-200">
      <input type="checkbox" checked={value !== undefined} disabled={disabled}
        onChange={(event) => onChange(event.target.checked ? "" : undefined)}
        className="h-5 w-5 accent-[#D8C36A]" />
      Booking for someone else?
    </label>
    {value !== undefined && <label className="block text-sm text-zinc-300">
      <span className="mb-2 block">Attending guest name</span>
      <input required maxLength={120} value={value} disabled={disabled} autoComplete="off"
        data-booking-field="attendingGuestName" onChange={(event) => onChange(event.target.value)}
        className="min-h-11 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-white focus:border-[#D8C36A]" />
    </label>}
  </div>;
}
