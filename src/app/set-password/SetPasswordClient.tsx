"use client";

import { FormEvent, useEffect, useState } from "react";

import {
  signOutAdmin,
  updateAdminPassword,
} from "@/lib/supabase/auth";
import { getSupabaseClient } from "@/lib/supabase/client";

const setupIntentKey = "zingara-password-setup-intent";
const storedAuthFragmentKey = "zingara-supabase-auth-fragment";

type SetupState = "checking" | "ready" | "invalid" | "saving" | "saved";

function getAuthParams() {
  const search = new URLSearchParams(window.location.search);
  const storedFragment = window.sessionStorage.getItem(storedAuthFragmentKey);
  const hash = window.location.hash || storedFragment || "";
  const hashParams = new URLSearchParams(hash.replace(/^#/, ""));

  return {
    accessToken: hashParams.get("access_token"),
    code: search.get("code"),
    refreshToken: hashParams.get("refresh_token"),
    type: hashParams.get("type") || search.get("type"),
  };
}

function readSetupIntent() {
  const rawIntent = window.sessionStorage.getItem(setupIntentKey);

  if (!rawIntent) {
    return null;
  }

  try {
    return JSON.parse(rawIntent) as {
      error?: string;
      type?: string;
    };
  } catch {
    return null;
  }
}

function clearAuthUrl() {
  window.sessionStorage.removeItem(storedAuthFragmentKey);
  window.history.replaceState(null, "", "/set-password");
}

export default function SetPasswordClient() {
  const [confirmPassword, setConfirmPassword] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [password, setPassword] = useState("");
  const [setupState, setSetupState] = useState<SetupState>("checking");

  useEffect(() => {
    let cancelled = false;

    async function prepareSession() {
      const supabase = getSupabaseClient();

      if (!supabase) {
        setError("Password setup is not configured for this environment.");
        setSetupState("invalid");
        return;
      }

      const intent = readSetupIntent();

      if (intent?.error) {
        setError(intent.error);
        setSetupState("invalid");
        return;
      }

      const { accessToken, code, refreshToken, type } = getAuthParams();

      if (code) {
        const { error: exchangeError } =
          await supabase.auth.exchangeCodeForSession(code);

        if (exchangeError) {
          setError(exchangeError.message);
          setSetupState("invalid");
          return;
        }

        window.sessionStorage.setItem(
          setupIntentKey,
          JSON.stringify({ type: type ?? "recovery" }),
        );
      } else if (accessToken && refreshToken) {
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });

        if (sessionError) {
          setError(sessionError.message);
          setSetupState("invalid");
          return;
        }

        window.sessionStorage.setItem(
          setupIntentKey,
          JSON.stringify({ type: type ?? "invite" }),
        );
      }

      clearAuthUrl();

      const { data, error: sessionError } = await supabase.auth.getSession();

      if (cancelled) {
        return;
      }

      if (sessionError || !data.session?.user) {
        setError(
          sessionError?.message ||
            "This password setup link is invalid or has expired.",
        );
        setSetupState("invalid");
        return;
      }

      if (!readSetupIntent()) {
        window.location.replace("/admin");
        return;
      }

      setEmail(data.session.user.email ?? "");
      setSetupState("ready");
    }

    void prepareSession();

    return () => {
      cancelled = true;
    };
  }, []);

  async function savePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setSetupState("saving");
    const result = await updateAdminPassword(password);

    if (result.error) {
      setError(result.error);
      setSetupState("ready");
      return;
    }

    window.sessionStorage.removeItem(setupIntentKey);
    await signOutAdmin();
    setPassword("");
    setConfirmPassword("");
    setSetupState("saved");

    window.setTimeout(() => {
      window.location.replace("/admin");
    }, 1200);
  }

  const isSaving = setupState === "saving";

  return (
    <main className="flex min-h-screen items-center justify-center bg-black px-6 py-12 text-white">
      <section className="w-full max-w-md border border-[#D8C36A]/30 bg-zinc-950/90 p-8 shadow-2xl shadow-black sm:p-10">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/brand/zingara-logo-landing.svg"
          alt="Zingara"
          className="mx-auto mb-8 h-auto w-44"
        />
        <div className="text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#D8C36A]">
            Staff Access
          </p>
          <h1
            className="mt-3 text-3xl font-normal uppercase tracking-[0.08em] text-white"
            style={{
              fontFamily: "var(--font-zingara-subheading), Georgia, serif",
            }}
          >
            Set Password
          </h1>
          <p className="mt-3 text-sm leading-6 text-zinc-400">
            Create your password, then sign in to the Zingara Admin dashboard.
          </p>
        </div>

        {setupState === "checking" && (
          <p className="mt-8 rounded-2xl border border-white/10 bg-black/45 px-4 py-3 text-center text-sm text-zinc-300">
            Preparing your secure setup session...
          </p>
        )}

        {setupState === "invalid" && (
          <div className="mt-8 rounded-2xl border border-red-300/30 bg-red-950/25 px-4 py-4 text-sm text-red-100">
            {error || "This password setup link is invalid or has expired."}
          </div>
        )}

        {(setupState === "ready" || setupState === "saving") && (
          <form onSubmit={savePassword} className="mt-8 space-y-5">
            {email && (
              <p className="rounded-2xl border border-white/10 bg-black/45 px-4 py-3 text-center text-sm text-zinc-300">
                {email}
              </p>
            )}
            <label className="block">
              <span className="mb-2 block text-center text-[0.68rem] font-bold uppercase tracking-[0.2em] text-zinc-400">
                New Password
              </span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="new-password"
                minLength={8}
                required
                className="w-full border border-[#D8C36A]/35 bg-black/70 px-4 py-3 text-center text-white outline-none transition focus:border-[#D8C36A] focus:ring-2 focus:ring-[#D8C36A]/20"
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-center text-[0.68rem] font-bold uppercase tracking-[0.2em] text-zinc-400">
                Confirm Password
              </span>
              <input
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                autoComplete="new-password"
                minLength={8}
                required
                className="w-full border border-[#D8C36A]/35 bg-black/70 px-4 py-3 text-center text-white outline-none transition focus:border-[#D8C36A] focus:ring-2 focus:ring-[#D8C36A]/20"
              />
            </label>
            {error && (
              <p className="rounded-2xl border border-red-300/30 bg-red-950/25 px-4 py-3 text-center text-sm font-semibold text-red-100">
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={isSaving}
              className="w-full bg-[#D8C36A] px-5 py-3 text-sm font-extrabold uppercase tracking-[0.18em] text-black transition hover:bg-[#F2D66C] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSaving ? "Saving..." : "Save Password"}
            </button>
          </form>
        )}

        {setupState === "saved" && (
          <div className="mt-8 rounded-2xl border border-emerald-300/30 bg-emerald-950/25 px-4 py-4 text-center text-sm font-semibold text-emerald-100">
            Password saved. Redirecting to Admin Login...
          </div>
        )}
      </section>
    </main>
  );
}
