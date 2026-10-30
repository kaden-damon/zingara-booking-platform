"use client";

import { useEffect, useState } from "react";

type SubmissionResponse = {
  duplicate?: boolean;
  entry?: { id: string };
  error?: string;
};

export default function SecretGuestListPanel({
  initialPartySize,
  onClose,
  open,
  performanceLabel,
  showId,
  venueLabel,
}: {
  initialPartySize: number;
  onClose: () => void;
  open: boolean;
  performanceLabel: string;
  showId: string;
  venueLabel: string;
}) {
  const [firstName, setFirstName] = useState("");
  const [surname, setSurname] = useState("");
  const [email, setEmail] = useState("");
  const [mobile, setMobile] = useState("");
  const [partySize, setPartySize] = useState(
    Math.min(19, Math.max(1, initialPartySize)),
  );
  const [status, setStatus] = useState<"idle" | "submitting" | "success">("idle");
  const [message, setMessage] = useState("");
  const [reference, setReference] = useState("");

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [initialPartySize, onClose, open, showId]);

  if (!open) return null;

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("submitting");
    setMessage("");

    try {
      const response = await fetch("/api/waitlist", {
        body: JSON.stringify({
          email,
          firstName,
          mobile,
          partySize,
          showId,
          surname,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const result = (await response.json()) as SubmissionResponse;
      if (!response.ok || !result.entry) {
        throw new Error(result.error ?? "We couldn't save your request. Please try again.");
      }

      setReference(result.entry.id);
      setMessage(
        result.duplicate
          ? "You're already on the list for this performance. We'll be in touch if room opens up."
          : "You're on the list. We'll be in touch if we can make a little magic happen.",
      );
      setStatus("success");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "We couldn't save your request. Please try again.",
      );
      setStatus("idle");
    }
  }

  const fieldClass =
    "mt-1.5 h-12 w-full rounded-xl border border-white/15 bg-black px-3.5 text-base text-white outline-none transition placeholder:text-zinc-600 focus:border-[#D8C36A]";

  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/75 p-0 backdrop-blur-sm sm:items-center sm:p-5" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section aria-labelledby="secret-guest-list-title" aria-modal="true" className="max-h-[100dvh] w-full overflow-y-auto rounded-t-2xl border border-[#D8C36A]/35 bg-[#080706] px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 shadow-2xl sm:max-w-lg sm:rounded-2xl sm:p-6" role="dialog">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#D8C36A]">The Secret Guest List</p>
            <h2 className="mt-1.5 text-2xl font-bold text-white" id="secret-guest-list-title">Sold out? Not so fast…</h2>
          </div>
          <button aria-label="Close" className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-white/15 text-2xl text-white transition hover:border-[#D8C36A] hover:text-[#F2D66C]" onClick={onClose} type="button">×</button>
        </div>

        {status === "success" ? (
          <div className="mt-6 rounded-xl border border-emerald-400/30 bg-emerald-950/25 p-5" role="status">
            <p className="text-sm font-bold uppercase tracking-[0.12em] text-emerald-300">Request received</p>
            <p className="mt-2 leading-6 text-white">{message}</p>
            <p className="mt-3 text-sm text-zinc-400">Reference: {reference}</p>
            <button className="mt-5 min-h-12 w-full rounded-full bg-white px-5 font-semibold text-black transition hover:bg-zinc-200" onClick={onClose} type="button">Done</button>
          </div>
        ) : (
          <>
            <p className="mt-3 text-sm leading-6 text-zinc-300">The tent may be full, but we might just have a trick up our sleeve. Tell us when you&apos;d like to join the magic and how many seats you&apos;re after. We&apos;ll see if we can squeeze you in!</p>
            <div className="mt-4 rounded-xl border border-[#D8C36A]/20 bg-[#D8C36A]/5 p-3.5">
              <p className="font-semibold text-white">{performanceLabel}</p>
              <p className="mt-1 text-sm text-zinc-400">{venueLabel}</p>
            </div>

            <form className="mt-5 space-y-4" onSubmit={submit}>
              <label className="block text-sm font-semibold text-zinc-200">
                Number of guests
                <input className={fieldClass} inputMode="numeric" max={19} min={1} onChange={(event) => setPartySize(Number(event.target.value))} required type="number" value={partySize} />
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-sm font-semibold text-zinc-200">
                  First name
                  <input autoComplete="given-name" className={fieldClass} maxLength={80} onChange={(event) => setFirstName(event.target.value)} required value={firstName} />
                </label>
                <label className="block text-sm font-semibold text-zinc-200">
                  Surname
                  <input autoComplete="family-name" className={fieldClass} maxLength={80} onChange={(event) => setSurname(event.target.value)} required value={surname} />
                </label>
              </div>
              <label className="block text-sm font-semibold text-zinc-200">
                Mobile number
                <input autoComplete="tel" className={fieldClass} inputMode="tel" maxLength={30} onChange={(event) => setMobile(event.target.value)} required type="tel" value={mobile} />
              </label>
              <label className="block text-sm font-semibold text-zinc-200">
                Email address
                <input autoComplete="email" className={fieldClass} maxLength={254} onChange={(event) => setEmail(event.target.value)} required type="email" value={email} />
              </label>

              {message && <p className="rounded-xl border border-red-400/30 bg-red-950/25 p-3 text-sm leading-5 text-red-100" role="alert">{message}</p>}

              <button className="min-h-12 w-full rounded-full bg-[#D8C36A] px-5 text-sm font-bold uppercase tracking-[0.08em] text-black transition hover:bg-[#F2D66C] disabled:cursor-wait disabled:opacity-60" disabled={status === "submitting"} type="submit">
                {status === "submitting" ? "Checking…" : "See If There's Room"}
              </button>
            </form>
          </>
        )}
      </section>
    </div>
  );
}
