"use client";

import { useEffect, useState } from "react";

type AttendanceResponse = "confirmed" | "declined";
type AttendanceContext = {
  attendanceResponse: AttendanceResponse | null;
  bookingReference: string;
  firstName: string;
  guestCount: number;
  performanceDate: string;
  performanceName: string;
  performanceTime: string;
  venue: string;
};

function venueLabel(value: string) {
  return value === "johannesburg" ? "Johannesburg" : "Cape Town";
}

export default function AttendanceResponseClient({
  initialResponse,
  token,
}: {
  initialResponse: AttendanceResponse | null;
  token: string;
}) {
  const [attendance, setAttendance] = useState<AttendanceContext | null>(null);
  const [choice, setChoice] = useState<AttendanceResponse | null>(initialResponse);
  const [status, setStatus] = useState<"loading" | "ready" | "saving" | "saved" | "unavailable">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    fetch(`/api/attendance/${encodeURIComponent(token)}`, { cache: "no-store" })
      .then(async (response) => {
        const payload = (await response.json()) as { attendance?: AttendanceContext; error?: string };
        if (!response.ok || !payload.attendance) throw new Error(payload.error || "This link is unavailable.");
        if (active) {
          setAttendance(payload.attendance);
          setChoice(initialResponse ?? payload.attendance.attendanceResponse);
          setStatus("ready");
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setMessage(error instanceof Error ? error.message : "This link is unavailable.");
          setStatus("unavailable");
        }
      });
    return () => { active = false; };
  }, [initialResponse, token]);

  async function saveResponse() {
    if (!choice) return;
    setStatus("saving");
    setMessage("");
    try {
      const response = await fetch(`/api/attendance/${encodeURIComponent(token)}`, {
        body: JSON.stringify({ response: choice }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Your response could not be saved.");
      setStatus("saved");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Your response could not be saved.");
      setStatus("ready");
    }
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#201405_0%,#080808_42%,#050505_100%)] px-4 py-8 text-white sm:py-12">
      <section className="mx-auto w-full max-w-xl rounded-[1.5rem] border border-[#D8C36A]/30 bg-black/55 p-5 text-center shadow-2xl shadow-black/40 sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#D8C36A]">The Royal Countess Zingara</p>
        {status === "loading" && <p className="mt-8 text-sm text-zinc-400">Opening your booking...</p>}
        {status === "unavailable" && <><h1 className="mt-5 text-2xl font-semibold">This link is unavailable</h1><p className="mt-3 text-sm text-zinc-400">{message}</p></>}
        {status === "saved" && <><h1 className="mt-5 text-2xl font-semibold">Thank you, {attendance?.firstName}.</h1><p className="mt-3 text-sm leading-6 text-zinc-300">Your response has been saved. Your booking remains unchanged.</p></>}
        {(status === "ready" || status === "saving") && attendance && <>
          <h1 className="mt-5 text-2xl font-semibold">Will you be joining us?</h1>
          <p className="mt-3 text-sm leading-6 text-zinc-400">{attendance.performanceName} · {venueLabel(attendance.venue)}<br />{attendance.performanceDate} at {attendance.performanceTime} · {attendance.guestCount} guests</p>
          <div className="mt-7 grid gap-3 sm:grid-cols-2">
            <button type="button" onClick={() => setChoice("confirmed")} className={`rounded-full border px-4 py-3 text-sm font-bold ${choice === "confirmed" ? "border-emerald-300 bg-emerald-300 text-black" : "border-white/20 text-white"}`}>YES — I&apos;LL BE THERE</button>
            <button type="button" onClick={() => setChoice("declined")} className={`rounded-full border px-4 py-3 text-sm font-bold ${choice === "declined" ? "border-zinc-300 bg-zinc-200 text-black" : "border-white/20 text-white"}`}>NO — I CAN&apos;T MAKE IT</button>
          </div>
          <button type="button" disabled={!choice || status === "saving"} onClick={saveResponse} className="mt-5 w-full rounded-full bg-[#D8C36A] px-5 py-3 text-sm font-bold text-black disabled:opacity-40">{status === "saving" ? "SAVING..." : "CONFIRM RESPONSE"}</button>
          {message && <p className="mt-4 text-sm text-amber-200" role="alert">{message}</p>}
          <p className="mt-5 text-xs leading-5 text-zinc-500">This response does not cancel your booking, release your table or mark your party as arrived.</p>
        </>}
      </section>
    </main>
  );
}
