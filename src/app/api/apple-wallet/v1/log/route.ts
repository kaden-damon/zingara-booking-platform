import {
  appleWalletRateLimitResponse,
  checkAppleWalletRateLimit,
} from "@/lib/appleWalletSync";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const limit = checkAppleWalletRateLimit("device-log", {
    limit: 60,
    windowMs: 60 * 60 * 1000,
  });

  if (!limit.allowed) {
    return appleWalletRateLimitResponse(limit.retryAfterSeconds);
  }

  const payload = (await request.json().catch(() => null)) as {
    logs?: unknown;
  } | null;
  const count = Array.isArray(payload?.logs) ? payload.logs.length : 0;

  if (count > 0) {
    console.info("[Apple Wallet] Device diagnostic received.", { count });
  }

  return new Response(null, { status: 200 });
}
