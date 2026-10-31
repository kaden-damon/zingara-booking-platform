"use client";

import { useCallback, useEffect, useState } from "react";
import { getAdminAuthSession } from "@/lib/supabase/auth";

type PersonalSetting = {
  description: string;
  enabled: boolean;
  key:
    | "daily-booking-review"
    | "daily-waitlist-reminder"
    | "new-waitlist-enquiry"
    | "secret-guest-list";
  label: string;
  mode: "personal";
};

type Recipient = { email: string; id: string; name: string };
type StaffOption = Recipient & { venueScope: string[] };
type ManagementSetting = {
  cc: Recipient[];
  enabled: boolean;
  key:
    | "corporate-enquiry"
    | "daily-waitlist-reminder"
    | "invoice-request-reminders"
    | "new-review-alert"
    | "new-waitlist-enquiry"
    | "secret-guest-list";
  to: Recipient[];
};
type Payload = {
  bookingExperienceFeedback: { enabled: boolean; status: string } | null;
  canManageOrganisation: boolean;
  management: ManagementSetting[];
  personal: PersonalSetting[];
  staffOptions: StaffOption[];
};

const workflowCopy: Record<
  ManagementSetting["key"],
  { description: string; label: string }
> = {
  "corporate-enquiry": {
    description: "Alerts the responsible team when a new Corporate enquiry arrives.",
    label: "New Corporate Enquiries",
  },
  "daily-waitlist-reminder": {
    description: "Sends the morning summary of outstanding Waitlist enquiries.",
    label: "Daily Waitlist Reminder",
  },
  "invoice-request-reminders": {
    description: "Sends the morning summary of accepted quotations awaiting Accounts.",
    label: "Invoice Request Reminders",
  },
  "new-review-alert": {
    description: "Alerts the review team when a guest submits a review.",
    label: "New Review Alerts",
  },
  "new-waitlist-enquiry": {
    description: "Alerts Box Office when a guest joins the standard Waitlist.",
    label: "New Waitlist Enquiry",
  },
  "secret-guest-list": {
    description: "Alerts Box Office when a guest asks about a sold-out performance.",
    label: "Secret Guest List",
  },
};

const workflowGroups: Array<{
  keys: ManagementSetting["key"][];
  label: string;
}> = [
  {
    keys: ["secret-guest-list", "new-waitlist-enquiry", "daily-waitlist-reminder"],
    label: "Waitlist",
  },
  {
    keys: ["corporate-enquiry", "invoice-request-reminders"],
    label: "Bookings & Accounts",
  },
  { keys: ["new-review-alert"], label: "Guest Feedback" },
];

