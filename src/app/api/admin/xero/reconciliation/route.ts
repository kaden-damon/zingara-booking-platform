import { getRolePermissions, requireActiveStaff } from "@/lib/supabase/serverAdmin";
import { runLiveXeroReconciliation } from "@/lib/xero/liveReconciliation";

export const dynamic = "force-dynamic";
function allowed(auth: Awaited<ReturnType<typeof requireActiveStaff>>) { const role = Array.isArray(auth.staffProfile?.roles) ? auth.staffProfile?.roles[0] : auth.staffProfile?.roles; const permissions = getRolePermissions(role); return permissions.includes("bookings:reconcile") || permissions.includes("settings:manage"); }

export async function GET(request: Request) {
  const auth = await requireActiveStaff(request); if (auth.error || !auth.serviceClient) return auth.error;
  if (!allowed(auth)) return Response.json({ error: "Accounts access is required." }, { status: 403 });
  const url = new URL(request.url); const page = Math.max(1, Number(url.searchParams.get("page") ?? "1") || 1); const pageSize = 20; const from = (page - 1) * pageSize;
  const { data, error, count } = await auth.serviceClient.from("xero_reconciliation_items").select("id,category,document_id,provider_resource_type,provider_resource_id,local_amount_cents,provider_amount_cents,status,first_seen_at,last_seen_at,details", { count: "exact" }).eq("status", "open").order("last_seen_at", { ascending: false }).range(from, from + pageSize - 1);
  if (error) throw error; return Response.json({ items: data ?? [], page, pageSize, total: count ?? 0 });
}

export async function POST(request: Request) {
  const auth = await requireActiveStaff(request); if (auth.error || !auth.serviceClient) return auth.error;
  if (!allowed(auth)) return Response.json({ error: "Accounts access is required." }, { status: 403 });
  if (process.env.XERO_LIVE_SYNC_AUTHORISED !== "true") return Response.json({ error: "Xero reconciliation is paused and requires separate approval." }, { status: 409 });
  return Response.json(await runLiveXeroReconciliation(auth.serviceClient));
}
