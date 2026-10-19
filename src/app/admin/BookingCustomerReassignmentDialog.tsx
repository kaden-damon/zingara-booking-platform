"use client";

import { useEffect, useState } from "react";
import { fetchSupabaseApi } from "@/lib/supabase/apiClient";

type CustomerResult = {
  companies: string[];
  email: string | null;
  first_name: string;
  id: string;
  mobile: string | null;
  surname: string | null;
};

export default function BookingCustomerReassignmentDialog(props: {
  bookingReference: string;
  currentCustomerId?: string;
  currentCustomerName: string;
  expectedUpdatedAt: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<CustomerResult[]>([]);
  const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState<CustomerResult | null>(null);
  const [reason, setReason] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [draft, setDraft] = useState({ firstName: "", surname: "", email: "", mobile: "" });

  useEffect(() => {
    if (search.trim().length < 2) {
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setStatus("Searching...");
      void fetchSupabaseApi<{ rows: CustomerResult[]; total: number }>(
        `/api/admin/customer-management?mode=reassignment-search&page=1&pageSize=10&search=${encodeURIComponent(search.trim())}`,
        { cache: "no-store", signal: controller.signal },
      ).then((payload) => {
        setRows(payload.rows);
        setTotal(payload.total);
        setStatus(payload.total ? "" : "No matching customers found.");
      }).catch((error) => {
        if (controller.signal.aborted) return;
        setStatus(error instanceof Error ? error.message : "Customers couldn't be loaded.");
      });
    }, 350);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [search]);

  async function createCustomer() {
    setBusy(true);
    setStatus("Creating customer...");
    try {
      const payload = await fetchSupabaseApi<{ customer: CustomerResult }>("/api/admin/customer-management", {
        body: draft,
        method: "POST",
      });
      setSelected(payload.customer);
      setCreateOpen(false);
      setStatus("Customer created. Review the change before confirming.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "The customer couldn't be created.");
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    if (!selected || reason.trim().length < 5) return;
    setBusy(true);
    setStatus("Changing linked customer...");
    try {
      await fetchSupabaseApi("/api/admin/bookings/reassign-customer", {
        body: {
          bookingReference: props.bookingReference,
          customerId: selected.id,
          expectedUpdatedAt: props.expectedUpdatedAt,
          reason: reason.trim(),
        },
        method: "POST",
      });
      props.onSuccess();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "The linked customer couldn't be changed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div aria-modal="true" className="fixed inset-0 z-[130] flex items-center justify-center bg-black/80 p-3 backdrop-blur-sm" role="dialog">
      <button aria-label="Close customer reassignment" className="absolute inset-0" onClick={props.onClose} type="button" />
      <div className="relative z-10 max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-[#D8C36A]/35 bg-zinc-950 p-4 shadow-2xl sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#F2D66C]">Booking Customer</p>
            <h3 className="mt-1 text-lg font-semibold text-white">Change Customer</h3>
            <p className="mt-1 text-sm text-zinc-400">{props.bookingReference}</p>
          </div>
          <button className="rounded-full border border-white/15 px-3 py-2 text-xs font-semibold text-zinc-200" onClick={props.onClose} type="button">Close</button>
        </div>

        <label className="mt-4 block text-xs font-semibold uppercase tracking-[0.1em] text-zinc-400">
          Find Customer
          <input autoFocus className="mt-2 w-full rounded-xl border border-white/15 bg-black px-3 py-2.5 text-sm text-white outline-none focus:border-[#D8C36A]" onChange={(event) => {
            const value = event.target.value;
            setSearch(value);
            if (value.trim().length < 2) {
              setRows([]);
              setTotal(0);
              setStatus("");
            }
          }} placeholder="Name, email, mobile, booking ref or company" value={search} />
        </label>
        {total > 0 && <p className="mt-2 text-xs text-zinc-500">{total} matching customers · showing up to 10</p>}
        <div className="mt-3 grid gap-2">
          {rows.map((customer) => (
            <button key={customer.id} className={`rounded-xl border p-3 text-left ${selected?.id === customer.id ? "border-[#D8C36A] bg-[#D8C36A]/10" : "border-white/10 bg-black/30"}`} disabled={customer.id === props.currentCustomerId} onClick={() => setSelected(customer)} type="button">
              <span className="block text-sm font-semibold text-white">{customer.first_name} {customer.surname}</span>
              <span className="mt-1 block text-xs text-zinc-400">{[customer.email, customer.mobile, ...customer.companies].filter(Boolean).join(" · ") || "No contact details"}</span>
              {customer.id === props.currentCustomerId && <span className="mt-1 block text-xs text-[#F2D66C]">Currently linked</span>}
            </button>
          ))}
        </div>

        <button className="mt-3 rounded-full border border-[#D8C36A]/35 px-3 py-2 text-xs font-semibold text-[#F2D66C]" onClick={() => setCreateOpen((value) => !value)} type="button">{createOpen ? "Cancel" : "Add Customer"}</button>
        {createOpen && (
          <div className="mt-3 grid gap-2 rounded-xl border border-white/10 p-3 sm:grid-cols-2">
            {(["firstName", "surname", "email", "mobile"] as const).map((field) => (
              <label className="text-xs text-zinc-400" key={field}>{field === "firstName" ? "First name" : field[0].toUpperCase() + field.slice(1)}
                <input className="mt-1 w-full rounded-xl border border-white/15 bg-black px-3 py-2 text-sm text-white" onChange={(event) => setDraft((current) => ({ ...current, [field]: event.target.value }))} value={draft[field]} />
              </label>
            ))}
            <button className="rounded-full bg-[#D8C36A] px-4 py-2 text-xs font-bold uppercase text-black disabled:opacity-40 sm:col-span-2" disabled={busy || !draft.firstName.trim() || !draft.surname.trim()} onClick={() => void createCustomer()} type="button">Add Customer</button>
          </div>
        )}

        {selected && (
          <div className="mt-4 rounded-xl border border-[#D8C36A]/25 bg-[#D8C36A]/5 p-3 text-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#F2D66C]">Review change</p>
            <p className="mt-2 text-zinc-400">Current</p><p className="font-semibold text-white">{props.currentCustomerName}</p>
            <p className="mt-2 text-zinc-400">New</p><p className="font-semibold text-white">{selected.first_name} {selected.surname}</p>
          </div>
        )}
        <label className="mt-4 block text-xs font-semibold uppercase tracking-[0.1em] text-zinc-400">Reason for change
          <textarea className="mt-2 min-h-20 w-full rounded-xl border border-white/15 bg-black px-3 py-2 text-sm normal-case tracking-normal text-white" onChange={(event) => setReason(event.target.value)} value={reason} />
        </label>
        {status && <p aria-live="polite" className="mt-3 text-sm text-amber-100">{status}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button className="rounded-full border border-white/15 px-4 py-2 text-xs font-semibold text-zinc-200" onClick={props.onClose} type="button">Cancel</button>
          <button className="rounded-full bg-[#D8C36A] px-4 py-2 text-xs font-bold uppercase text-black disabled:opacity-40" disabled={busy || !selected || reason.trim().length < 5} onClick={() => void confirm()} type="button">Confirm Change</button>
        </div>
      </div>
    </div>
  );
}
