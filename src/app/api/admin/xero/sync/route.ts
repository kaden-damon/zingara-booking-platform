import { getRolePermissions, requireActiveStaff } from "@/lib/supabase/serverAdmin";
import { runLiveXeroSyncWorker } from "@/lib/xero/liveSync";

export const dynamic = "force-dynamic";
function canManage(auth: Awaited<ReturnType<typeof requireActiveStaff>>) {
  const role = Array.isArray(auth.staffProfile?.roles) ? auth.staffProfile?.roles[0] : auth.staffProfile?.roles;
  return getRolePermissions(role).includes("settings:manage");
}

export async function GET(request: Request) {
  const auth = await requireActiveStaff(request); if (auth.error || !auth.serviceClient) return auth.error;
  if (!canManage(auth)) return Response.json({ error: "Settings access is required." }, { status: 403 });
  const { data, error, count } = await auth.serviceClient.from("xero_sync_outbox")
    .select("id,document_id,operation,status,attempt_count,last_error,next_attempt_at,updated_at", { count: "exact" })
    .eq("operation", "document.sync")
    .in("status", ["paused", "pending", "blocked"])
    .order("updated_at", { ascending: false })
    .limit(20);
  if (error) throw error;
  const documentIds = (data ?? []).map((item) => item.document_id).filter((id): id is string => Boolean(id));
  const { data: documents, error: documentsError } = documentIds.length
    ? await auth.serviceClient
        .from("xero_documents")
        .select("id,local_reference,source_booking_reference,sync_status")
        .in("id", documentIds)
    : { data: [], error: null };
  if (documentsError) throw documentsError;
  const documentById = new Map((documents ?? []).map((document) => [document.id, document]));
  return Response.json({
    items: (data ?? []).map((item) => ({ ...item, document: item.document_id ? documentById.get(item.document_id) ?? null : null })),
    total: count ?? 0,
  });
}

export async function POST(request: Request) {
  const auth = await requireActiveStaff(request); if (auth.error || !auth.serviceClient || !auth.staffProfile) return auth.error;
  if (!canManage(auth)) return Response.json({ error: "Settings access is required." }, { status: 403 });
  const body = await request.json().catch(() => ({})) as { action?: "retry"; outboxId?: string };
  if (body.action === "retry") {
    return Response.json({ error: "Open the affected invoice and use Retry Xero so its provider payload is rebuilt and revalidated." }, { status: 409 });
  }
  if (process.env.XERO_LIVE_SYNC_AUTHORISED !== "true") return Response.json({ error: "Live Xero sync is paused and requires separate approval." }, { status: 409 });
  return Response.json(await runLiveXeroSyncWorker(auth.serviceClient));
}
