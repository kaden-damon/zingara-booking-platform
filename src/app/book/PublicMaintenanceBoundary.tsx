"use client";

import Link from "next/link";
import { type FormEvent, type ReactNode, useEffect, useState } from "react";
import type { PlatformMaintenanceConfig } from "@/lib/platformMaintenance";

type PublicMaintenance = PlatformMaintenanceConfig["public"];

const emptyForm = {
  email: "",
  fullName: "",
  mobile: "",
  notes: "",
  pax: "",
  preferredCity: "",
  preferredShowDate: "",
  seatingPreference: "",
};

export default function PublicMaintenanceBoundary({
  children,
}: {
  children: ReactNode;
}) {
  const [maintenance, setMaintenance] = useState<PublicMaintenance | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [submitState, setSubmitState] = useState<
    "error" | "idle" | "saving" | "success"
  >("idle");
  const [statusMessage, setStatusMessage] = useState("");

  useEffect(() => {
    let active = true;

    async function refresh() {
      try {
        const response = await fetch("/api/platform-maintenance", {
          cache: "no-store",
        });
        const payload = (await response.json()) as {
          public?: PublicMaintenance;
        };

        if (active && payload.public) setMaintenance(payload.public);
      } catch {
        // Mutation endpoints remain authoritative if this display request fails.
      }
    }

    void refresh();
    const interval = window.setInterval(() => void refresh(), 60_000);
    const onVisibility = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      active = false;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  async function submitEnquiry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitState === "saving") return;

    setSubmitState("saving");
    setStatusMessage("");

    try {
      const response = await fetch("/api/maintenance-booking-enquiries", {
        body: JSON.stringify({ ...form, pax: Number(form.pax) }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const payload = (await response.json().catch(() => ({}))) as {
        enquiry?: { reference?: string };
        error?: string;
      };

      if (!response.ok) throw new Error(payload.error ?? "Enquiry could not be saved.");

      setForm(emptyForm);
      setSubmitState("success");
      setStatusMessage(
        `Enquiry received${payload.enquiry?.reference ? ` · ${payload.enquiry.reference}` : ""}. Our Box Office team will contact you.`,
      );
    } catch (error) {
      setSubmitState("error");
      setStatusMessage(
        error instanceof Error ? error.message : "Enquiry could not be saved.",
      );
    }
  }

  if (!maintenance?.enabled) return children;

  if (maintenance.scope === "payments") {
    return (
      <>
        <div
          role="status"
          className="fixed inset-x-3 top-3 z-[90] mx-auto max-w-3xl rounded-2xl border border-amber-300/45 bg-black/95 px-4 py-3 text-center text-sm text-amber-100 shadow-2xl backdrop-blur sm:top-5"
        >
          Secure online payments are temporarily unavailable. Existing bookings and tickets remain accessible.
        </div>
        {children}
      </>
    );
  }

  const fields = [
    ["fullName", "Full Name *", "text"],
    ["mobile", "Mobile Number *", "tel"],
    ["email", "Email Address *", "email"],
    ["preferredShowDate", "Preferred Show / Date", "text"],
    ["pax", "Pax *", "number"],
    ["seatingPreference", "Seating Preference", "text"],
  ] as const;

  return (
    <main className="min-h-screen overflow-x-hidden bg-black px-4 py-8 text-white sm:px-6 sm:py-14">
      <div className="mx-auto w-full max-w-3xl space-y-6">
        <section
          aria-labelledby="public-maintenance-heading"
          className="rounded-3xl border border-[#D8C36A]/45 bg-zinc-950 p-5 shadow-[0_0_60px_rgba(216,195,106,0.14)] sm:p-8"
        >
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#D8C36A]">
            Zingara Box Office
          </p>
          <h1
            id="public-maintenance-heading"
            className="mt-3 text-3xl font-bold leading-tight sm:text-5xl"
          >
            {maintenance.heading}
          </h1>
          <p className="mt-5 text-base leading-7 text-zinc-300 sm:text-lg">
            {maintenance.message}
          </p>
          <a
            href={`mailto:${maintenance.contactEmail}`}
            className="mt-5 inline-flex min-h-12 items-center text-sm font-semibold text-[#F2D66C] underline decoration-[#D8C36A]/40 underline-offset-4"
          >
            {maintenance.contactEmail}
          </a>
          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/find-booking"
              className="inline-flex min-h-12 items-center justify-center rounded-full bg-[#D8C36A] px-6 py-3 text-sm font-bold text-black transition hover:bg-[#F2D66C]"
            >
              Find My Booking
            </Link>
            <Link
              href="/royal-decrees"
              className="inline-flex min-h-12 items-center justify-center rounded-full border border-white/15 px-6 py-3 text-sm font-semibold text-zinc-200 transition hover:bg-white hover:text-black"
            >
              Legal Centre
            </Link>
          </div>
        </section>

        {maintenance.enquiryFormEnabled && (
          <section className="rounded-3xl border border-white/10 bg-zinc-950 p-5 sm:p-8">
            <h2 className="text-2xl font-bold">Booking Enquiry</h2>
            <p className="mt-2 text-sm leading-6 text-zinc-400">
              Submitting this enquiry does not confirm a booking. Our Box Office team will contact you to assist.
            </p>
            <form onSubmit={submitEnquiry} className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
              {fields.map(([field, label, type]) => (
                <label key={field} className="text-sm font-semibold text-zinc-300">
                  {label}
                  <input
                    type={type}
                    required={["email", "fullName", "mobile", "pax"].includes(field)}
                    min={field === "pax" ? 1 : undefined}
                    max={field === "pax" ? 500 : undefined}
                    value={form[field]}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, [field]: event.target.value }))
                    }
                    className="mt-2 min-h-12 w-full rounded-xl border border-white/15 bg-black px-4 py-3 text-base text-white outline-none transition focus:border-[#D8C36A]"
                  />
                </label>
              ))}
              <label className="text-sm font-semibold text-zinc-300">
                Preferred City *
                <select
                  required
                  value={form.preferredCity}
                  onChange={(event) => setForm((current) => ({ ...current, preferredCity: event.target.value }))}
                  className="mt-2 min-h-12 w-full rounded-xl border border-white/15 bg-black px-4 py-3 text-base text-white outline-none focus:border-[#D8C36A]"
                >
                  <option value="">Select city</option>
                  <option value="Cape Town">Cape Town</option>
                  <option value="Johannesburg">Johannesburg</option>
                </select>
              </label>
              <label className="text-sm font-semibold text-zinc-300 sm:col-span-2">
                Notes
                <textarea
                  rows={4}
                  value={form.notes}
                  onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
                  className="mt-2 w-full resize-y rounded-xl border border-white/15 bg-black px-4 py-3 text-base text-white outline-none focus:border-[#D8C36A]"
                />
              </label>
              {statusMessage && (
                <p
                  role="status"
                  className={`sm:col-span-2 ${submitState === "error" ? "text-red-300" : "text-emerald-300"}`}
                >
                  {statusMessage}
                </p>
              )}
              <button
                type="submit"
                disabled={submitState === "saving"}
                className="min-h-12 rounded-full bg-[#D8C36A] px-6 py-3 font-bold text-black transition hover:bg-[#F2D66C] disabled:cursor-wait disabled:opacity-60 sm:col-span-2"
              >
                {submitState === "saving" ? "Submitting..." : "Submit Enquiry"}
              </button>
            </form>
          </section>
        )}
      </div>
    </main>
  );
}
