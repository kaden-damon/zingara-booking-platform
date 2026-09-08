import { adminIpUndertaking } from "@/lib/adminIpUndertaking";
import { requireActiveStaff } from "@/lib/supabase/serverAdmin";

export const dynamic = "force-dynamic";

const privateNoStoreHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
  Vary: "Authorization",
};

function privateNoStore(response: Response) {
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", privateNoStoreHeaders["Cache-Control"]);
  headers.set("Vary", privateNoStoreHeaders.Vary);
  return new Response(response.body, {
    headers,
    status: response.status,
    statusText: response.statusText,
  });
}

export async function GET(request: Request) {
  const auth = await requireActiveStaff(request, { requireIpUndertaking: false });

  if (auth.error || !auth.serviceClient || !auth.staffProfile) {
    return privateNoStore(
      auth.error ?? Response.json({ error: "Unauthorized." }, { status: 401 }),
    );
  }

  const { data, error } = await auth.serviceClient
    .from("admin_policy_acceptances")
    .select("accepted_at")
    .eq("staff_profile_id", auth.staffProfile.id)
    .eq("policy_key", "admin-ip-undertaking")
    .eq("policy_version", adminIpUndertaking.version)
    .maybeSingle();

  if (error) {
    console.error("[Zingara Admin Undertaking] Status lookup failed", error);
    return privateNoStore(
      Response.json(
        { error: "The current Platform Use & Access Terms status could not be verified." },
        { status: 503 },
      ),
    );
  }

  return Response.json({
    accepted: Boolean(data),
    acceptedAt: data?.accepted_at ?? null,
    title: adminIpUndertaking.title,
    version: adminIpUndertaking.version,
  }, { headers: privateNoStoreHeaders });
}

export async function POST(request: Request) {
  const auth = await requireActiveStaff(request, { requireIpUndertaking: false });

  if (auth.error || !auth.serviceClient || !auth.staffProfile || !auth.user) {
    return privateNoStore(
      auth.error ?? Response.json({ error: "Unauthorized." }, { status: 401 }),
    );
  }

  const body = (await request.json().catch(() => null)) as
    | { accepted?: boolean; version?: string }
    | null;

  if (body?.accepted !== true || body.version !== adminIpUndertaking.version) {
    return privateNoStore(
      Response.json(
        { error: "The current Platform Use & Access Terms must be explicitly accepted." },
        { status: 400 },
      ),
    );
  }

  const acceptedAt = new Date().toISOString();
  const { data, error } = await auth.serviceClient
    .from("admin_policy_acceptances")
    .insert({
      accepted_at: acceptedAt,
      actor_auth_user_id: auth.user.id,
      actor_email: auth.staffProfile.email,
      actor_name: auth.staffProfile.full_name,
      policy_key: "admin-ip-undertaking",
      policy_title: adminIpUndertaking.title,
      policy_version: adminIpUndertaking.version,
      staff_profile_id: auth.staffProfile.id,
    })
    .select("id,accepted_at")
    .maybeSingle();

  if (error && error.code !== "23505") {
    console.error("[Zingara Admin Undertaking] Acceptance failed", error);
    return privateNoStore(
      Response.json(
        { error: "The undertaking acceptance could not be recorded." },
        { status: 500 },
      ),
    );
  }

  let recordedAcceptedAt = data?.accepted_at ?? acceptedAt;

  if (error?.code === "23505") {
    const { data: existing, error: existingError } = await auth.serviceClient
      .from("admin_policy_acceptances")
      .select("accepted_at")
      .eq("actor_auth_user_id", auth.user.id)
      .eq("policy_key", "admin-ip-undertaking")
      .eq("policy_version", adminIpUndertaking.version)
      .single();

    if (existingError) {
      console.error(
        "[Zingara Admin Undertaking] Existing acceptance lookup failed",
        existingError,
      );
      return privateNoStore(
        Response.json(
          { error: "The Platform Use & Access Terms acceptance could not be verified." },
          { status: 500 },
        ),
      );
    }

    recordedAcceptedAt = existing.accepted_at;
  }

  return Response.json({
    accepted: true,
    acceptedAt: recordedAcceptedAt,
    title: adminIpUndertaking.title,
    version: adminIpUndertaking.version,
  }, { headers: privateNoStoreHeaders });
}
