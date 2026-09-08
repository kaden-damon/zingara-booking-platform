"use client";

import { useEffect, useMemo, useState } from "react";
import { adminIpUndertaking } from "@/lib/adminIpUndertaking";
import { fetchSupabaseApi } from "@/lib/supabase/apiClient";
import { AdminCollapsibleSection } from "./AdminCollapsibleSection";
import CookiePrivacyPreferences from "./CookiePrivacyPreferences";

type Workspace = "cookie-consent" | "platform-terms";
type RegisterRow = {
  acceptanceId: string | null;
  acceptedAt: string | null;
  auditEventId: string | null;
  email: string;
  policyTitle: string;
  policyVersion: string;
  roleAtAcceptance: string | null;
  staffId: string | null;
  staffMember: string;
  status: "current" | "pending" | "superseded";
};
type RegisterPayload = {
  currentPolicy: {
    displayVersion: string;
    status: "current";
    title: string;
    version: string;
  };
  rows: RegisterRow[];
  summary: {
    accepted: number;
    activeAdminUsers: number;
    pending: number;
  };
};

const workspaceStorageKey = "zingara-system-preferences-workspace";

function formatAcceptanceTimestamp(value: string | null) {
  if (!value) return "Pending";

  return new Intl.DateTimeFormat("en-ZA", {
    dateStyle: "medium",
    timeStyle: "medium",
    timeZone: "Africa/Johannesburg",
  }).format(new Date(value));
}

function statusClass(status: RegisterRow["status"]) {
  if (status === "current") {
    return "border-emerald-300/30 bg-emerald-950/25 text-emerald-200";
  }
  if (status === "pending") {
    return "border-amber-300/30 bg-amber-950/25 text-amber-100";
  }
  return "border-white/15 bg-white/[0.04] text-zinc-300";
}

function statusLabel(status: RegisterRow["status"]) {
  if (status === "current") return "Current";
  if (status === "pending") return "Pending";
  return "Superseded";
}