function Toggle({
  checked,
  disabled,
  label,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  label: string;
  onChange: (enabled: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`flex h-7 w-[3.75rem] shrink-0 items-center rounded-full border px-1 transition ${
        checked
          ? "justify-end border-emerald-300/40 bg-emerald-300/15 text-emerald-100"
          : "justify-start border-white/15 bg-black/40 text-zinc-500"
      } disabled:cursor-not-allowed disabled:opacity-45`}
    >
      <span className="flex h-5 min-w-6 items-center justify-center rounded-full bg-current px-1 text-[0.58rem] font-bold text-black">
        {checked ? "ON" : "OFF"}
      </span>
    </button>
  );
}

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

  async function saveBookingExperienceFeedback(enabled: boolean) {
    setError("");
    setStatus("");
    setLoading(true);
    try {
      const response = await authorisedRequest({
        body: JSON.stringify({ action: "booking-feedback-automation", enabled }),
        method: "PATCH",
      });
      const next = (await response.json()) as Payload & { error?: string };
      if (!response.ok) throw new Error(next.error ?? "The email setting couldn't be saved.");
      setPayload(next);
      setManagementDrafts(next.management);
      setStatus(`Booking Experience Feedback ${enabled ? "enabled" : "disabled"}.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The email setting couldn't be saved.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="rounded-lg border border-[#D8C36A]/30 bg-zinc-950/80 p-4 sm:p-5">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-white/10 pb-4">
        <div>
          <p className="text-xs font-semibold uppercase text-[#D8C36A]">Staff Emails</p>
          <h2 className="mt-1 text-xl font-bold text-white">Notification settings</h2>
        </div>
        <p className="max-w-xl text-xs leading-5 text-zinc-500">
          Your switches affect only you. Organisation switches and recipients require management access.
        </p>
      </div>

      {showPersonal && (
        <div className="py-4">
          <h3 className="text-sm font-semibold text-white">Your notifications</h3>
          <div className="mt-2 divide-y divide-white/10 rounded-lg border border-white/10 bg-black/25">
            {payload?.personal.map((setting) => (
              <div key={setting.key} className="flex min-h-14 items-center justify-between gap-4 px-3 py-2.5 sm:px-4">
                <span className="min-w-0">
                  <strong className="block text-sm text-white">{setting.label}</strong>
                  <span className="block text-xs leading-5 text-zinc-500">{setting.description}</span>
                </span>
                <Toggle
                  checked={setting.enabled}
                  disabled={loading}
                  label={`${setting.label} for me`}
                  onChange={(enabled) => void savePersonal(setting, enabled)}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {showManagement && (
        <div className={showPersonal ? "border-t border-white/10 pt-4" : "pt-4"}>
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-white">Organisation workflows</h3>
            {!payload?.canManageOrganisation && (
              <span className="text-xs text-zinc-500">View only</span>
            )}
          </div>

          <div className="mt-2 space-y-4">
            {workflowGroups.map((group) => (
              <div key={group.label}>
                <p className="mb-1.5 text-[0.68rem] font-semibold uppercase text-zinc-500">{group.label}</p>
                <div className="divide-y divide-white/10 rounded-lg border border-white/10 bg-black/25">
                  {group.keys.map((key) => {
                    const draft = managementDrafts.find((item) => item.key === key);
                    if (!draft) return null;
                    const copy = workflowCopy[key];
                    const expanded = managementExpanded === key;
                    return (
                      <div key={key} className="px-3 py-2.5 sm:px-4">
                        <div className="flex min-h-10 items-center justify-between gap-3">
                          <div className="min-w-0">
                            <strong className="block text-sm text-white">{copy.label}</strong>
                            <p className="text-xs leading-5 text-zinc-500">{copy.description}</p>
                            {payload?.canManageOrganisation && (
                              <p className="truncate text-[0.68rem] text-zinc-600">
                                To: {draft.to.map((member) => member.name).join(", ") || "None"} · CC: {draft.cc.map((member) => member.name).join(", ") || "None"}
                              </p>
                            )}
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            {payload?.canManageOrganisation && (
                              <button
                                type="button"
                                aria-expanded={expanded}
                                onClick={async () => {
                                  setManagementExpanded(expanded ? null : key);
                                  if (!managementDetailsLoaded) await load(true);
                                }}
                                className="min-h-9 rounded-full border border-white/15 px-3 text-xs font-semibold text-zinc-300"
                              >
                                {expanded ? "Close" : "Edit"}
                              </button>
                            )}
                            <Toggle
                              checked={draft.enabled}
                              disabled={loading || !payload?.canManageOrganisation}
                              label={`${copy.label} organisation workflow`}
                              onChange={(enabled) => void saveManagement({ ...draft, enabled })}
                            />
                          </div>
                        </div>

                        {expanded && payload?.canManageOrganisation && (
                          <div className="mt-3 border-t border-white/10 pt-3">
                            <div className="grid gap-3 sm:grid-cols-2">
                              {(["to", "cc"] as const).map((placement) => (
                                <fieldset key={placement} className="rounded-lg border border-white/10 p-3">
                                  <legend className="px-1 text-xs font-semibold uppercase text-[#D8C36A]">{placement}</legend>
                                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                                    {payload.staffOptions.map((staff) => (
                                      <label key={`${placement}-${staff.id}`} className="flex min-w-0 items-start gap-2 text-sm text-zinc-300">
                                        <input
                                          type="checkbox"
                                          checked={(placement === "to" ? draft.to : draft.cc).some((member) => member.id === staff.id)}
                                          disabled={loading}
                                          onChange={() => setRecipient(key, staff, placement)}
                                          className="mt-1 h-4 w-4 accent-[#D8C36A]"
                                        />
                                        <span className="min-w-0 truncate">{staff.name}</span>
                                      </label>
                                    ))}
                                  </div>
                                </fieldset>
                              ))}
                            </div>
                            <button
                              type="button"
                              onClick={() => void saveManagement(draft)}
                              disabled={loading || (draft.enabled && draft.to.length === 0)}
                              className="mt-3 min-h-10 rounded-full bg-[#D8C36A] px-4 text-xs font-bold text-black disabled:opacity-40"
                            >
                              {loading ? "Saving..." : "Save Recipients"}
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}

            {payload?.canManageOrganisation && payload.bookingExperienceFeedback && (
              <div>
                <p className="mb-1.5 text-[0.68rem] font-semibold uppercase text-zinc-500">Campaigns</p>
                <div className="flex min-h-14 items-center justify-between gap-4 rounded-lg border border-white/10 bg-black/25 px-3 py-2.5 sm:px-4">
                  <span>
                    <strong className="block text-sm text-white">Booking Experience Feedback</strong>
                    <span className="block text-xs leading-5 text-zinc-500">
                      Approval-gated invitations · {payload.bookingExperienceFeedback.status.replaceAll("_", " ")}
                    </span>
                  </span>
                  <Toggle
                    checked={payload.bookingExperienceFeedback.enabled}
                    disabled={loading}
                    label="Booking Experience Feedback automation"
                    onChange={(enabled) => void saveBookingExperienceFeedback(enabled)}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {status && <p role="status" className="mt-4 rounded-lg border border-emerald-300/25 bg-emerald-950/20 p-3 text-sm text-emerald-200">{status}</p>}
      {error && <p role="alert" className="mt-4 rounded-lg border border-red-300/25 bg-red-950/20 p-3 text-sm text-red-200">{error}</p>}
      {loading && !payload && <p className="mt-4 text-sm text-zinc-500">Loading email settings...</p>}
    </section>
  );
}
