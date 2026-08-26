import {
  appleWalletRateLimitResponse,
  checkAppleWalletRateLimit,
  ensureAppleWalletPassState,
  getAppleWalletPassTypeIdentifier,
  getAppleWalletServiceClient,
  hasValidAppleWalletAuthentication,
  isAppleWalletDeviceIdentifier,
  isAppleWalletPushToken,
  resolveAppleWalletTicket,
} from "@/lib/appleWalletSync";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RegistrationContext = {
  params: Promise<{
    deviceLibraryIdentifier: string;
    passTypeIdentifier: string;
    serialNumber: string;
  }>;
};

async function resolveRequest(request: Request, context: RegistrationContext) {
  const params = await context.params;
  const deviceLibraryIdentifier = decodeURIComponent(
    params.deviceLibraryIdentifier,
  );
  const passTypeIdentifier = decodeURIComponent(params.passTypeIdentifier);
  const serialNumber = decodeURIComponent(params.serialNumber).toLowerCase();

  if (
    !isAppleWalletDeviceIdentifier(deviceLibraryIdentifier) ||
    passTypeIdentifier !== getAppleWalletPassTypeIdentifier()
  ) {
    return { error: new Response(null, { status: 404 }) };
  }

  const rateLimit = checkAppleWalletRateLimit(
    `registration:${deviceLibraryIdentifier}`,
  );

  if (!rateLimit.allowed) {
    return {
      error: appleWalletRateLimitResponse(rateLimit.retryAfterSeconds),
    };
  }

  const client = getAppleWalletServiceClient();
  const ticket = await resolveAppleWalletTicket(client, serialNumber);

  if (!ticket) {
    return { error: new Response(null, { status: 404 }) };
  }

  if (!hasValidAppleWalletAuthentication(request, ticket.id)) {
    return { error: new Response(null, { status: 401 }) };
  }

  return {
    client,
    deviceLibraryIdentifier,
    passTypeIdentifier,
    ticket,
  };
}

export async function POST(request: Request, context: RegistrationContext) {
  try {
    const resolved = await resolveRequest(request, context);

    if ("error" in resolved) {
      return resolved.error;
    }

    const body = (await request.json().catch(() => null)) as {
      pushToken?: unknown;
    } | null;
    const pushToken =
      typeof body?.pushToken === "string" ? body.pushToken.trim() : "";

    if (!isAppleWalletPushToken(pushToken)) {
      return new Response(null, { status: 400 });
    }

    const { data: existingDevice, error: deviceLoadError } =
      await resolved.client
        .from("apple_wallet_devices")
        .select("id")
        .eq("device_library_identifier", resolved.deviceLibraryIdentifier)
        .maybeSingle();

    if (deviceLoadError) {
      throw deviceLoadError;
    }

    const now = new Date().toISOString();
    const { data: device, error: deviceError } = await resolved.client
      .from("apple_wallet_devices")
      .upsert(
        {
          device_library_identifier: resolved.deviceLibraryIdentifier,
          push_token: pushToken,
          updated_at: now,
        },
        { onConflict: "device_library_identifier" },
      )
      .select("id")
      .maybeSingle();

    if (deviceError || !device) {
      throw deviceError ?? new Error("Apple Wallet device was not stored.");
    }

    const { data: existingRegistration, error: registrationLoadError } =
      await resolved.client
        .from("apple_wallet_registrations")
        .select("id")
        .eq("device_id", device.id)
        .eq("ticket_id", resolved.ticket.id)
        .eq("pass_type_identifier", resolved.passTypeIdentifier)
        .maybeSingle();

    if (registrationLoadError) {
      throw registrationLoadError;
    }

    const { error: registrationError } = await resolved.client
      .from("apple_wallet_registrations")
      .upsert(
        {
          device_id: device.id,
          pass_type_identifier: resolved.passTypeIdentifier,
          ticket_id: resolved.ticket.id,
          updated_at: now,
        },
        { onConflict: "device_id,ticket_id,pass_type_identifier" },
      );

    if (registrationError) {
      throw registrationError;
    }

    await ensureAppleWalletPassState(resolved.client, resolved.ticket.id);

    return new Response(null, {
      status: existingDevice && existingRegistration ? 200 : 201,
    });
  } catch {
    console.error("[Apple Wallet] Device registration failed.");
    return new Response(null, { status: 500 });
  }
}

export async function DELETE(request: Request, context: RegistrationContext) {
  try {
    const resolved = await resolveRequest(request, context);

    if ("error" in resolved) {
      return resolved.error;
    }

    const { data: device, error: deviceError } = await resolved.client
      .from("apple_wallet_devices")
      .select("id")
      .eq("device_library_identifier", resolved.deviceLibraryIdentifier)
      .maybeSingle();

    if (deviceError) {
      throw deviceError;
    }

    if (!device) {
      return new Response(null, { status: 200 });
    }

    const { error: deleteError } = await resolved.client
      .from("apple_wallet_registrations")
      .delete()
      .eq("device_id", device.id)
      .eq("ticket_id", resolved.ticket.id)
      .eq("pass_type_identifier", resolved.passTypeIdentifier);

    if (deleteError) {
      throw deleteError;
    }

    const { count, error: countError } = await resolved.client
      .from("apple_wallet_registrations")
      .select("id", { count: "exact", head: true })
      .eq("device_id", device.id);

    if (countError) {
      throw countError;
    }

    if ((count ?? 0) === 0) {
      await resolved.client
        .from("apple_wallet_devices")
        .delete()
        .eq("id", device.id);
    }

    return new Response(null, { status: 200 });
  } catch {
    console.error("[Apple Wallet] Device unregistration failed.");
    return new Response(null, { status: 500 });
  }
}