export default function SystemPreferences({ isSuperAdmin }: { isSuperAdmin: boolean }) {
  const [workspace, setWorkspace] = useState<Workspace>("cookie-consent");
  const [register, setRegister] = useState<RegisterPayload | null>(null);
  const [registerError, setRegisterError] = useState("");
  const [isRegisterLoading, setIsRegisterLoading] = useState(true);
  const [selectedAcceptanceId, setSelectedAcceptanceId] = useState<string | null>(null);
  const selectedRow = useMemo(
    () =>
      selectedAcceptanceId
        ? register?.rows.find((row) => row.acceptanceId === selectedAcceptanceId) ?? null
        : null,
    [register, selectedAcceptanceId],
  );
  const isPlatformOwner = Boolean(register);

  useEffect(() => {
    let active = true;

    void fetchSupabaseApi<RegisterPayload>(
      "/api/admin/platform-governance/acceptance-register",
      { cache: "no-store" },
    )
      .then((payload) => {
        if (!active) return;
        setRegister(payload);
        const savedWorkspace = window.sessionStorage.getItem(workspaceStorageKey);
        if (savedWorkspace === "platform-terms") setWorkspace("platform-terms");
      })
      .catch((error) => {
        if (!active) return;
        if (
          !(error instanceof Error) ||
          error.message !== "Platform Owner access is required."
        ) {
          setRegisterError(
            error instanceof Error
              ? error.message
              : "Platform governance status could not be verified.",
          );
        }
      })
      .finally(() => {
        if (active) setIsRegisterLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  function selectWorkspace(nextWorkspace: Workspace) {
    setWorkspace(nextWorkspace);
    window.sessionStorage.setItem(workspaceStorageKey, nextWorkspace);
  }

  return (
    <section className="space-y-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#D8C36A]">
          System
        </p>
        <h2 className="mt-2 text-3xl font-bold text-white">Preferences</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">
          Public consent settings and protected platform governance information.
        </p>
      </div>

      <nav
        aria-label="Preference workspaces"
        className={`grid grid-cols-1 gap-2 rounded-2xl border border-white/10 bg-zinc-950/75 p-2 ${
          isPlatformOwner ? "sm:grid-cols-2" : ""
        }`}
      >
        <button
          type="button"
          aria-current={workspace === "cookie-consent" ? "page" : undefined}
          onClick={() => selectWorkspace("cookie-consent")}
          className={`min-h-12 rounded-xl px-4 py-3 text-xs font-semibold uppercase tracking-[0.12em] transition ${
            workspace === "cookie-consent"
              ? "bg-[#D8C36A] text-black"
              : "border border-white/10 bg-black/35 text-zinc-300 hover:border-[#D8C36A]/50 hover:text-white"
          }`}
        >
          Cookie Consent
        </button>
        {isPlatformOwner && (
          <button
            type="button"
            aria-current={workspace === "platform-terms" ? "page" : undefined}
            onClick={() => selectWorkspace("platform-terms")}
            className={`min-h-12 rounded-xl px-4 py-3 text-xs font-semibold uppercase tracking-[0.12em] transition ${
              workspace === "platform-terms"
                ? "bg-[#D8C36A] text-black"
                : "border border-white/10 bg-black/35 text-zinc-300 hover:border-[#D8C36A]/50 hover:text-white"
            }`}
          >
            Platform Use &amp; Access Terms
          </button>
        )}
      </nav>

      {isRegisterLoading && (
        <p role="status" className="text-xs text-zinc-500">
          Verifying platform governance access...
        </p>
      )}
      {registerError && (
        <p role="alert" className="rounded-xl border border-red-300/25 bg-red-950/20 p-4 text-sm text-red-100">
          {registerError}
        </p>
      )}

      {workspace === "cookie-consent" && (
        <AdminCollapsibleSection
          title="Cookie Consent Configuration"
          summary="Public notice, consent version and preview"
          indicator="plus-minus"
        >
          <CookiePrivacyPreferences isSuperAdmin={isSuperAdmin} />
        </AdminCollapsibleSection>
      )}

      {workspace === "platform-terms" && register && (
        <div className="space-y-3">
          <AdminCollapsibleSection
            title="Current Terms Version"
            summary={`${register.currentPolicy.displayVersion} · Current`}
            indicator="plus-minus"
          >
            <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {[
                ["Policy", register.currentPolicy.title],
                ["Version", register.currentPolicy.displayVersion],
                ["Technical policy ID", register.currentPolicy.version],
                ["Status", "Current"],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl border border-white/10 bg-black/35 p-4">
                  <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500">{label}</dt>
                  <dd className="mt-2 break-words text-sm font-semibold text-white">{value}</dd>
                </div>
              ))}
            </dl>
          </AdminCollapsibleSection>

          <AdminCollapsibleSection
            title="Acceptance Register"
            summary="Immutable current and historical staff acceptance evidence"
            indicator="plus-minus"
          >
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {[
                ["Current Version", register.currentPolicy.displayVersion],
                ["Active Admin Users", register.summary.activeAdminUsers],
                ["Accepted", register.summary.accepted],
                ["Pending", register.summary.pending],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl border border-[#D8C36A]/20 bg-black/40 p-3 sm:p-4">
                  <p className="text-[0.65rem] font-semibold uppercase tracking-[0.1em] text-zinc-500">{label}</p>
                  <p className="mt-2 text-xl font-bold text-white">{value}</p>
                </div>
              ))}
            </div>

            <div className="mt-5 hidden overflow-x-auto rounded-xl border border-white/10 md:block">
              <table className="w-full min-w-[760px] border-collapse text-left text-sm">
                <thead className="bg-black/55 text-[0.68rem] uppercase tracking-[0.1em] text-zinc-500">
                  <tr>
                    <th className="px-4 py-3">Staff Member</th>
                    <th className="px-4 py-3">Email</th>
                    <th className="px-4 py-3">Role at Acceptance</th>
                    <th className="px-4 py-3">Policy Version</th>
                    <th className="px-4 py-3">Accepted Date / Time</th>
                    <th className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {register.rows.map((row, index) => (
                    <tr
                      key={row.acceptanceId ?? `pending-${row.staffId}`}
                      className={`${index > 0 ? "border-t border-white/10" : ""} ${row.acceptanceId ? "cursor-pointer hover:bg-white/[0.04]" : ""}`}
                      onClick={() => row.acceptanceId && setSelectedAcceptanceId(row.acceptanceId)}
                    >
                      <td className="px-4 py-3 font-semibold text-white">{row.staffMember}</td>
                      <td className="px-4 py-3 text-zinc-300">{row.email}</td>
                      <td className="px-4 py-3 text-zinc-300">{row.roleAtAcceptance ?? "Not applicable"}</td>
                      <td className="px-4 py-3 text-zinc-300">{row.policyVersion}</td>
                      <td className="px-4 py-3 text-zinc-300">{formatAcceptanceTimestamp(row.acceptedAt)}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-full border px-3 py-1 text-[0.65rem] font-semibold uppercase ${statusClass(row.status)}`}>
                          {statusLabel(row.status)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-5 space-y-3 md:hidden">
              {register.rows.map((row) => (
                <button
                  key={row.acceptanceId ?? `pending-mobile-${row.staffId}`}
                  type="button"
                  disabled={!row.acceptanceId}
                  onClick={() => row.acceptanceId && setSelectedAcceptanceId(row.acceptanceId)}
                  className="w-full rounded-xl border border-white/10 bg-black/35 p-4 text-left disabled:cursor-default"
                >
                  <span className="flex items-start justify-between gap-3">
                    <span className="min-w-0">
                      <span className="block font-semibold text-white">{row.staffMember}</span>
                      <span className="mt-1 block break-all text-xs text-zinc-400">{row.email}</span>
                    </span>
                    <span className={`shrink-0 rounded-full border px-2 py-1 text-[0.6rem] font-semibold uppercase ${statusClass(row.status)}`}>
                      {statusLabel(row.status)}
                    </span>
                  </span>
                  <span className="mt-3 block text-xs leading-5 text-zinc-400">
                    {row.roleAtAcceptance ?? "Not applicable"} · {row.policyVersion}<br />
                    {formatAcceptanceTimestamp(row.acceptedAt)}
                  </span>
                </button>
              ))}
            </div>

            {selectedRow && (
              <section aria-label="Acceptance detail" className="mt-5 rounded-xl border border-[#D8C36A]/25 bg-zinc-950 p-4 sm:p-5">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-lg font-bold text-white">Acceptance Detail</h3>
                  <button
                    type="button"
                    onClick={() => setSelectedAcceptanceId(null)}
                    aria-label="Close acceptance detail"
                    className="min-h-11 rounded-lg border border-white/15 px-3 py-2 text-xs font-semibold uppercase text-zinc-300"
                  >
                    Close
                  </button>
                </div>
                <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {[
                    ["Staff Member", selectedRow.staffMember],
                    ["Staff ID", selectedRow.staffId ?? "Not recorded"],
                    ["Email", selectedRow.email],
                    ["Role at Acceptance", selectedRow.roleAtAcceptance ?? "Not recorded"],
                    ["Policy Title", selectedRow.policyTitle],
                    ["Policy Version", selectedRow.policyVersion],
                    ["Accepted", formatAcceptanceTimestamp(selectedRow.acceptedAt)],
                    ["Acceptance Record ID", selectedRow.acceptanceId ?? "Not applicable"],
                    ["Matching Audit Event ID", selectedRow.auditEventId ?? "Not recorded"],
                    ["Status", statusLabel(selectedRow.status)],
                  ].map(([label, value]) => (
                    <div key={label} className="min-w-0">
                      <dt className="text-[0.65rem] font-semibold uppercase tracking-[0.1em] text-zinc-500">{label}</dt>
                      <dd className="mt-1 break-all text-sm text-zinc-200">{value}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            )}
          </AdminCollapsibleSection>

          <AdminCollapsibleSection
            title="Policy Details"
            summary="Current policy identity and full terms"
            indicator="plus-minus"
          >
            <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <dt className="text-xs font-semibold uppercase text-zinc-500">Policy name</dt>
                <dd className="mt-1 text-white">{adminIpUndertaking.title}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase text-zinc-500">Display version</dt>
                <dd className="mt-1 text-white">{register.currentPolicy.displayVersion}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase text-zinc-500">Technical version ID</dt>
                <dd className="mt-1 break-all text-white">{register.currentPolicy.version}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase text-zinc-500">Status</dt>
                <dd className="mt-1 text-white">Current</dd>
              </div>
            </dl>
            <a
              href="/royal-decrees/terms-and-conditions"
              target="_blank"
              rel="noreferrer"
              className="mt-5 inline-flex min-h-11 items-center rounded-lg border border-[#D8C36A]/40 px-4 py-2 text-sm font-semibold text-[#F2D66C] transition hover:bg-[#D8C36A] hover:text-black"
            >
              View Full Terms
            </a>
          </AdminCollapsibleSection>
        </div>
      )}
    </section>
  );
}
