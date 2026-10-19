import ExcelJS from "exceljs";
import { getActorRoleLabel } from "@/lib/auditTrail";
import { requireActiveStaff } from "@/lib/supabase/serverAdmin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Auth = Awaited<ReturnType<typeof requireActiveStaff>>;

function roleName(auth: Auth) {
  const role = Array.isArray(auth.staffProfile?.roles)
    ? auth.staffProfile?.roles[0]
    : auth.staffProfile?.roles;
  return role?.name ?? "";
}

function isManagement(auth: Auth) {
  const normalizedRole = roleName(auth).trim().toLowerCase().replace(/[-_]+/g, " ");
  return ["super admin", "venue manager", "box office manager"].includes(normalizedRole);
}

function venueScope(auth: Auth) {
  const scope = auth.staffProfile?.venue_scope ?? [];
  return scope.includes("all") ? [] : scope;
}

function cleanSearch(value: string | null) {
  return (value ?? "").replace(/[,%()]/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);
}

const selection = "id,booking_id,booking_reference,customer_name,original_company_evidence,initial_company_id,initial_company_name,venue,performance_at,exception_type,reason,status,resolution_company_id,reviewed_by_name,reviewed_at,management_notes,revision,created_at,updated_at";

type ReconciliationRecord = {
  booking_id: string;
  booking_reference: string;
  created_at: string;
  customer_name: string;
  exception_type: "conflicting_company" | "insufficient_evidence";
  id: string;
  initial_company_id: string | null;
  initial_company_name: string | null;
  management_notes: string | null;
  original_company_evidence: string | null;
  reason: string;
  resolution_company_id: string | null;
  reviewed_at: string | null;
  reviewed_by_name: string | null;
  revision: number;
  status: "needs_review" | "resolved";
  updated_at: string;
  venue: string;
};

type CompanyRecord = { id: string; legal_name: string; trading_name: string | null };

async function loadRows(auth: Auth, input: {
  exceptionType: string;
  from: number;
  search: string;
  status: string;
  to: number;
}) {
  let query = auth.serviceClient!
    .from("corporate_company_reconciliation_cases")
    .select(selection, { count: "exact" });
  const venues = venueScope(auth);
  if (venues.length) query = query.in("venue", venues);
  if (["conflicting_company", "insufficient_evidence"].includes(input.exceptionType)) {
    query = query.eq("exception_type", input.exceptionType);
  }
  if (["needs_review", "resolved"].includes(input.status)) query = query.eq("status", input.status);
  if (input.search) {
    const pattern = `*${input.search}*`;
    query = query.or(`booking_reference.ilike.${pattern},customer_name.ilike.${pattern},original_company_evidence.ilike.${pattern}`);
  }
  query = query.order("created_at", { ascending: true })
    .order("booking_reference", { ascending: true })
    .range(input.from, input.to);
  const { data, error, count } = await query;
  if (error) throw error;

  const rows = (data ?? []) as ReconciliationRecord[];
  const bookingIds = rows.map((row) => row.booking_id);
  const bookingResult = bookingIds.length
    ? await auth.serviceClient!.from("bookings").select("id,company_id").in("id", bookingIds)
    : { data: [], error: null };
  if (bookingResult.error) throw bookingResult.error;
  const bookingCompanyIds = new Map(
    (bookingResult.data ?? []).map((booking) => [booking.id as string, booking.company_id as string | null]),
  );
  const companyIds = [...new Set(rows.flatMap((row) =>
    [bookingCompanyIds.get(row.booking_id), row.initial_company_id, row.resolution_company_id].filter(Boolean),
  ))] as string[];
  const companyResult = companyIds.length
    ? await auth.serviceClient!.from("companies").select("id,legal_name,trading_name").in("id", companyIds)
    : { data: [], error: null };
  if (companyResult.error) throw companyResult.error;
  const companyRows = (companyResult.data ?? []) as CompanyRecord[];
  const companies = new Map(companyRows.map((company) => [company.id, company]));

  return {
    rows: rows.map((row) => ({
      ...row,
      currentCompany: bookingCompanyIds.get(row.booking_id)
        ? companies.get(bookingCompanyIds.get(row.booking_id)!) ?? null
        : row.resolution_company_id
          ? companies.get(row.resolution_company_id) ?? null
          : row.initial_company_id
            ? companies.get(row.initial_company_id) ?? null
          : null,
    })),
    total: count ?? 0,
  };
}

