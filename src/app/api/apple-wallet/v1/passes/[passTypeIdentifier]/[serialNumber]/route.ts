import { createAppleWalletPassForSerial } from "@/lib/appleWalletPass";
import {
  appleWalletRateLimitResponse,
  checkAppleWalletRateLimit,
  getAppleWalletPassTypeIdentifier,
  getAppleWalletServiceClient,
  hasValidAppleWalletAuthentication,
  resolveAppleWalletTicket,
} from "@/lib/appleWalletSync";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type PassContext = {
  params: Promise<{
    passTypeIdentifier: string;
    serialNumber: string;
  }>;
};

export async function GET(request: Request, context: PassContext) {
  try {
    const params = await context.params;
    const passTypeIdentifier = decodeURIComponent(params.passTypeIdentifier);
    const serialNumber = decodeURIComponent(params.serialNumber).toLowerCase();

    if (passTypeIdentifier !== getAppleWalletPassTypeIdentifier()) {
      return new Response(null, { status: 404 });
    }

    const rateLimit = checkAppleWalletRateLimit(`pass:${serialNumber}`);

    if (!rateLimit.allowed) {
      return appleWalletRateLimitResponse(rateLimit.retryAfterSeconds);
    }

    const client = getAppleWalletServiceClient();
    const ticket = await resolveAppleWalletTicket(client, serialNumber);

    if (!ticket) {
      return new Response(null, { status: 404 });
    }

    if (!hasValidAppleWalletAuthentication(request, ticket.id)) {
      return new Response(null, { status: 401 });
    }

    const result = await createAppleWalletPassForSerial(ticket.id, request.url);

    if (!result) {
      return new Response(null, { status: 404 });
    }

    return new Response(new Uint8Array(result.buffer), {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Type": "application/vnd.apple.pkpass",
        "Last-Modified": new Date().toUTCString(),
      },
    });
  } catch {
    console.error("[Apple Wallet] Updated pass retrieval failed.");
    return new Response(null, { status: 500 });
  }
}
