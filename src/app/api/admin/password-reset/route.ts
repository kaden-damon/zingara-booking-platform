import { createClient } from "@supabase/supabase-js";
import {
  checkRateLimit,
  rateLimitResponse,
} from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const genericResetMessage =
  "If an account exists for that email address, a password reset link has been sent.";

function getPasswordResetRedirectUrl(request: Request) {
  const url = new URL(request.url);
  const forwardedProto = request.headers.get("x-forwarded-proto");
  const forwardedHost = request.headers.get("x-forwarded-host");
  const host = forwardedHost ?? request.headers.get("host") ?? url.host;
  const protocol = forwardedProto ?? url.protocol.replace(":", "");

  return `${protocol}://${host}/set-password`;
}

function getAnonClient() {
  if (!supabaseUrl || !supabaseAnonKey) {
    return null;
  }

  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    email?: string;
  };
  const email = body.email?.trim().toLowerCase() ?? "";
  const supabase = getAnonClient();

  const ipLimit = await checkRateLimit(request, {
    limit: 8,
    scope: "admin_password_reset_ip",
    windowSeconds: 900,
  });

  if (!ipLimit.allowed) {
    return rateLimitResponse(ipLimit.retryAfterSeconds, {
      operation: "admin_password_reset",
      route: "/api/admin/password-reset",
      safeFingerprint: "admin_password_reset_rate_limited_ip",
    });
  }

  if (email) {
    const emailLimit = await checkRateLimit(
      request,
      {
        limit: 3,
        scope: "admin_password_reset_email",
        windowSeconds: 900,
      },
      [email],
    );

    if (!emailLimit.allowed) {
      return rateLimitResponse(emailLimit.retryAfterSeconds, {
        operation: "admin_password_reset",
        route: "/api/admin/password-reset",
        safeFingerprint: "admin_password_reset_rate_limited_email",
      });
    }
  }

  if (!supabase) {
    console.error("[Zingara Auth] Password reset is not configured.");
    return Response.json(
      { error: "Password reset is not configured for this environment." },
      { status: 500 },
    );
  }

  if (isValidEmail(email)) {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: getPasswordResetRedirectUrl(request),
    });

    if (error) {
      console.error("[Zingara Auth] Password reset request failed", {
        message: error.message,
      });
    }
  }

  return Response.json({
    message: genericResetMessage,
  });
}
