import { getActorRoleLabel } from "@/lib/auditTrail";
import { hasPlatformOwnerBinding } from "@/lib/platformOwnerAccess";
import { requireActiveStaff } from "@/lib/supabase/serverAdmin";

export const dynamic = "force-dynamic";

const approvalReason =
  "Management-approved transfer of existing deposit to replacement booking.";
const fatimaStaffProfileId = "3ac09b59-fc3f-4c6d-9bb3-8dd47a077188";
const fatimaAuthUserId = "ff96887e-bed8-43ec-884d-0ef8634e9f12";
const paymentId = "79a9090b-49d5-41f6-b1ca-e2bfcc96d75d";

function roleOf(auth: Awaited<ReturnType<typeof requireActiveStaff>>) {
  return Array.isArray(auth.staffProfile?.roles)
    ? auth.staffProfile.roles[0]
    : auth.staffProfile?.roles;
}

function canApproveTransfer(auth: Awaited<ReturnType<typeof requireActiveStaff>>) {
  return Boolean(
    (auth.staffProfile?.active &&
      auth.staffProfile.id === fatimaStaffProfileId &&
      auth.user?.id === fatimaAuthUserId) ||
      hasPlatformOwnerBinding(auth.staffProfile, auth.user),
  );
}

export async function GET(request: Request) {
  const auth = await requireActiveStaff(request);
  if (auth.error || !auth.serviceClient || !auth.staffProfile) return auth.error;
  if (!canApproveTransfer(auth)) {
    return Response.json({ error: "Authorised management approval is required." }, { status: 403 });
  }

  const { data, error } = await auth.serviceClient
    .from("payment_reallocations")
    .select("id,amount,provider_transaction_id,approval_reason,created_at")
    .eq("payment_id", paymentId)
    .maybeSingle();
  if (error) {
    return Response.json({ error: "Transfer status could not be loaded." }, { status: 500 });
  }
  return Response.json({ completed: Boolean(data), transfer: data ?? null });
}

export async function POST(request: Request) {
  const auth = await requireActiveStaff(request);
  if (auth.error || !auth.serviceClient || !auth.staffProfile || !auth.user) {
    return auth.error;
  }
  if (!canApproveTransfer(auth)) {
    return Response.json({ error: "Authenticated management approval is required." }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as {
    approvalReason?: string;
    confirmed?: boolean;
    idempotencyKey?: string;
  } | null;
  if (
    body?.confirmed !== true ||
    body.approvalReason !== approvalReason ||
    !body.idempotencyKey
  ) {
    return Response.json({ error: "Explicit approval is required." }, { status: 400 });
  }

  const role = roleOf(auth);
  const { data, error } = await auth.serviceClient.rpc(
    "reallocate_norman_deposit_atomic",
    {
      p_actor_auth_user_id: auth.user.id,
      p_actor_location_scope: auth.staffProfile.venue_scope ?? [],
      p_actor_name: auth.staffProfile.full_name,
      p_actor_role: getActorRoleLabel(role?.name),
      p_actor_staff_profile_id: auth.staffProfile.id,
      p_approval_reason: approvalReason,
      p_idempotency_key: body.idempotencyKey,
    },
  );
  if (error) {
    console.error("[Zingara Admin] Norman deposit transfer failed", error.code);
    const message = error.message.includes("XERO")
      ? "Accounting evidence changed. Accounts review is required before transfer."
      : error.message.includes("ALREADY_COMPLETED")
        ? "This payment has already been transferred."
        : error.message.includes("AUTHORITATIVE_STATE_CHANGED") ||
            error.message.includes("PAYMENT_NOT_AVAILABLE")
          ? "The booking or payment changed. Review the latest records before continuing."
          : "The deposit could not be transferred safely.";
    return Response.json({ error: message }, { status: 409 });
  }

  return Response.json({ completed: true, transfer: data });
}
