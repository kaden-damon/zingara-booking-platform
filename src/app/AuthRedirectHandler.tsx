"use client";

import { useEffect } from "react";

import { getSupabaseClient } from "@/lib/supabase/client";

const setupIntentKey = "zingara-password-setup-intent";
const storedAuthFragmentKey = "zingara-supabase-auth-fragment";

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

function isPasswordSetupType(type: string | null) {
  return type === "invite" || type === "recovery";
}

function cleanAuthUrl() {
  window.sessionStorage.removeItem(storedAuthFragmentKey);
  window.history.replaceState(null, "", window.location.pathname);
}

export default function AuthRedirectHandler() {
  useEffect(() => {
    let cancelled = false;

    async function handleAuthRedirect() {
      const supabase = getSupabaseClient();

      if (!supabase) {
        return;
      }

      const existingSession = await supabase.auth.getSession();

      if (existingSession.data.session?.user) {
        if (
          window.location.hash ||
          window.location.search.includes("code=") ||
          window.sessionStorage.getItem(storedAuthFragmentKey)
        ) {
          cleanAuthUrl();
        }
        return;
      }

      const { accessToken, code, refreshToken, type } = getAuthParams();

      if (!code && (!accessToken || !refreshToken)) {
        return;
      }

      let errorMessage = "";

      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        errorMessage = error?.message ?? "";
      } else if (accessToken && refreshToken) {
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        errorMessage = error?.message ?? "";
      }

      if (cancelled) {
        return;
      }

      if (errorMessage) {
        window.sessionStorage.setItem(
          setupIntentKey,
          JSON.stringify({
            error: errorMessage,
            type: type ?? "unknown",
          }),
        );
        cleanAuthUrl();
        window.location.replace("/set-password");
        return;
      }

      if (isPasswordSetupType(type)) {
        window.sessionStorage.setItem(
          setupIntentKey,
          JSON.stringify({
            createdAt: new Date().toISOString(),
            type,
          }),
        );
        cleanAuthUrl();
        window.location.replace("/set-password");
        return;
      }

      cleanAuthUrl();
      window.location.replace("/admin");
    }

    void handleAuthRedirect();

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
