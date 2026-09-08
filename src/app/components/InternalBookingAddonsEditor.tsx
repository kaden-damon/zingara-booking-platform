"use client";

import { useState } from "react";

import type { BookingAddon } from "../../lib/zingaraDemo";

function money(value: number) {
  return new Intl.NumberFormat("en-ZA", {
    currency: "ZAR",
    style: "currency",
  }).format(value);
}

function withLineTotal(item: BookingAddon, quantity: number, unitPrice: number) {
  return {
    ...item,
    price: quantity * unitPrice,
    pricingType: unitPrice > 0 ? "priced" as const : "operational" as const,
    quantity,
    unitPrice,
  };
}

function blankCustomItem(): BookingAddon {
  return {
    id: `custom-${crypto.randomUUID()}`,
    kind: "custom",
    name: "",
    price: 0,
    pricingType: "operational",
    quantity: 1,
    unitPrice: 0,
  };
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
  const [expanded, setExpanded] = useState(false);
  const [customDraft, setCustomDraft] = useState<BookingAddon | null>(null);
  const [editingCustomId, setEditingCustomId] = useState<string | null>(null);
  const [customError, setCustomError] = useState("");
  const total = value.reduce((sum, item) => sum + Number(item.price || 0), 0);
  const unavailableHistoricalItems = value.filter(
    (item) =>
      item.kind === "catalogue" &&
      !catalogue.some((catalogueItem) => catalogueItem.id === item.id),
  );

  function updateCatalogueQuantity(id: string, rawQuantity: string) {
    const quantity = Math.max(1, Math.trunc(Number(rawQuantity) || 1));
    onChange(
      value.map((item) =>
        item.id === id
          ? withLineTotal(item, quantity, Number(item.unitPrice ?? item.price))
          : item,
      ),
    );
  }

  function updateCatalogueUnitPrice(id: string, rawUnitPrice: string) {
    const unitPrice = Math.max(0, Number(rawUnitPrice) || 0);
    onChange(
      value.map((item) =>
        item.id === id
          ? withLineTotal(item, item.quantity ?? 1, unitPrice)
          : item,
      ),
    );
  }

  function openNewCustomItem() {
    setEditingCustomId(null);
    setCustomDraft(blankCustomItem());
    setCustomError("");
  }

  function openCustomItem(item: BookingAddon) {
    setEditingCustomId(item.id);
    setCustomDraft({ ...item });
    setCustomError("");
  }

  function cancelCustomItem() {
    setEditingCustomId(null);
    setCustomDraft(null);
    setCustomError("");
  }

  function commitCustomItem() {
    if (!customDraft) return;
    const name = customDraft.name.trim();
    const quantity = Number(customDraft.quantity);
    const unitPrice = Number(customDraft.unitPrice);

    if (!name) {
      setCustomError("Item name is required.");
      return;
    }
    if (!Number.isInteger(quantity) || quantity < 1) {
      setCustomError("Quantity must be a whole number of at least 1.");
      return;
    }
    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      setCustomError("Unit price must be a valid non-negative Rand amount.");
      return;
    }

    const committedItem = withLineTotal(
      { ...customDraft, name },
      quantity,
      unitPrice,
    );
    onChange(
      editingCustomId
        ? value.map((item) =>
            item.id === editingCustomId ? committedItem : item,
          )
        : [...value, committedItem],
    );
    cancelCustomItem();
  }

  function updateCustomDraft(patch: Partial<BookingAddon>) {
    setCustomDraft((current) => current ? { ...current, ...patch } : current);
    setCustomError("");
  }

  return (
    <section className="rounded-2xl border border-[#D8C36A]/30 bg-black/35">
      <button
        type="button"
        aria-expanded={expanded}
        disabled={disabled}
        onClick={() => setExpanded((current) => !current)}
        className="flex min-h-14 w-full items-center justify-between gap-4 rounded-2xl px-4 py-3 text-left disabled:opacity-50"
      >
        <span className="min-w-0">
          <span className="block text-sm font-semibold uppercase text-[#F2D66C]">{heading}</span>
          <span className="mt-0.5 block text-xs text-zinc-400">
            {value.length === 0
              ? "No add-ons selected"
              : `${value.length} ${value.length === 1 ? "item" : "items"} · ${money(total)}`}
          </span>
        </span>
        <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#D8C36A]/50 text-2xl leading-none text-[#F2D66C]">
          {expanded ? "−" : "+"}
        </span>
      </button>

      {expanded && (
        <div className="border-t border-white/10 px-4 pb-4 pt-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-zinc-400">Operational items show R0 until an authoritative price is configured.</p>
            {canCustomPrice && !customDraft && (
              <button
                type="button"
                disabled={disabled}
                onClick={openNewCustomItem}
                className="min-h-10 rounded-full border border-[#D8C36A]/45 px-4 py-2 text-xs font-semibold uppercase text-[#F2D66C] disabled:opacity-40"
              >
                + Add Custom Item
              </button>
            )}
          </div>

          <div className="mt-3 space-y-2">
            {catalogue.map((catalogueItem) => {
              const selected = value.find((item) => item.id === catalogueItem.id);
              const catalogueUnitPrice = Number(
                catalogueItem.catalogueUnitPrice ??
                  catalogueItem.unitPrice ??
                  catalogueItem.price,
              );
              const agreedUnitPrice = Number(selected?.unitPrice ?? catalogueUnitPrice);
              const hasOverride = Boolean(selected && agreedUnitPrice !== catalogueUnitPrice);

              return (
                <div key={catalogueItem.id} className="rounded-xl border border-white/10 bg-black/30 p-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <label className="flex min-w-0 flex-1 items-center gap-3 text-sm">
                      <input
                        type="checkbox"
                        checked={Boolean(selected)}
                        disabled={disabled}
                        onChange={(event) =>
                          onChange(
                            event.target.checked
                              ? [...value, { ...catalogueItem, catalogueUnitPrice, price: catalogueUnitPrice, quantity: 1, unitPrice: catalogueUnitPrice }]
                              : value.filter((item) => item.id !== catalogueItem.id),
                          )
                        }
                        className="h-5 w-5 accent-[#D8C36A]"
                      />
                      <span className="min-w-0">
                        <span className="block font-medium text-zinc-100">{catalogueItem.name}</span>
                        <span className="block text-xs text-zinc-500">
                          {catalogueUnitPrice > 0 ? `${money(catalogueUnitPrice)} each` : "Operational / no price"}
                        </span>
                      </span>
                    </label>
                    <label className="flex items-center gap-2 text-xs font-semibold uppercase text-zinc-400">
                      Quantity
                      <input
                        aria-label={`${catalogueItem.name} quantity`}
                        type="number"
                        min={1}
                        step={1}
                        value={selected?.quantity ?? 1}
                        disabled={disabled || !selected}
                        onChange={(event) => updateCatalogueQuantity(catalogueItem.id, event.target.value)}
                        className="w-20 rounded-lg border border-white/15 bg-zinc-950 px-2 py-2 text-center text-sm font-normal text-white disabled:opacity-35"
                      />
                    </label>
                    {selected && catalogueUnitPrice > 0 && canCustomPrice && (
                      <label className="flex items-center gap-2 text-xs font-semibold uppercase text-zinc-400">
                        Unit Price
                        <input
                          aria-label={`${catalogueItem.name} unit price`}
                          type="number"
                          min={0}
                          step="0.01"
                          inputMode="decimal"
                          value={agreedUnitPrice}
                          disabled={disabled}
                          onChange={(event) => updateCatalogueUnitPrice(catalogueItem.id, event.target.value)}
                          className="w-28 rounded-lg border border-white/15 bg-zinc-950 px-2 py-2 text-right text-sm font-normal text-white disabled:opacity-35"
                        />
                      </label>
                    )}
                  </div>
                  {hasOverride && (
                    <p className="mt-2 text-right text-xs text-amber-200">
                      Booking price {money(agreedUnitPrice)} each · Catalogue {money(catalogueUnitPrice)}
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          {unavailableHistoricalItems.map((item) => (
            <div key={item.id} className="mt-3 rounded-xl border border-white/10 bg-black/30 p-3">
              <p className="text-sm font-medium text-zinc-100">{item.name}</p>
              <p className="mt-1 text-xs font-semibold uppercase text-zinc-500">
                Unavailable for new bookings
              </p>
            </div>
          ))}

          {value.filter((item) => item.kind === "custom").map((item) => (
            editingCustomId === item.id && customDraft ? null : (
              <div key={item.id} className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#D8C36A]/25 bg-zinc-950/80 p-3">
                <div className="min-w-0 flex-1 text-sm">
                  <span className="text-[10px] font-semibold uppercase text-[#F2D66C]">Custom</span>
                  <p className="font-medium text-white">{item.name}</p>
                  <p className="text-xs text-zinc-400">
                    {item.quantity ?? 1} × {money(item.unitPrice ?? item.price)} · <span className="font-semibold text-zinc-200">{money(item.price)}</span>
                  </p>
                  {item.description && <p className="mt-1 text-xs text-zinc-500">{item.description}</p>}
                </div>
                <div className="flex gap-2">
                  <button type="button" disabled={disabled || !canCustomPrice} onClick={() => openCustomItem(item)} className="rounded-full border border-white/20 px-3 py-1.5 text-xs font-semibold uppercase text-zinc-200 disabled:opacity-40">Edit</button>
                  <button type="button" disabled={disabled || !canCustomPrice} onClick={() => onChange(value.filter((candidate) => candidate.id !== item.id))} className="rounded-full border border-red-300/30 px-3 py-1.5 text-xs font-semibold uppercase text-red-200 disabled:opacity-40">Remove</button>
                </div>
              </div>
            )
          ))}

          {customDraft && (
            <div className="mt-3 rounded-xl border border-[#D8C36A]/35 bg-zinc-950/80 p-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-xs font-semibold uppercase text-zinc-400">
                  Item Name *
                  <input value={customDraft.name} disabled={disabled} maxLength={120} onChange={(event) => updateCustomDraft({ name: event.target.value })} className="mt-1 w-full rounded-lg border border-white/15 bg-black px-3 py-2 text-sm font-normal normal-case text-white disabled:opacity-45" />
                </label>
                <label className="text-xs font-semibold uppercase text-zinc-400">
                  Description / Notes
                  <input value={customDraft.description ?? ""} disabled={disabled} maxLength={500} onChange={(event) => updateCustomDraft({ description: event.target.value })} className="mt-1 w-full rounded-lg border border-white/15 bg-black px-3 py-2 text-sm font-normal normal-case text-white disabled:opacity-45" />
                </label>
                <label className="text-xs font-semibold uppercase text-zinc-400">
                  Quantity *
                  <input type="number" min={1} step={1} value={customDraft.quantity ?? 1} disabled={disabled} onChange={(event) => updateCustomDraft({ quantity: Number(event.target.value) })} className="mt-1 w-full rounded-lg border border-white/15 bg-black px-3 py-2 text-sm font-normal text-white disabled:opacity-45" />
                </label>
                <label className="text-xs font-semibold uppercase text-zinc-400">
                  Unit Price *
                  <input type="number" min={0} step="0.01" inputMode="decimal" value={customDraft.unitPrice ?? 0} disabled={disabled} onChange={(event) => updateCustomDraft({ unitPrice: Number(event.target.value) })} className="mt-1 w-full rounded-lg border border-white/15 bg-black px-3 py-2 text-sm font-normal text-white disabled:opacity-45" />
                </label>
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm">
                <span className="text-zinc-400">Line Total <strong className="ml-2 text-white">{money((customDraft.quantity ?? 1) * (customDraft.unitPrice ?? 0))}</strong></span>
                <div className="flex gap-2">
                  <button type="button" disabled={disabled} onClick={cancelCustomItem} className="min-h-10 rounded-full border border-white/20 px-4 py-2 text-xs font-semibold uppercase text-zinc-200 disabled:opacity-40">Cancel</button>
                  <button type="button" disabled={disabled} onClick={commitCustomItem} className="min-h-10 rounded-full border border-[#D8C36A] bg-[#D8C36A] px-4 py-2 text-xs font-bold uppercase text-black disabled:opacity-40">
                    {editingCustomId ? "Save Item" : "Add Item"}
                  </button>
                </div>
              </div>
              {customError && <p role="alert" className="mt-2 text-sm text-red-200">{customError}</p>}
            </div>
          )}

          <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-3 text-sm font-semibold">
            <span className="uppercase text-zinc-400">Add-Ons Total</span>
            <span className="text-[#F2D66C]">{money(total)}</span>
          </div>
        </div>
      )}
    </section>
  );
}
