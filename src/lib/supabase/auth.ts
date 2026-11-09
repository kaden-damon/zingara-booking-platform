import { type Session, type User } from "@supabase/supabase-js";
import {
  staffTourAcknowledgedAtMetadataKey,
  staffTourAcknowledgementMetadataKey,
  staffTourHistoryMetadataKey,
  staffTourMetadataKey,
  getStaffTourAcknowledgementHistory,
  type StaffTourAcknowledgement,
} from "@/lib/staffOnboarding";
import { getSupabaseClient } from "./client";

export type AdminAuthSession = {
  session: Session;
  user: User;
};

export const adminAuthChangedEvent = "zingara-admin-session-changed";
const adminAuthTimeoutMs = 12_000;

export class AdminAuthUnavailableError extends Error {
  constructor() {
    super("Staff authentication is temporarily unavailable. Please try again.");
    this.name = "AdminAuthUnavailableError";
  }
}

async function withAdminAuthTimeout<T>(operation: Promise<T>) {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(
          () => reject(new AdminAuthUnavailableError()),
          adminAuthTimeoutMs,
        );
      }),
    ]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

export async function getAdminAuthSession(options: { throwOnError?: boolean } = {}): Promise<AdminAuthSession | null> {
  const supabase = getSupabaseClient();

  if (!supabase) {
    return null;
  }

  let data: Awaited<ReturnType<typeof supabase.auth.getSession>>["data"];
  let error: Awaited<ReturnType<typeof supabase.auth.getSession>>["error"];

  try {
    ({ data, error } = await withAdminAuthTimeout(supabase.auth.getSession()));
  } catch (sessionError) {
    console.error("[Zingara Supabase Auth] Session request failed", sessionError);

    if (options.throwOnError) {
      throw sessionError instanceof AdminAuthUnavailableError
        ? sessionError
        : new AdminAuthUnavailableError();
    }

    return null;
  }

  if (error) {
    console.error("[Zingara Supabase Auth] Failed to load session", error);

    if (options.throwOnError) {
      throw new AdminAuthUnavailableError();
    }

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

  let data: Awaited<ReturnType<typeof supabase.auth.signInWithPassword>>["data"];
  let error: Awaited<ReturnType<typeof supabase.auth.signInWithPassword>>["error"];

  try {
    ({ data, error } = await withAdminAuthTimeout(
      supabase.auth.signInWithPassword({
        email,
        password,
      }),
    ));
  } catch (signInError) {
    console.error("[Zingara Supabase Auth] Sign in request failed", signInError);
    return {
      error: "Staff authentication is temporarily unavailable. Please try again.",
      user: null,
    };
  }

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

export async function acknowledgeStaffTour(
  version: string,
  acknowledgement: StaffTourAcknowledgement,
  expectedStaffId: string,
) {
  const supabase = getSupabaseClient();

  if (!supabase) {
    return { error: "Supabase is not configured for this environment." };
  }

  const { data: sessionData, error: sessionError } =
    await supabase.auth.getSession();

  if (sessionError || sessionData.session?.user.id !== expectedStaffId) {
    return {
      error:
        "Your staff session changed. Sign in again before saving this acknowledgement.",
    };
  }

  const { error } = await supabase.auth.updateUser({
    data: {
      [staffTourAcknowledgedAtMetadataKey]: new Date().toISOString(),
      [staffTourAcknowledgementMetadataKey]: acknowledgement,
      [staffTourHistoryMetadataKey]: getStaffTourAcknowledgementHistory(
        sessionData.session.user,
      ),
      [staffTourMetadataKey]: version,
    },
  });

  if (error) {
    console.error("[Zingara Supabase Auth] Staff tour acknowledgement failed", error);
    return { error: error.message };
  }

  return { error: "" };
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
