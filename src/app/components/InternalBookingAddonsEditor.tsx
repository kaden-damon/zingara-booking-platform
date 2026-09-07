"use client";

import type { BookingAddon } from "../../lib/zingaraDemo";

function money(value: number) {
  return new Intl.NumberFormat("en-ZA", {
    currency: "ZAR",
    style: "currency",
  }).format(value);
}

export default function InternalBookingAddonsEditor({
  canCustomPrice,
  catalogue,
  disabled = false,
  heading,
  onChange,
  value,
}: {
  canCustomPrice: boolean;
  catalogue: BookingAddon[];
  disabled?: boolean;
  heading: string;
  onChange: (addons: BookingAddon[]) => void;
  value: BookingAddon[];
}) {
  function updateQuantity(id: string, quantityValue: string) {
    const quantity = Math.max(1, Math.trunc(Number(quantityValue) || 1));
    onChange(
      value.map((item) =>
        item.id === id
          ? {
              ...item,
              price: quantity * Number(item.unitPrice ?? item.price),
              quantity,
            }
          : item,
      ),
    );
  }

  function addCustomItem() {
    onChange([
      ...value,
      {
        id: `custom-${crypto.randomUUID()}`,
        kind: "custom",
        name: "",
        price: 0,
        pricingType: "operational",
        quantity: 1,
        unitPrice: 0,
      },
    ]);
  }

  return (
    <section className="rounded-2xl border border-[#D8C36A]/30 bg-black/35 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold uppercase text-[#F2D66C]">{heading}</h3>
          <p className="mt-1 text-xs text-zinc-400">Operational items show R0 until an authoritative price is configured.</p>
        </div>
        {canCustomPrice && (
          <button
            type="button"
            disabled={disabled}
            onClick={addCustomItem}
            className="min-h-10 rounded-full border border-[#D8C36A]/45 px-4 py-2 text-xs font-semibold uppercase text-[#F2D66C] disabled:opacity-40"
          >
            + Add Custom Item
          </button>
        )}
      </div>

      <div className="mt-4 space-y-2">
        {catalogue.map((catalogueItem) => {
          const selected = value.find((item) => item.id === catalogueItem.id);
          return (
            <div key={catalogueItem.id} className="grid grid-cols-[minmax(0,1fr)_5rem] items-center gap-3 rounded-xl border border-white/10 bg-black/30 p-3">
              <label className="flex min-w-0 items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={Boolean(selected)}
                  disabled={disabled}
                  onChange={(event) =>
                    onChange(
                      event.target.checked
                        ? [...value, { ...catalogueItem }]
                        : value.filter((item) => item.id !== catalogueItem.id),
                    )
                  }
                  className="h-5 w-5 accent-[#D8C36A]"
                />
                <span className="min-w-0">
                  <span className="block font-medium text-zinc-100">{catalogueItem.name}</span>
                  <span className="block text-xs text-zinc-500">
                    {(catalogueItem.unitPrice ?? catalogueItem.price) > 0
                      ? `${money(catalogueItem.unitPrice ?? catalogueItem.price)} each`
                      : "Operational / no price"}
                  </span>
                </span>
              </label>
              <input
                aria-label={`${catalogueItem.name} quantity`}
                type="number"
                min={1}
                step={1}
                value={selected?.quantity ?? 1}
                disabled={disabled || !selected}
                onChange={(event) => updateQuantity(catalogueItem.id, event.target.value)}
                className="w-full rounded-lg border border-white/15 bg-zinc-950 px-2 py-2 text-center text-sm disabled:opacity-35"
              />
            </div>
          );
        })}
      </div>

      {value.filter((item) => item.kind === "custom").map((item) => (
        <div key={item.id} className="mt-3 rounded-xl border border-[#D8C36A]/25 bg-zinc-950/80 p-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-semibold uppercase text-zinc-400">
              Item Name *
              <input value={item.name} disabled={disabled || !canCustomPrice} maxLength={120} onChange={(event) => onChange(value.map((candidate) => candidate.id === item.id ? { ...candidate, name: event.target.value } : candidate))} className="mt-1 w-full rounded-lg border border-white/15 bg-black px-3 py-2 text-sm font-normal normal-case text-white disabled:opacity-45" />
            </label>
            <label className="text-xs font-semibold uppercase text-zinc-400">
              Description / Notes
              <input value={item.description ?? ""} disabled={disabled || !canCustomPrice} maxLength={500} onChange={(event) => onChange(value.map((candidate) => candidate.id === item.id ? { ...candidate, description: event.target.value } : candidate))} className="mt-1 w-full rounded-lg border border-white/15 bg-black px-3 py-2 text-sm font-normal normal-case text-white disabled:opacity-45" />
            </label>
            <label className="text-xs font-semibold uppercase text-zinc-400">
              Quantity *
              <input type="number" min={1} step={1} value={item.quantity ?? 1} disabled={disabled || !canCustomPrice} onChange={(event) => updateQuantity(item.id, event.target.value)} className="mt-1 w-full rounded-lg border border-white/15 bg-black px-3 py-2 text-sm font-normal text-white disabled:opacity-45" />
            </label>
            <label className="text-xs font-semibold uppercase text-zinc-400">
              Unit Price *
              <input type="number" min={0} step="0.01" inputMode="decimal" value={item.unitPrice ?? 0} disabled={disabled || !canCustomPrice} onChange={(event) => {
                const unitPrice = Math.max(0, Number(event.target.value) || 0);
                onChange(value.map((candidate) => candidate.id === item.id ? { ...candidate, price: unitPrice * (candidate.quantity ?? 1), pricingType: unitPrice > 0 ? "priced" : "operational", unitPrice } : candidate));
              }} className="mt-1 w-full rounded-lg border border-white/15 bg-black px-3 py-2 text-sm font-normal text-white disabled:opacity-45" />
            </label>
          </div>
          <div className="mt-3 flex items-center justify-between gap-3 text-sm">
            <span className="text-zinc-400">Line Total <strong className="ml-2 text-white">{money(item.price)}</strong></span>
            <button type="button" disabled={disabled || !canCustomPrice} onClick={() => onChange(value.filter((candidate) => candidate.id !== item.id))} className="rounded-full border border-red-300/30 px-3 py-1.5 text-xs font-semibold uppercase text-red-200 disabled:opacity-40">Remove</button>
          </div>
        </div>
      ))}

      <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-3 text-sm font-semibold">
        <span className="uppercase text-zinc-400">Add-Ons Total</span>
        <span className="text-[#F2D66C]">{money(value.reduce((total, item) => total + Number(item.price || 0), 0))}</span>
      </div>
    </section>
  );
}
