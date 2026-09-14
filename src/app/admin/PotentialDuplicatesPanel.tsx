"use client";

import { useState } from "react";
import type {
  DuplicateIntegrityGroup,
  DuplicateIntegrityRecord,
} from "@/lib/duplicateIntegrity";
import { fetchSupabaseApi } from "@/lib/supabase/apiClient";

type DuplicateResponse = {
  groups: DuplicateIntegrityGroup[];
  summary: {
    capacityImpact: number;
    exact: number;
    possible: number;
    probable: number;
    total: number;
  };
};

function money(value: number) {
  return new Intl.NumberFormat("en-ZA", {
    currency: "ZAR",
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
    style: "currency",
  }).format(value);
}

function recordType(record: DuplicateIntegrityRecord) {
  if (record.recordType === "corporate-enquiry") return "Corporate enquiry";
  if (record.recordType === "corporate-booking") return "Corporate booking";
  return "Standard booking";
}

export default function PotentialDuplicatesPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [data, setData] = useState<DuplicateResponse | null>(null);
  const [error, setError] = useState("");

  async function toggle() {
    const nextOpen = !isOpen;
    setIsOpen(nextOpen);
    if (!nextOpen || data || isLoading) return;

    setIsLoading(true);
    setError("");
    try {
      setData(
        await fetchSupabaseApi<DuplicateResponse>(
          "/api/admin/potential-duplicates",
          { cache: "no-store" },
        ),
      );
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Potential duplicates could not be loaded.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <section className="mt-4 overflow-hidden rounded-lg border border-[#9f7d3d]/45 bg-[#171512]">
      <button
        className="flex min-h-12 w-full items-center justify-between gap-4 px-4 py-3 text-left text-[#f4eddf]"
        onClick={() => void toggle()}
        type="button"
      >
        <span>
          <span className="block font-serif text-base">Potential Duplicates</span>
          <span className="block text-xs text-[#c8bda8]">
            Review suspected booking and Corporate enquiry groups.
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-3 text-xs text-[#d7b968]">
          {data ? `${data.summary.total} groups` : "Load on demand"}
          <span aria-hidden="true">{isOpen ? "⌃" : "⌄"}</span>
        </span>
      </button>

      {isOpen ? (
        <div className="border-t border-[#9f7d3d]/35 px-4 py-4">
          {isLoading ? <p className="text-sm text-[#d7b968]">Loading review groups...</p> : null}
          {error ? <p className="text-sm text-red-300">{error}</p> : null}
          {data ? (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2 text-xs text-[#ded3c0]">
                <span>Exact {data.summary.exact}</span>
                <span>Probable {data.summary.probable}</span>
                <span>Possible {data.summary.possible}</span>
                <span>Potential capacity impact {data.summary.capacityImpact} pax</span>
              </div>
              {data.groups.length === 0 ? (
                <p className="text-sm text-[#c8bda8]">No candidate groups found.</p>
              ) : (
                data.groups.map((group) => (
                  <article
                    className="overflow-hidden rounded-lg border border-[#8d713f]/35 bg-[#211e19]"
                    key={group.id}
                  >
                    <header className="flex flex-wrap items-start justify-between gap-3 border-b border-[#8d713f]/25 px-3 py-3">
                      <div>
                        <span className="text-xs font-semibold uppercase text-[#d7b968]">
                          {group.confidence} duplicate
                        </span>
                        <p className="mt-1 text-sm text-[#f4eddf]">{group.whyFlagged}</p>
                      </div>
                      <strong className="text-sm text-[#f4eddf]">
                        Capacity Impact: {group.capacityImpact > 0 ? `${group.capacityImpact} pax` : "None — enquiry only"}
                      </strong>
                    </header>
                    <div className="overflow-x-auto">
                      <table className="min-w-[1100px] w-full text-left text-xs text-[#ded3c0]">
                        <thead className="bg-black/20 text-[#d7b968]">
                          <tr>
                            <th className="px-3 py-2">Reference / Type</th>
                            <th className="px-3 py-2">Customer</th>
                            <th className="px-3 py-2">Show / Zone</th>
                            <th className="px-3 py-2">Pax / Status</th>
                            <th className="px-3 py-2">Financials</th>
                            <th className="px-3 py-2">Source / Created</th>
                            <th className="px-3 py-2">Tables / Tickets</th>
                          </tr>
                        </thead>
                        <tbody>
                          {group.records.map((record) => (
                            <tr className="border-t border-white/5 align-top" key={record.id}>
                              <td className="px-3 py-2"><strong className="block text-[#f4eddf]">{record.reference}</strong>{recordType(record)}</td>
                              <td className="px-3 py-2"><strong className="block text-[#f4eddf]">{record.customer || "Not recorded"}</strong>{record.company ? <span className="block">{record.company}</span> : null}<span className="block">{record.email || "No email"}</span><span className="block">{record.mobile || "No mobile"}</span></td>
                              <td className="px-3 py-2"><span className="block">{record.showLabel}</span><span className="block">{record.seatingZone}</span></td>
                              <td className="px-3 py-2"><span className="block">{record.pax} pax</span><span className="block">{record.bookingStatus}</span><span className="block">{record.status}</span></td>
                              <td className="px-3 py-2"><span className="block">Value {money(record.amount)}</span><span className="block">Paid {money(record.amountPaid)}</span><span className="block">Outstanding {money(record.outstanding)}</span></td>
                              <td className="px-3 py-2"><span className="block">{record.source}</span><span className="block">{record.createdBy}</span><span className="block">{new Date(record.createdAt).toLocaleString("en-ZA")}</span>{record.importSource ? <span className="block">{record.importSource}</span> : null}{record.importFingerprint ? <span className="block break-all">Fingerprint: {record.importFingerprint}</span> : null}{record.corporateImportFingerprint ? <span className="block break-all">Enquiry fingerprint: {record.corporateImportFingerprint}</span> : null}</td>
                              <td className="px-3 py-2"><span className="block">{record.tableAssignments.length ? record.tableAssignments.join(", ") : "Unassigned"}</span><span className="block">{record.ticketCount} ticket{record.ticketCount === 1 ? "" : "s"}</span></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </article>
                ))
              )}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