async function loadTotals(auth: Auth) {
  const base = () => {
    let query = auth.serviceClient!
      .from("corporate_company_reconciliation_cases")
      .select("id", { count: "exact", head: true });
    const venues = venueScope(auth);
    if (venues.length) query = query.in("venue", venues);
    return query;
  };
  const [all, conflicting, insufficient, unresolved] = await Promise.all([
    base(),
    base().eq("exception_type", "conflicting_company"),
    base().eq("exception_type", "insufficient_evidence"),
    base().eq("status", "needs_review"),
  ]);
  for (const result of [all, conflicting, insufficient, unresolved]) {
    if (result.error) throw result.error;
  }
  return {
    all: all.count ?? 0,
    conflicting: conflicting.count ?? 0,
    insufficient: insufficient.count ?? 0,
    unresolved: unresolved.count ?? 0,
  };
}

async function exportWorkbook(auth: Auth, filters: { exceptionType: string; search: string; status: string }) {
  const result = await loadRows(auth, { ...filters, from: 0, to: 1999 });
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Zingara";
  const sheet = workbook.addWorksheet("Company Reconciliation", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  sheet.columns = [
    { header: "Booking Reference", key: "bookingReference", width: 18 },
    { header: "Customer", key: "customer", width: 26 },
    { header: "Original Company Evidence", key: "evidence", width: 38 },
    { header: "Currently Linked Company", key: "company", width: 32 },
    { header: "Exception Type", key: "exceptionType", width: 24 },
    { header: "Reason", key: "reason", width: 48 },
    { header: "Status", key: "status", width: 16 },
    { header: "Reviewed By", key: "reviewedBy", width: 24 },
    { header: "Reviewed Date", key: "reviewedAt", width: 22 },
    { header: "Management Notes", key: "notes", width: 42 },
  ];
  for (const row of result.rows) {
    sheet.addRow({
      bookingReference: row.booking_reference,
      customer: row.customer_name,
      evidence: row.original_company_evidence ?? "",
      company: row.currentCompany?.legal_name ?? "",
      exceptionType: row.exception_type === "conflicting_company" ? "Conflicting company" : "Insufficient evidence",
      reason: row.reason,
      status: row.status === "needs_review" ? "Needs Review" : "Resolved",
      reviewedBy: row.reviewed_by_name ?? "",
      reviewedAt: row.reviewed_at ?? "",
      notes: row.management_notes ?? "",
    });
  }
  sheet.getRow(1).font = { bold: true, color: { argb: "FF000000" } };
  sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD8C36A" } };
  sheet.autoFilter = { from: "A1", to: "J1" };
  sheet.eachRow((row, index) => {
    row.alignment = { vertical: "top", wrapText: index > 1 };
    row.height = index === 1 ? 24 : 36;
  });
  const buffer = await workbook.xlsx.writeBuffer();
  return new Response(Buffer.from(buffer), {
    headers: {
      "Cache-Control": "no-store",
      "Content-Disposition": "attachment; filename=Zingara_Corporate_Company_Reconciliation.xlsx",
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    },
  });
}

export async function GET(request: Request) {
  const auth = await requireActiveStaff(request);
  if (auth.error || !auth.serviceClient || !auth.staffProfile) return auth.error;
  if (!isManagement(auth)) return Response.json({ error: "Management access is required." }, { status: 403 });

  try {
    const url = new URL(request.url);
    const search = cleanSearch(url.searchParams.get("search"));
    const status = url.searchParams.get("status") ?? "needs_review";
    const exceptionType = url.searchParams.get("exceptionType") ?? "all";
    if (url.searchParams.get("format") === "xlsx") {
      return exportWorkbook(auth, { exceptionType, search, status });
    }
    const evidenceId = url.searchParams.get("evidenceId");
    if (evidenceId) {
      const caseQuery = auth.serviceClient.from("corporate_company_reconciliation_cases")
        .select("id,booking_id,venue,original_company_evidence,reason").eq("id", evidenceId).maybeSingle();
      const { data: caseRow, error: caseError } = await caseQuery;
      if (caseError || !caseRow) return Response.json({ error: "Reconciliation evidence could not be found." }, { status: 404 });
      if (venueScope(auth).length && !venueScope(auth).includes(caseRow.venue)) {
        return Response.json({ error: "This performance is outside your venue access." }, { status: 403 });
      }
      const [{ data: booking, error: bookingError }, { data: events, error: eventError }] = await Promise.all([
        auth.serviceClient.from("bookings").select("booking_reference,booking_source,booking_origin,company_name,created_at,updated_at,corporate_request_id").eq("id", caseRow.booking_id).single(),
        auth.serviceClient.from("audit_events").select("id,action,actor_name,created_at,reason,before_values,after_values").eq("entity_id", caseRow.booking_id).order("created_at", { ascending: true }).limit(20),
      ]);
      if (bookingError || eventError) throw bookingError ?? eventError;
      return Response.json({ booking, events: events ?? [], originalCompanyEvidence: caseRow.original_company_evidence, reason: caseRow.reason });
    }

    const page = Math.max(1, Number(url.searchParams.get("page") ?? 1) || 1);
    const pageSize = 10;
    const [result, totals] = await Promise.all([
      loadRows(auth, { exceptionType, from: (page - 1) * pageSize, search, status, to: page * pageSize - 1 }),
      loadTotals(auth),
    ]);
    return Response.json({ ...result, page, pageSize, totals });
  } catch (error) {
    console.error("[Zingara API] Corporate company reconciliation failed", error);
    return Response.json({ error: "Company reconciliation could not be loaded." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireActiveStaff(request);
  if (auth.error || !auth.serviceClient || !auth.staffProfile || !auth.user) return auth.error;
  if (!isManagement(auth)) return Response.json({ error: "Management access is required." }, { status: 403 });
  try {
    const body = await request.json() as { caseId?: string; companyId?: string | null; expectedRevision?: number; managementNotes?: string; reason?: string };
    if (!body.caseId || !Number.isInteger(body.expectedRevision) || (body.reason ?? "").trim().length < 5) {
      return Response.json({ error: "Choose a review outcome and provide a reason." }, { status: 400 });
    }
    const role = Array.isArray(auth.staffProfile.roles) ? auth.staffProfile.roles[0] : auth.staffProfile.roles;
    const { data, error } = await auth.serviceClient.rpc("resolve_corporate_company_reconciliation_case", {
      p_actor_auth_user_id: auth.user.id,
      p_actor_location_scope: auth.staffProfile.venue_scope ?? [],
      p_actor_name: auth.staffProfile.full_name ?? auth.user.email,
      p_actor_role: getActorRoleLabel(role?.name),
      p_actor_staff_profile_id: auth.staffProfile.id,
      p_case_id: body.caseId,
      p_company_id: body.companyId || null,
      p_expected_revision: body.expectedRevision,
      p_management_notes: body.managementNotes ?? "",
      p_reason: body.reason ?? "",
      p_request_id: request.headers.get("x-vercel-id") ?? request.headers.get("x-request-id") ?? crypto.randomUUID(),
      p_user_agent: request.headers.get("user-agent"),
    });
    if (error) {
      const message = error.message ?? "";
      if (message.includes("CASE_CHANGED") || message.includes("BOOKING_COMPANY_CHANGED")) {
        return Response.json({ error: "This record changed. Refresh and review it again." }, { status: 409 });
      }
      if (message.includes("COMPANY_NOT_AVAILABLE")) {
        return Response.json({ error: "That Company is no longer available. Choose another Company." }, { status: 409 });
      }
      throw error;
    }
    return Response.json({ result: data });
  } catch (error) {
    console.error("[Zingara API] Corporate company reconciliation update failed", error);
    return Response.json({ error: "The reconciliation could not be saved." }, { status: 500 });
  }
}
