import { getRolePermissions, requireActiveStaff } from "@/lib/supabase/serverAdmin";
import { XeroAccountingAdapter } from "@/lib/xero/accountingAdapter";
import { getXeroConnectionRuntime } from "@/lib/xero/connectionRuntime";
import { normaliseXeroDiscovery, verifiedXeroMapping } from "@/lib/xero/discovery";
import { XERO_MAPPING_CATEGORIES, XERO_MAPPING_VENUES, expectedXeroAccountCode, isXeroMappingApprovalSupported, isXeroPaymentMappingCategory, xeroCategoriesForVenue, type XeroMappingCategory, type XeroMappingVenue } from "@/lib/xero/mappings";

export const dynamic = "force-dynamic";

function role(auth: Awaited<ReturnType<typeof requireActiveStaff>>) {
  return Array.isArray(auth.staffProfile?.roles) ? auth.staffProfile.roles[0] : auth.staffProfile?.roles;
}
function allowed(auth: Awaited<ReturnType<typeof requireActiveStaff>>) {
  const permissions = getRolePermissions(role(auth));
  return permissions.includes("settings:manage") || permissions.includes("bookings:reconcile");
}

export async function GET(request: Request) {
  const auth = await requireActiveStaff(request);
  if (auth.error || !auth.serviceClient) return auth.error;
  if (!allowed(auth)) return Response.json({ error: "Accounts access is required." }, { status: 403 });
  const tenantId = new URL(request.url).searchParams.get("tenantId");
  if (!tenantId) return Response.json({ mappings: [], required: XERO_MAPPING_CATEGORIES, venues: XERO_MAPPING_VENUES });
  const { data, error } = await auth.serviceClient.from("xero_account_mappings")
    .select("venue,category,account_id,account_code,account_name,account_type,tax_code,tax_name,tax_rate,verified_at,approved_at")
    .eq("tenant_id", tenantId).order("venue").order("category");
  if (error) throw error;
  return Response.json({ mappings: data ?? [], required: XERO_MAPPING_CATEGORIES, venues: XERO_MAPPING_VENUES });
}

export async function PUT(request: Request) {
  const auth = await requireActiveStaff(request);
  if (auth.error || !auth.serviceClient || !auth.staffProfile || !auth.user) return auth.error;
  if (!allowed(auth)) return Response.json({ error: "Accounts access is required." }, { status: 403 });
  const body = await request.json() as { accountCode?: string; accountId?: string; category?: string; taxCode?: string; tenantId?: string; venue?: string };
  if (!body.tenantId || !XERO_MAPPING_CATEGORIES.includes(body.category as XeroMappingCategory) || !XERO_MAPPING_VENUES.includes(body.venue as XeroMappingVenue) || !body.accountId) {
    return Response.json({ error: "Choose a verified Xero account." }, { status: 400 });
  }
  const category = body.category as XeroMappingCategory;
  const venue = body.venue as XeroMappingVenue;
  const accountCode = body.accountCode?.trim() ?? "";
  if (!isXeroPaymentMappingCategory(category) && !accountCode) return Response.json({ error: "Choose a verified Xero account." }, { status: 400 });
  if (!xeroCategoriesForVenue(venue).includes(category)) return Response.json({ error: "Choose the correct venue for this mapping." }, { status: 400 });
  if (!isXeroMappingApprovalSupported(venue, category)) return Response.json({ error: "Accounts must confirm this accounting treatment before it can be approved." }, { status: 409 });
  const expectedAccountCode = expectedXeroAccountCode(venue, category);
  if (expectedAccountCode && accountCode !== expectedAccountCode) return Response.json({ error: "Choose the approved account for this venue and category." }, { status: 409 });
  try {
    const runtime = await getXeroConnectionRuntime(auth.serviceClient, body.tenantId);
    const adapter = new XeroAccountingAdapter(runtime.transport, body.tenantId);
    const discovery = normaliseXeroDiscovery(await adapter.discover());
    if (discovery.organisation.name !== "Zingara Productions (Pty) Ltd" && discovery.organisation.legalName !== "Zingara Productions (Pty) Ltd") {
      return Response.json({ error: "The connected Xero organisation is not approved for Zingara." }, { status: 409 });
    }
    const verified = verifiedXeroMapping({ accountCode, accountId: body.accountId, category, discovery, taxCode: body.taxCode?.trim() });
    const { data, error } = await auth.serviceClient.rpc("approve_xero_account_mapping_atomic", {
      p_account_code: verified.account.code,
      p_account_id: verified.account.accountId,
      p_account_name: verified.account.name,
      p_account_type: verified.account.type,
      p_actor_auth_user_id: auth.user.id,
      p_actor_location_scope: auth.staffProfile.venue_scope,
      p_actor_name: auth.staffProfile.full_name,
      p_actor_role: role(auth),
      p_actor_staff_profile_id: auth.staffProfile.id,
      p_category: category,
      p_tax_code: verified.taxRate?.taxType ?? "",
      p_tax_name: verified.taxRate?.name ?? "",
      p_tax_rate: verified.taxRate?.effectiveRate ?? null,
      p_tenant_id: body.tenantId,
      p_venue: venue,
    });
    if (error) throw error;
    return Response.json({ mapping: data });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "The mapping could not be verified." }, { status: 409 });
  }
}
