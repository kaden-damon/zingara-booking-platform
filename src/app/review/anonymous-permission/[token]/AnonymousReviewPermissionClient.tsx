"use client";

import { useEffect, useState } from "react";

export default function AnonymousReviewPermissionClient({ token }: { token: string }) {
  const [status, setStatus] = useState<"loading" | "ready" | "saving" | "granted" | "declined" | "unavailable">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    fetch(`/api/reviews/anonymous-permission/${encodeURIComponent(token)}`, { cache: "no-store" })
      .then(async (response) => {
        const payload = (await response.json()) as { error?: string; status?: string };
        if (!response.ok) throw new Error(payload.error || "This permission link is unavailable.");
        if (!active) return;
        if (payload.status === "granted" || payload.status === "declined") setStatus(payload.status);
        else setStatus("ready");
      })
      .catch((error: unknown) => {
        if (!active) return;
        setMessage(error instanceof Error ? error.message : "This permission link is unavailable.");
        setStatus("unavailable");
      });
    return () => { active = false; };
  }, [token]);

  async function respond(granted: boolean) {
    setStatus("saving");
    setMessage("");
    try {
      const response = await fetch(`/api/reviews/anonymous-permission/${encodeURIComponent(token)}`, {
        body: JSON.stringify({ granted }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Your choice could not be saved.");
      setStatus(granted ? "granted" : "declined");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Your choice could not be saved.");
      setStatus("ready");
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-[#050505] px-4 py-10 text-white">
      <section className="w-full max-w-xl rounded-2xl border border-[#D8C36A]/25 bg-[#0b0b0b] p-6 shadow-2xl shadow-black/40 sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#D8C36A]">Your review privacy</p>
        <h1 className="mt-3 text-2xl font-semibold">May we publish your review anonymously?</h1>
        <p className="mt-3 text-sm leading-6 text-zinc-400">Your name, contact details and booking reference will not be shown. Choosing no keeps your review private.</p>

        {status === "loading" || status === "saving" ? (
          <p className="mt-7 text-sm text-zinc-400">{status === "saving" ? "Saving your choice..." : "Opening your permission request..."}</p>
        ) : status === "granted" ? (
          <p className="mt-7 rounded-xl border border-emerald-400/25 bg-emerald-400/[0.06] p-4 text-sm text-emerald-100">Thank you. Your review may be published as Anonymous after moderation.</p>
        ) : status === "declined" ? (
          <p className="mt-7 rounded-xl border border-white/10 p-4 text-sm text-zinc-300">Your review will remain private.</p>
        ) : status === "unavailable" ? (
          <p className="mt-7 text-sm text-red-200" role="alert">{message}</p>
        ) : (
          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <button className="min-h-12 rounded-full bg-[#D8C36A] px-6 py-3 text-sm font-bold text-black hover:bg-[#F2D66C] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F2D66C]" onClick={() => void respond(true)} type="button">Yes, publish anonymously</button>
            <button className="min-h-12 rounded-full border border-white/20 px-6 py-3 text-sm font-semibold text-white hover:border-white/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white" onClick={() => void respond(false)} type="button">No, keep it private</button>
          </div>
        )}
        {message && status === "ready" ? <p className="mt-4 text-sm text-red-200" role="alert">{message}</p> : null}
      </section>
    </main>
  );
}
