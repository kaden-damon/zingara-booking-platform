import { type Session, type User } from "@supabase/supabase-js";
import { getSupabaseClient } from "./client";

export type AdminAuthSession = {
  session: Session;
  user: User;
};

export const adminAuthChangedEvent = "zingara-admin-session-changed";

export async function getAdminAuthSession(): Promise<AdminAuthSession | null> {
  const supabase = getSupabaseClient();

  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase.auth.getSession();

  if (error) {
    console.error("[Zingara Supabase Auth] Failed to load session", error);
    return null;
  }

  if (!data.session?.user) {
    return null;
  }

  return {
    session: data.session,
    user: data.session.user,
  };
}

export async function signInAdmin(email: string, password: string) {
  const supabase = getSupabaseClient();

  if (!supabase) {
    return {
      error: "Supabase is not configured for this environment.",
      user: null,
    };
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    console.error("[Zingara Supabase Auth] Sign in failed", error);
    return {
      error: error.message,
      user: null,
    };
  }

  return {
    error: "",
    user: data.user,
  };
}

export async function signOutAdmin() {
  const supabase = getSupabaseClient();

  if (!supabase) {
    return;
  }

  const { error } = await supabase.auth.signOut();

  if (error) {
    console.error("[Zingara Supabase Auth] Sign out failed", error);
  }
}

export async function requestAdminPasswordReset(email: string) {
  const response = await fetch("/api/admin/password-reset", {
    body: JSON.stringify({ email }),
    headers: {
      "Content-Type": "application/json",
    },
    method: "POST",
  });

  const payload = (await response.json().catch(() => ({}))) as {
    error?: string;
    message?: string;
  };

  if (!response.ok) {
    return {
      error: payload.error ?? "Password reset request could not be submitted.",
      message: "",
    };
  }

  return {
    error: "",
    message:
      payload.message ??
      "If an account exists for that email address, a password reset link has been sent.",
  };
}

export async function updateAdminPassword(password: string) {
  const supabase = getSupabaseClient();

  if (!supabase) {
    return {
      error: "Supabase is not configured for this environment.",
    };
  }

  const { error } = await supabase.auth.updateUser({
    password,
  });

  if (error) {
    console.error("[Zingara Supabase Auth] Password update failed", error);
    return {
      error: error.message,
    };
  }

  return {
    error: "",
  };
}
