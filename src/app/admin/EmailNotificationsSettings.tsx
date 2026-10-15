"use client";

import { useCallback, useEffect, useState } from "react";
import { getAdminAuthSession } from "@/lib/supabase/auth";

type PersonalSetting = {
  description: string;
  enabled: boolean;
  key: "daily-booking-review";
  label: string;
  mode: "personal";
};

type Recipient = { email: string; id: string; name: string };
type StaffOption = Recipient & { venueScope: string[] };
type ManagementSetting = {
  cc: Recipient[];
  enabled: boolean;
  key: "corporate-enquiry" | "new-review-alert";
  to: Recipient[];
};
type Payload = {
  canManageOrganisation: boolean;
  management: ManagementSetting[];
  personal: PersonalSetting[];
  staffOptions: StaffOption[];
};

async function authorisedRequest(init?: RequestInit, includeDetails = false) {
  const auth = await getAdminAuthSession();
  if (!auth) throw new Error("Your Admin session has expired. Sign in again.");
  return fetch(`/api/admin/email-notifications${includeDetails ? "?details=true" : ""}`, {
    ...init,
    headers: {
      ...init?.headers,
      Authorization: `Bearer ${auth.session.access_token}`,
      "Content-Type": "application/json",
    },
  });
}

export default function EmailNotificationsSettings({
  showManagement = true,
  showPersonal = true,
}: {
  showManagement?: boolean;
  showPersonal?: boolean;
}) {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [managementDrafts, setManagementDrafts] = useState<ManagementSetting[]>([]);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [managementExpanded, setManagementExpanded] = useState<string | null>(null);
  const [managementDetailsLoaded, setManagementDetailsLoaded] = useState(false);

  const load = useCallback(async (includeDetails = false) => {
    setLoading(true);
    setError("");
    try {
      const response = await authorisedRequest(undefined, includeDetails);
      const next = (await response.json()) as Payload & { error?: string };
      if (!response.ok) {
        throw new Error(next.error ?? "Email notification settings couldn't be loaded.");
      }
      setPayload(next);
      setManagementDrafts(next.management);
      if (includeDetails) setManagementDetailsLoaded(true);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Email notification settings couldn't be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(false), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function savePersonal(setting: PersonalSetting, enabled: boolean) {
    setError("");
    setStatus("");
    setLoading(true);
    try {
      const response = await authorisedRequest({
        body: JSON.stringify({
          action: "personal",
          enabled,
          notificationKey: setting.key,
        }),
        method: "PATCH",
      });
      const next = (await response.json()) as Payload & { error?: string };
      if (!response.ok) throw new Error(next.error ?? "Your preference couldn't be saved.");
      setPayload(next);
      setManagementDrafts(next.management);
      setStatus(`${setting.label} ${enabled ? "enabled" : "disabled"} for you.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Your preference couldn't be saved.");
    } finally {
      setLoading(false);
    }
  }

  function updateManagement(key: ManagementSetting["key"], update: (setting: ManagementSetting) => ManagementSetting) {
    setManagementDrafts((current) => current.map((setting) => setting.key === key ? update(setting) : setting));
  }

  function setRecipient(key: ManagementSetting["key"], staff: StaffOption, placement: "cc" | "to") {
    updateManagement(key, (current) => {
      const isSelected = (placement === "to" ? current.to : current.cc).some((member) => member.id === staff.id);
      const recipient = { email: staff.email, id: staff.id, name: staff.name };
      return {
        ...current,
        cc:
          placement === "cc"
            ? isSelected
              ? current.cc.filter((member) => member.id !== staff.id)
              : [...current.cc.filter((member) => member.id !== staff.id), recipient]
            : current.cc.filter((member) => member.id !== staff.id),
        to:
          placement === "to"
            ? isSelected
              ? current.to.filter((member) => member.id !== staff.id)
              : [...current.to.filter((member) => member.id !== staff.id), recipient]
            : current.to.filter((member) => member.id !== staff.id),
      };
    });
  }

  async function saveManagement(managementDraft: ManagementSetting) {
    setError("");
    setStatus("");
    setLoading(true);
    try {
      const response = await authorisedRequest({
        body: JSON.stringify({
          action: "management",
          ccStaffProfileIds: managementDraft.cc.map((member) => member.id),
          enabled: managementDraft.enabled,
          notificationKey: managementDraft.key,
          toStaffProfileIds: managementDraft.to.map((member) => member.id),
        }),
        method: "PATCH",
      });
      const next = (await response.json()) as Payload & { error?: string };
      if (!response.ok) throw new Error(next.error ?? "Email routing couldn't be saved.");
      setPayload(next);
      setManagementDrafts(next.management);
      setStatus("Email routing saved.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Email routing couldn't be saved.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="rounded-lg border border-[#D8C36A]/30 bg-zinc-950/80 p-4 sm:p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#D8C36A]">
        Email Notifications
      </p>
      <h2 className="mt-2 text-2xl font-bold text-white">Staff email preferences</h2>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">
        {showPersonal
          ? "Choose your own eligible emails. Management routing is controlled separately and remains protected."
          : "Review required recipients and edit protected organisation routing without changing delivery rules."}
      </p>

      <div className={`mt-5 grid gap-5 ${showManagement && showPersonal ? "xl:grid-cols-2" : ""}`}>
        {showPersonal && (
        <div className="rounded-lg border border-white/10 bg-black/30 p-4">
          <h3 className="font-semibold text-white">Your email subscriptions</h3>
          <p className="mt-1 text-sm text-zinc-500">These changes apply only to your staff profile.</p>
          <div className="mt-4 space-y-3">
            {payload?.personal.map((setting) => (
              <label key={setting.key} className="flex min-h-12 items-start justify-between gap-4 rounded-lg border border-white/10 p-3">
                <span>
                  <strong className="block text-sm text-white">{setting.label}</strong>
                  <span className="mt-1 block text-xs leading-5 text-zinc-500">{setting.description}</span>
                </span>
                <input
                  type="checkbox"
                  aria-label={`${setting.label} email subscription`}
                  checked={setting.enabled}
                  disabled={loading}
                  onChange={(event) => void savePersonal(setting, event.target.checked)}
                  className="mt-1 h-5 w-5 accent-[#D8C36A]"
                />
              </label>
            ))}
          </div>
        </div>
        )}

        {showManagement && (
        <div className="rounded-lg border border-white/10 bg-black/30 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="font-semibold text-white">Management-controlled recipients</h3>
              <p className="mt-1 text-sm text-zinc-500">Required recipients and CC routing for organisation emails.</p>
            </div>
            {!payload?.canManageOrganisation && (
              <span className="rounded-full border border-white/10 px-3 py-1 text-xs text-zinc-500">View protected</span>
            )}
          </div>

          {payload?.canManageOrganisation && managementDrafts.length ? (
            <div className="mt-4 space-y-3">
            {managementDrafts.map((managementDraft) => {
              const expanded = managementExpanded === managementDraft.key;
              const label = managementDraft.key === "new-review-alert" ? "New Review Alerts" : "New Corporate Enquiries";
              return <div className="rounded-lg border border-white/10 p-3" key={managementDraft.key}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <strong className="block text-sm text-white">{label}</strong>
                    <p className="mt-1 text-xs leading-5 text-zinc-500">
                      To: {managementDraft.to.map((member) => member.name).join(", ") || "None"} · CC: {managementDraft.cc.map((member) => member.name).join(", ") || "None"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`rounded-full border px-3 py-1 text-xs ${managementDraft.enabled ? "border-emerald-300/30 text-emerald-200" : "border-white/10 text-zinc-500"}`}>{managementDraft.enabled ? "Enabled" : "Disabled"}</span>
                    <button type="button" onClick={async () => { setManagementExpanded(expanded ? null : managementDraft.key); if (!managementDetailsLoaded) await load(true); }} aria-expanded={expanded} className="min-h-10 rounded-full border border-[#D8C36A]/35 px-4 text-xs font-bold uppercase tracking-[0.08em] text-[#F2D66C]">
                      {expanded ? "Close" : "Edit Settings"}
                    </button>
                  </div>
                </div>
              {expanded && (
              <div className="mt-4 rounded-lg border border-[#D8C36A]/20 bg-black/30 p-4">
                <label className="flex min-h-11 items-center justify-between gap-3 text-sm text-white">
                  Email enabled
                  <input
                    type="checkbox"
                    aria-label={`Enable ${label}`}
                    checked={managementDraft.enabled}
                    disabled={loading}
                    onChange={(event) => updateManagement(managementDraft.key, (current) => ({ ...current, enabled: event.target.checked }))}
                    className="h-5 w-5 accent-[#D8C36A]"
                  />
                </label>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {(["to", "cc"] as const).map((placement) => (
                  <fieldset key={placement} className="rounded-lg border border-white/10 p-3">
                    <legend className="px-1 text-xs font-semibold uppercase tracking-[0.12em] text-[#D8C36A]">{placement}</legend>
                    <div className="mt-2 space-y-2">
                      {payload.staffOptions.map((staff) => (
                        <label key={`${placement}-${staff.id}`} className="flex items-start gap-2 text-sm text-zinc-300">
                          <input
                            type="checkbox"
                            checked={(placement === "to" ? managementDraft.to : managementDraft.cc).some((member) => member.id === staff.id)}
                            disabled={loading}
                            onChange={() => setRecipient(managementDraft.key, staff, placement)}
                            className="mt-1 h-4 w-4 accent-[#D8C36A]"
                          />
                          <span className="min-w-0"><strong className="block truncate text-white">{staff.name}</strong><span className="block break-all text-xs text-zinc-500">{staff.email}</span></span>
                        </label>
                      ))}
                    </div>
                  </fieldset>
                ))}
                </div>
                <button
                type="button"
                onClick={() => void saveManagement(managementDraft)}
                disabled={loading || (managementDraft.enabled && managementDraft.to.length === 0)}
                className="mt-4 min-h-11 rounded-full bg-[#D8C36A] px-5 py-2 text-xs font-bold uppercase tracking-[0.1em] text-black transition hover:bg-[#F2D66C] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {loading ? "Saving..." : "Save Email Routing"}
              </button>
              </div>
              )}
              </div>;
            })}
            </div>
          ) : (
            <p className="mt-4 rounded-lg border border-white/10 p-3 text-sm leading-6 text-zinc-400">
              Only authorised management can change required recipients, CC routing, or organisation-wide email settings.
            </p>
          )}
        </div>
        )}
      </div>

      <p className="mt-4 text-xs leading-5 text-zinc-500">
        Review alerts, daily review summaries, Dineplan action emails and guest journeys retain their existing protected workflow settings.
      </p>
      {status && <p role="status" className="mt-4 rounded-lg border border-emerald-300/25 bg-emerald-950/20 p-3 text-sm text-emerald-200">{status}</p>}
      {error && <p role="alert" className="mt-4 rounded-lg border border-red-300/25 bg-red-950/20 p-3 text-sm text-red-200">{error}</p>}
      {loading && !payload && <p className="mt-4 text-sm text-zinc-500">Loading email settings...</p>}
    </section>
  );
}
