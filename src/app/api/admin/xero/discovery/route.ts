import { getRolePermissions, requireActiveStaff } from "@/lib/supabase/serverAdmin";
import { XeroAccountingAdapter } from "@/lib/xero/accountingAdapter";
import { getXeroConnectionRuntime } from "@/lib/xero/connectionRuntime";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const auth = await requireActiveStaff(request); if (auth.error || !auth.serviceClient || !auth.staffProfile) return auth.error;
  const role = Array.isArray(auth.staffProfile.roles) ? auth.staffProfile.roles[0] : auth.staffProfile.roles;
  if (!getRolePermissions(role).includes("settings:manage")) return Response.json({ error: "Settings access is required." }, { status: 403 });
  try { const runtime = await getXeroConnectionRuntime(auth.serviceClient); const adapter = new XeroAccountingAdapter(runtime.transport, runtime.connection.tenant_id!); return Response.json(await adapter.discover()); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Xero settings could not be loaded." }, { status: 409 }); }
}
