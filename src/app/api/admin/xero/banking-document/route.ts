import { randomUUID } from "node:crypto";
import {
  canReplaceBankingDocument,
  downloadBankingDocument,
  loadActiveBankingDocument,
  validateBankingPdf,
  XERO_BANKING_BUCKET,
} from "@/lib/xero/bankingDocuments";
import { getRolePermissions, requireActiveStaff } from "@/lib/supabase/serverAdmin";

export const dynamic = "force-dynamic";

function roleDetails(auth: Awaited<ReturnType<typeof requireActiveStaff>>) {
  const role = Array.isArray(auth.staffProfile?.roles) ? auth.staffProfile.roles[0] : auth.staffProfile?.roles;
  return { name: role?.name ?? "Staff", permissions: getRolePermissions(role) };
}

function hasXeroAccess(auth: Awaited<ReturnType<typeof requireActiveStaff>>) {
  const { permissions } = roleDetails(auth);
  return permissions.includes("settings:manage") || permissions.includes("bookings:reconcile") || permissions.includes("analytics:read");
}

async function responseMetadata(auth: Awaited<ReturnType<typeof requireActiveStaff>>) {
  if (!auth.serviceClient || !auth.staffProfile) return null;
  const document = await loadActiveBankingDocument(auth.serviceClient);
  if (!document) return { canReplace: canReplaceBankingDocument(auth.staffProfile.id), document: null };
  const { data: uploader } = await auth.serviceClient.from("staff_profiles").select("full_name").eq("id", document.uploaded_by_staff_profile_id).maybeSingle();
  return {
    canReplace: canReplaceBankingDocument(auth.staffProfile.id),
    document: {
      activatedAt: document.activated_at,
      fileSize: document.file_size,
      filename: document.original_filename,
      uploadedAt: document.uploaded_at,
      uploadedBy: uploader?.full_name ?? "Authorised staff",
      version: document.version,
    },
  };
}

export async function GET(request: Request) {
  const auth = await requireActiveStaff(request);
  if (auth.error || !auth.serviceClient || !auth.staffProfile) return auth.error;
  if (!hasXeroAccess(auth)) return Response.json({ error: "Xero settings access is required." }, { status: 403 });
  const active = await loadActiveBankingDocument(auth.serviceClient);
  if (new URL(request.url).searchParams.get("download") === "true") {
    if (!active) return Response.json({ error: "No approved banking confirmation is available." }, { status: 404 });
    const bytes = await downloadBankingDocument(auth.serviceClient, active.storage_path);
    return new Response(bytes, {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Disposition": `attachment; filename="${active.original_filename.replace(/["\\]/g, "")}"`,
        "Content-Type": "application/pdf",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }
  return Response.json(await responseMetadata(auth));
}

export async function POST(request: Request) {
  const auth = await requireActiveStaff(request);
  if (auth.error || !auth.serviceClient || !auth.staffProfile) return auth.error;
  if (!canReplaceBankingDocument(auth.staffProfile.id)) return Response.json({ error: "Only Kaden or Wagheeda can replace this document." }, { status: 403 });
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return Response.json({ error: "Choose a PDF document." }, { status: 400 });
  const bytes = Buffer.from(await file.arrayBuffer());
  let sha256: string;
  try { sha256 = validateBankingPdf(bytes, file.type); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "The PDF is invalid." }, { status: 400 }); }
  const storagePath = `${new Date().toISOString().slice(0, 10)}/${randomUUID()}.pdf`;
  const { error: uploadError } = await auth.serviceClient.storage.from(XERO_BANKING_BUCKET).upload(storagePath, bytes, { contentType: "application/pdf", upsert: false });
  if (uploadError) return Response.json({ error: "The PDF could not be stored securely." }, { status: 502 });
  const { name: roleName } = roleDetails(auth);
  const { error: activateError } = await auth.serviceClient.rpc("activate_xero_banking_document", {
    p_actor_auth_user_id: auth.user.id,
    p_actor_location_scope: auth.staffProfile.venue_scope,
    p_actor_name: auth.staffProfile.full_name,
    p_actor_role: roleName,
    p_actor_staff_profile_id: auth.staffProfile.id,
    p_file_size: bytes.length,
    p_original_filename: file.name.slice(0, 200),
    p_sha256: sha256,
    p_storage_path: storagePath,
  });
  if (activateError) {
    await auth.serviceClient.storage.from(XERO_BANKING_BUCKET).remove([storagePath]);
    return Response.json({ error: "The PDF could not be approved." }, { status: 409 });
  }
  return Response.json(await responseMetadata(auth));
}
