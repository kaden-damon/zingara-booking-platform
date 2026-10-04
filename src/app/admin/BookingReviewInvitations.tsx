"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchSupabaseApi } from "@/lib/supabase/apiClient";

type Invitation = {
  createdAt: string;
  id: string;
  invitationType: "manual_email" | "manual_link";
  recipientName: string;
  revision: number;
  sentAt: string | null;
  status: string;
  submittedAt: string | null;
};

type InvitationList = {
  eligible: boolean;
  invitations: Invitation[];
  reason: string | null;
};

type Props = {
  bookingReference: string;
};

export default function BookingReviewInvitations({ bookingReference }: Props) {
  const [data, setData] = useState<InvitationList | null>(null);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState<"copy" | "revoke" | "send" | "">("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    try {
      const result = await fetchSupabaseApi<InvitationList>(
        `/api/admin/bookings/review-invitations?bookingReference=${encodeURIComponent(bookingReference)}`,
        { cache: "no-store" },
      );
      setData(result);
    } catch {
      setData(null);
    }
  }, [bookingReference]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function run(action: "create_link" | "send_email") {
    setBusy(action === "send_email" ? "send" : "copy");
    setMessage("");
    try {
      const result = await fetchSupabaseApi<{ reviewUrl?: string }>(
        "/api/admin/bookings/review-invitations",
        {
          body: { action, bookingReference, email, name },
          method: "POST",
        },
      );
      if (action === "create_link" && result.reviewUrl) {
        await navigator.clipboard.writeText(result.reviewUrl);
        setMessage("Secure review link copied.");
      } else {
        setMessage("Review request sent.");
        setEmail("");
        setName("");
      }
      setOpen(false);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The review invitation could not be prepared.");
    } finally {
      setBusy("");
    }
  }

  async function copyExisting(invitationId: string) {
    setBusy("copy");
    setMessage("");
    try {
      const result = await fetchSupabaseApi<{ reviewUrl: string }>(
        "/api/admin/bookings/review-invitations",
        {
          body: { action: "copy_existing", bookingReference, invitationId },
          method: "POST",
        },
      );
      await navigator.clipboard.writeText(result.reviewUrl);
      setMessage("Secure review link copied.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The review link could not be copied.");
    } finally {
      setBusy("");
    }
  }

  async function revoke(invitation: Invitation) {
    if (!window.confirm(`Revoke the review invitation for ${invitation.recipientName}?`)) return;
    setBusy("revoke");
    setMessage("");
    try {
      await fetchSupabaseApi("/api/admin/bookings/review-invitations", {
        body: {
          action: "revoke",
          bookingReference,
          invitationId: invitation.id,
          revision: invitation.revision,
        },
        method: "POST",
      });
      setMessage("Review invitation revoked.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The review invitation could not be revoked.");
    } finally {
      setBusy("");
    }
  }

  if (!data) return null;
  if (!data.eligible && data.invitations.length === 0) return null;

  return (
    <section className="mt-3 rounded-2xl border border-white/10 bg-black/30 p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
            Review Invitations
          </p>
          <p className="mt-1 text-sm text-zinc-400">
            {data.invitations.length === 0
              ? "No attendee invitations yet."
              : `${data.invitations.length} attendee invitation${data.invitations.length === 1 ? "" : "s"}`}
          </p>
        </div>
        {data.eligible && (
          <button
            className="rounded-full border border-[#D8C36A]/40 px-4 py-2 text-xs font-semibold uppercase tracking-[0.08em] text-[#F2D66C] transition hover:bg-[#D8C36A] hover:text-black"
            onClick={() => {
              setMessage("");
              setOpen(true);
            }}
            type="button"
          >
            Send Review
          </button>
        )}
      </div>

      {data.invitations.length > 0 && (
        <div className="mt-3 space-y-2">
          {data.invitations.slice(0, 6).map((invitation) => (
            <div
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-zinc-950 px-3 py-2 text-sm"
              key={invitation.id}
            >
              <p className="text-zinc-300">
                <span className="font-semibold text-white">{invitation.recipientName}</span>
                {" · "}{invitation.status}
              </p>
              <div className="flex items-center gap-3">
                {!["Expired", "Review received", "Revoked"].includes(invitation.status) && (
                  <button
                    className="text-xs font-semibold uppercase tracking-[0.08em] text-[#F2D66C] hover:text-white disabled:opacity-50"
                    disabled={busy !== ""}
                    onClick={() => void copyExisting(invitation.id)}
                    type="button"
                  >
                    Copy Link
                  </button>
                )}
                {!["Review received", "Revoked"].includes(invitation.status) && (
                  <button
                    className="text-xs font-semibold uppercase tracking-[0.08em] text-rose-300 hover:text-white disabled:opacity-50"
                    disabled={busy !== ""}
                    onClick={() => void revoke(invitation)}
                    type="button"
                  >
                    Revoke
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      {message && !open && <p className="mt-3 text-sm text-[#F3E5A0]">{message}</p>}

      {open && (
        <div
          aria-modal="true"
          className="fixed inset-0 z-[80] grid place-items-center bg-black/80 p-4"
          role="dialog"
        >
          <div className="w-full max-w-md rounded-2xl border border-[#D8C36A]/35 bg-[#0a0a0a] p-5 shadow-2xl">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#D8C36A]">Send Review</p>
                <h3 className="mt-1 text-xl font-semibold text-white">Invite an attendee</h3>
              </div>
              <button
                aria-label="Close review invitation"
                className="h-9 w-9 rounded-full border border-white/15 text-zinc-300 hover:bg-white hover:text-black"
                onClick={() => setOpen(false)}
                type="button"
              >
                ×
              </button>
            </div>
            <label className="mt-5 block text-xs font-semibold uppercase tracking-[0.08em] text-zinc-500">
              Name
              <input
                className="mt-2 w-full rounded-xl border border-white/15 bg-black px-4 py-3 text-base font-normal normal-case tracking-normal text-white outline-none focus:border-[#D8C36A]"
                maxLength={100}
                onChange={(event) => setName(event.target.value)}
                required
                value={name}
              />
            </label>
            <label className="mt-4 block text-xs font-semibold uppercase tracking-[0.08em] text-zinc-500">
              Email
              <input
                className="mt-2 w-full rounded-xl border border-white/15 bg-black px-4 py-3 text-base font-normal normal-case tracking-normal text-white outline-none focus:border-[#D8C36A]"
                inputMode="email"
                maxLength={254}
                onChange={(event) => setEmail(event.target.value)}
                type="email"
                value={email}
              />
            </label>
            {name.trim() && email.trim() && (
              <div className="mt-4 rounded-xl border border-[#D8C36A]/20 bg-[#D8C36A]/[0.06] p-3 text-sm text-zinc-300">
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#D8C36A]">Send review request to</p>
                <p className="mt-1 font-semibold text-white">{name.trim()}</p>
                <p>{email.trim()}</p>
              </div>
            )}
            {message && <p className="mt-4 text-sm text-[#F3E5A0]" role="status">{message}</p>}
            <div className="mt-5 flex flex-wrap gap-2">
              <button
                className="rounded-full bg-[#D8C36A] px-5 py-2.5 text-xs font-bold uppercase tracking-[0.08em] text-black disabled:opacity-50"
                disabled={busy !== "" || !name.trim() || !email.trim()}
                onClick={() => void run("send_email")}
                type="button"
              >
                {busy === "send" ? "Sending..." : "Send Review"}
              </button>
              <button
                className="rounded-full border border-white/20 px-5 py-2.5 text-xs font-semibold uppercase tracking-[0.08em] text-white disabled:opacity-50"
                disabled={busy !== "" || !name.trim()}
                onClick={() => void run("create_link")}
                type="button"
              >
                {busy === "copy" ? "Copying..." : "Copy Review Link"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
