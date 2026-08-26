import {
  appleWalletRateLimitResponse,
  checkAppleWalletRateLimit,
  getAppleWalletPassTypeIdentifier,
  getAppleWalletServiceClient,
  isAppleWalletDeviceIdentifier,
} from "@/lib/appleWalletSync";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type UpdatedSerialsContext = {
  params: Promise<{
    deviceLibraryIdentifier: string;
    passTypeIdentifier: string;
  }>;
};

export async function GET(request: Request, context: UpdatedSerialsContext) {
  try {
    const params = await context.params;
    const deviceLibraryIdentifier = decodeURIComponent(
      params.deviceLibraryIdentifier,
    );
    const passTypeIdentifier = decodeURIComponent(params.passTypeIdentifier);

    if (
      !isAppleWalletDeviceIdentifier(deviceLibraryIdentifier) ||
      passTypeIdentifier !== getAppleWalletPassTypeIdentifier()
    ) {
      return new Response(null, { status: 404 });
    }

    const rateLimit = checkAppleWalletRateLimit(
      `updates:${deviceLibraryIdentifier}`,
      { limit: 480 },
    );

    if (!rateLimit.allowed) {
      return appleWalletRateLimitResponse(rateLimit.retryAfterSeconds);
    }

    const markerValue = new URL(request.url).searchParams.get(
      "passesUpdatedSince",
    );
    const marker = markerValue === null ? null : Number(markerValue);

    if (
      marker !== null &&
      (!Number.isSafeInteger(marker) || marker < 0)
    ) {
      return new Response(null, { status: 400 });
    }

    const client = getAppleWalletServiceClient();
    const { data: device, error: deviceError } = await client
      .from("apple_wallet_devices")
      .select("id")
      .eq("device_library_identifier", deviceLibraryIdentifier)
      .maybeSingle();

    if (deviceError) {
      throw deviceError;
    }

    if (!device) {
      return Response.json({ lastUpdated: markerValue ?? "0", serialNumbers: [] });
    }

    const { data: registrations, error: registrationError } = await client
      .from("apple_wallet_registrations")
      .select("ticket_id")
      .eq("device_id", device.id)
      .eq("pass_type_identifier", passTypeIdentifier);

    if (registrationError) {
      throw registrationError;
    }

    const ticketIds = (registrations ?? []).map(
      (registration) => registration.ticket_id as string,
    );

    if (ticketIds.length === 0) {
      return Response.json({ lastUpdated: markerValue ?? "0", serialNumbers: [] });
    }

    const { data: states, error: stateError } = await client
      .from("apple_wallet_pass_state")
      .select("ticket_id,update_tag")
      .in("ticket_id", ticketIds);

    if (stateError) {
      throw stateError;
    }

    const lastUpdated = Math.max(
      marker ?? 0,
      ...(states ?? []).map((state) => Number(state.update_tag)),
    );
    const serialNumbers = (states ?? [])
      .filter((state) => marker === null || Number(state.update_tag) > marker)
      .map((state) => state.ticket_id as string);

    return Response.json({
      lastUpdated: String(lastUpdated),
      serialNumbers,
    });
  } catch {
    console.error("[Apple Wallet] Updated serial lookup failed.");
    return new Response(null, { status: 500 });
  }
}
