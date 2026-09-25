import { parseDineplanFile } from "@/lib/dineplanFileParser";
import { isAuthoritativeCorporateBooking } from "@/lib/bookingClassification";
import {
  reconcileDineplanSnapshot,
  type DineplanSnapshot,
  type ZingaraAuthoritativeChange,
  type ZingaraReconciliationBooking,
} from "@/lib/dineplanReconciliation";
import { tryRecordAuditEvent } from "@/lib/supabase/serverAudit";
import { syncDineplanReconciliationActions } from "@/lib/dineplanActionStore";
import { normalizeStaffVenueScope } from "@/lib/staffLocations";
import {
  matchesDineplanPerformance,
  type DineplanPerformanceMetadata,
} from "@/lib/dineplanPerformanceCandidates";
import {
  getRolePermissions,
  requireActiveStaff,
} from "@/lib/supabase/serverAdmin";
import { normalizeShowLocation } from "@/lib/zingaraDemo";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const snapshotSelect =
  "id,checksum,original_filename,mime_type,file_size,uploaded_by,uploaded_at,source_generated_at,performance_date,performance_time,venue,show_id,reservation_count,covers,status,compared_at,reconciliation_results";

function roleOf(staffProfile: NonNullable<Awaited<ReturnType<typeof requireActiveStaff>>["staffProfile"]>) {
  return Array.isArray(staffProfile.roles) ? staffProfile.roles[0] : staffProfile.roles;
}

function canReconcile(staffProfile: NonNullable<Awaited<ReturnType<typeof requireActiveStaff>>["staffProfile"]>) {
  const permissions = getRolePermissions(roleOf(staffProfile));
  return permissions.includes("bookings:reconcile") || permissions.includes("settings:manage");
}

function forbidden() {
  return Response.json(
    { error: "You do not have permission to use Dineplan Reconciliation." },
    { status: 403 },
  );
}

function canAccessLocation(venueScope: string[], venue: string | null | undefined) {
  const scope = normalizeStaffVenueScope(venueScope);
  const location = normalizeShowLocation(venue);
  return Boolean(location && (scope.includes("all") || scope.includes(location)));
}

function canAccessSnapshot(
  staffProfile: NonNullable<Awaited<ReturnType<typeof requireActiveStaff>>["staffProfile"]>,
  snapshot: { uploaded_by?: string | null; venue?: string | null },
) {
  const scope = normalizeStaffVenueScope(staffProfile.venue_scope ?? []);
  return (
    scope.includes("all") ||
    snapshot.uploaded_by === staffProfile.id ||
    canAccessLocation(staffProfile.venue_scope ?? [], snapshot.venue)
  );
}

function schemaUnavailable(error: { code?: string; message?: string } | null | undefined) {
  return error?.code === "42P01" || /dineplan_reconciliation_/i.test(error?.message ?? "");
}

function normalizeReference(value: string) {
  return value.replace(/^DP-/i, "").replace(/[^a-z0-9]/gi, "").toUpperCase();
}

function customerRelation(value: unknown) {
  if (Array.isArray(value)) return value[0] ?? null;
  return value && typeof value === "object" ? value as Record<string, unknown> : null;
}

function changedFields(fields: unknown): ZingaraAuthoritativeChange["fields"] {
  const values = Array.isArray(fields) ? fields.map(String) : [];
  const mapped = new Set<ZingaraAuthoritativeChange["fields"][number]>();
  if (values.some((field) => /guest_count|party_size|pax/i.test(field))) mapped.add("pax");
  if (values.some((field) => /show_id|performance|show_date/i.test(field))) mapped.add("performance");
  if (values.some((field) => /section|zone_entitlements|zone/i.test(field))) mapped.add("zone");
  if (values.some((field) => /table_id|table_codes|assignment/i.test(field))) mapped.add("table");
  if (values.some((field) => /booking_status|archive|cancel/i.test(field))) mapped.add("status");
  if (values.some((field) => /amount_paid|balance|payment/i.test(field))) mapped.add("payment");
  return [...mapped];
}

async function candidateShows(
  serviceClient: NonNullable<Awaited<ReturnType<typeof requireActiveStaff>>["serviceClient"]>,
  snapshot: DineplanPerformanceMetadata,
  venueScope: string[],
) {
  if (!snapshot.performanceDate) return [];
  let query = serviceClient
    .from("shows")
    .select("id,date,time,venue,status")
    .eq("date", snapshot.performanceDate)
    .order("time", { ascending: true });
  if (snapshot.performanceTime) query = query.eq("time", snapshot.performanceTime);
  if (snapshot.venue) {
    query = query.ilike("venue", snapshot.venue === "cape-town" ? "%cape%town%" : "%johannesburg%");
  }
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).filter(
    (show) =>
      canAccessLocation(venueScope, show.venue) &&
      matchesDineplanPerformance(snapshot, show),
  );
}

async function loadReconciliationBookings(
  serviceClient: NonNullable<Awaited<ReturnType<typeof requireActiveStaff>>["serviceClient"]>,
  showId: string,
) {
  const { data: show, error: showError } = await serviceClient
    .from("shows")
    .select("id,date,time,venue,status")
    .eq("id", showId)
    .single();
  if (showError || !show) throw showError ?? new Error("Show not found.");

  const { data: bookingRows, error: bookingError } = await serviceClient
    .from("bookings")
    .select("id,booking_reference,booking_origin,booking_source,corporate_request_id,booking_status,payment_status,company_name,customer_id,guest_count,section,total_amount,amount_paid,balance_outstanding,created_at,updated_at,provenance_recorded_at,archived_at,customers(first_name,surname,mobile)")
    .eq("show_id", showId);
  if (bookingError) throw bookingError;
  const ids = (bookingRows ?? []).map((booking) => booking.id);
  if (!ids.length) return { bookings: [], show };

  const [tableResult, lifecycleResult, auditResult, paymentResult] = await Promise.all([
    serviceClient.from("show_tables").select("id,booking_id,table_code,section,updated_at").eq("show_id", showId).not("booking_id", "is", null),
    serviceClient.from("booking_lifecycle_events").select("booking_id,created_at,from_status,to_status,note,reason").in("booking_id", ids),
    serviceClient.from("audit_events").select("entity_id,created_at,action,changed_fields,reason,outcome").eq("entity_type", "booking").in("entity_id", ids).eq("outcome", "success"),
    serviceClient.from("payments").select("booking_id,processed_at,payment_status,amount").in("booking_id", ids).not("processed_at", "is", null),
  ]);
  const loadError = tableResult.error ?? lifecycleResult.error ?? auditResult.error ?? paymentResult.error;
  if (loadError) throw loadError;
  const tablesByBooking = new Map<string, Array<{ table_code: string; section: string | null; updated_at: string }>>();
  for (const table of tableResult.data ?? []) {
    if (!table.booking_id) continue;
    tablesByBooking.set(table.booking_id, [...(tablesByBooking.get(table.booking_id) ?? []), table]);
  }
  const changesByBooking = new Map<string, ZingaraAuthoritativeChange[]>();
  const addChange = (bookingId: string, change: ZingaraAuthoritativeChange) => {
    if (!change.fields.length) return;
    changesByBooking.set(bookingId, [...(changesByBooking.get(bookingId) ?? []), change]);
  };
  for (const event of lifecycleResult.data ?? []) {
    addChange(event.booking_id, {
      at: event.created_at,
      fields: ["status"],
      reason: event.reason || event.note || `Booking status changed to ${event.to_status}.`,
    });
  }
  for (const event of auditResult.data ?? []) {
    if (!event.entity_id) continue;
    addChange(event.entity_id, {
      at: event.created_at,
      fields: changedFields(event.changed_fields),
      reason: event.reason || event.action || "Authoritative Zingara amendment.",
    });
  }
  for (const payment of paymentResult.data ?? []) {
    if (!payment.booking_id || !["paid", "successful", "fully_paid", "completed"].includes(String(payment.payment_status))) continue;
    addChange(payment.booking_id, {
      at: payment.processed_at,
      fields: ["payment"],
      reason: `Successful Zingara payment evidence for R${Number(payment.amount).toFixed(2)}.`,
    });
  }

  const bookings: ZingaraReconciliationBooking[] = (bookingRows ?? []).map((row) => {
    const customer = customerRelation(row.customers);
    const tables = tablesByBooking.get(row.id) ?? [];
    const importedAt = row.provenance_recorded_at ?? row.created_at;
    const laterTableChange = tables
      .map((table) => table.updated_at)
      .filter((updatedAt) => Date.parse(updatedAt) > Date.parse(importedAt) + 60_000)
      .sort()
      .at(-1);
    const authoritativeChanges = [...(changesByBooking.get(row.id) ?? [])];
    if (laterTableChange && !authoritativeChanges.some((change) => change.fields.includes("table"))) {
      authoritativeChanges.push({
        at: laterTableChange,
        fields: ["table"],
        reason: "Operational table assignment changed after the imported Dineplan baseline.",
      });
    }
    const sourceReference = row.booking_reference.startsWith("DP-")
      ? normalizeReference(row.booking_reference)
      : null;
    return {
      amountPaid: Number(row.amount_paid) || 0,
      archivedAt: row.archived_at,
      authoritativeChanges,
      bookingOrigin: row.booking_origin,
      bookingReference: row.booking_reference,
      bookingStatus: row.booking_status,
      bookingKind: isAuthoritativeCorporateBooking({
        bookingOrigin: row.booking_origin,
        bookingSource: row.booking_source,
        corporateRequestId: row.corporate_request_id,
      }) ? "corporate" : "standard",
      company: row.company_name,
      customerName: [customer?.first_name, customer?.surname].filter(Boolean).join(" ") || row.company_name || "Imported Guest",
      id: row.id,
      importedAt,
      mobile: typeof customer?.mobile === "string" ? customer.mobile : null,
      outstanding: Number(row.balance_outstanding) || 0,
      partySize: Number(row.guest_count) || 0,
      paymentStatus: row.payment_status,
      performanceDate: show.date,
      performanceTime: show.time,
      seatingZone: row.section,
      sourceReference,
      tables: tables.map((table) => table.table_code).sort((left, right) => left.localeCompare(right, undefined, { numeric: true })),
      totalAmount: Number(row.total_amount) || 0,
      updatedAt: row.updated_at,
    };
  });
  return { bookings, show };
}

export async function GET(request: Request) {
  const auth = await requireActiveStaff(request);
  if (auth.error || !auth.staffProfile || !auth.serviceClient) return auth.error;
  if (!canReconcile(auth.staffProfile)) return forbidden();
  const url = new URL(request.url);
  const snapshotId = url.searchParams.get("snapshotId")?.trim();
  if (snapshotId) {
    const { data: stored, error: storedError } = await auth.serviceClient
      .from("dineplan_reconciliation_snapshots")
      .select(snapshotSelect)
      .eq("id", snapshotId)
      .single();
    if (storedError || !stored) {
      return Response.json({ error: "The uploaded snapshot could not be found." }, { status: 404 });
    }
    if (!canAccessSnapshot(auth.staffProfile, stored)) return forbidden();
    const shows = await candidateShows(auth.serviceClient, {
      performanceDate: stored.performance_date,
      performanceTime: stored.performance_time,
      venue: stored.venue,
    }, auth.staffProfile.venue_scope ?? []);
    return Response.json({ shows });
  }
  let query = auth.serviceClient
    .from("dineplan_reconciliation_snapshots")
    .select(snapshotSelect)
    .order("uploaded_at", { ascending: false });
  if (url.searchParams.get("scope") === "next30") {
    const start = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Johannesburg" }).format(new Date());
    const end = new Date(`${start}T00:00:00+02:00`);
    end.setDate(end.getDate() + 30);
    query = query.gte("performance_date", start).lte("performance_date", end.toISOString().slice(0, 10)).eq("status", "reconciled").limit(200);
  } else {
    query = query.limit(100);
  }
  const { data, error } = await query;
  if (error) {
    return Response.json(
      { code: schemaUnavailable(error) ? "DINEPLAN_RECONCILIATION_SCHEMA_REQUIRED" : "DINEPLAN_RECONCILIATION_LOAD_FAILED", error: schemaUnavailable(error) ? "The local Dineplan Reconciliation migration must be applied before use." : "Dineplan snapshots could not be loaded." },
      { status: schemaUnavailable(error) ? 503 : 500 },
    );
  }
  const snapshots = (data ?? [])
    .filter((snapshot) => canAccessSnapshot(auth.staffProfile!, snapshot))
    .slice(0, url.searchParams.get("scope") === "next30" ? undefined : 20);
  return Response.json({ snapshots });
}

export async function POST(request: Request) {
  const auth = await requireActiveStaff(request);
  if (auth.error || !auth.staffProfile || !auth.serviceClient || !auth.user) return auth.error;
  if (!canReconcile(auth.staffProfile)) return forbidden();
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return Response.json({ error: "Choose a Dineplan export to upload." }, { status: 400 });
    try {
      const bytes = Buffer.from(await file.arrayBuffer());
      const snapshot = await parseDineplanFile({ bytes, filename: file.name, mimeType: file.type });
      const shows = await candidateShows(auth.serviceClient, snapshot, auth.staffProfile.venue_scope ?? []);
      const { data: existing } = await auth.serviceClient
        .from("dineplan_reconciliation_snapshots")
        .select(snapshotSelect)
        .eq("checksum", snapshot.checksum)
        .maybeSingle();
      if (existing) {
        if (!canAccessSnapshot(auth.staffProfile, existing)) return forbidden();
        let resolvedSnapshot = existing;
        if (existing.status === "preview") {
          const metadata = {
            covers: snapshot.covers,
            performance_date: snapshot.performanceDate ?? existing.performance_date,
            performance_time: snapshot.performanceTime ?? existing.performance_time,
            reservation_count: snapshot.reservations.length,
            source_generated_at: snapshot.generatedAt ?? existing.source_generated_at,
            venue: snapshot.venue ?? existing.venue,
          };
          const { data: refreshed, error: refreshError } = await auth.serviceClient
            .from("dineplan_reconciliation_snapshots")
            .update(metadata)
            .eq("id", existing.id)
            .eq("status", "preview")
            .select(snapshotSelect)
            .single();
          if (refreshError || !refreshed) {
            throw refreshError ?? new Error("The existing snapshot metadata could not be refreshed.");
          }
          resolvedSnapshot = refreshed;
        }
        return Response.json({ duplicate: true, shows, snapshot: resolvedSnapshot });
      }
      const { data, error } = await auth.serviceClient
        .from("dineplan_reconciliation_snapshots")
        .insert({
          checksum: snapshot.checksum,
          covers: snapshot.covers,
          file_size: bytes.length,
          mime_type: file.type || "application/octet-stream",
          normalized_reservations: snapshot.reservations,
          original_filename: file.name.slice(0, 240),
          performance_date: snapshot.performanceDate,
          performance_time: snapshot.performanceTime,
          reservation_count: snapshot.reservations.length,
          source_generated_at: snapshot.generatedAt,
          uploaded_by: auth.staffProfile.id,
          venue: snapshot.venue,
        })
        .select(snapshotSelect)
        .single();
      if (error || !data) {
        return Response.json({ code: schemaUnavailable(error) ? "DINEPLAN_RECONCILIATION_SCHEMA_REQUIRED" : "DINEPLAN_UPLOAD_FAILED", error: schemaUnavailable(error) ? "The local Dineplan Reconciliation migration must be applied before use." : "The normalized Dineplan snapshot could not be stored." }, { status: schemaUnavailable(error) ? 503 : 500 });
      }
      const auditRecorded = await tryRecordAuditEvent(auth.serviceClient, auth.staffProfile, auth.user, {
        action: "Dineplan snapshot uploaded",
        afterValues: { checksum: snapshot.checksum, covers: snapshot.covers, filename: file.name, reservations: snapshot.reservations.length },
        entityId: data.id,
        entityReference: file.name,
        entityType: "data-portability-import",
        outcome: "success",
        request,
        sourceArea: "Dineplan Reconciliation",
      });
      return Response.json({ auditRecorded, duplicate: false, shows, snapshot: data });
    } catch (error) {
      return Response.json({ error: error instanceof Error ? error.message : "The Dineplan export could not be parsed." }, { status: 400 });
    }
  }

  const body = await request.json().catch(() => null) as { action?: string; showId?: string; snapshotId?: string } | null;
  if (body?.action !== "reconcile" || !body.snapshotId || !body.showId) {
    return Response.json({ error: "Confirm the detected show before running reconciliation." }, { status: 400 });
  }
  const { data: stored, error: snapshotError } = await auth.serviceClient
    .from("dineplan_reconciliation_snapshots")
    .select(`${snapshotSelect},normalized_reservations`)
    .eq("id", body.snapshotId)
    .single();
  if (snapshotError || !stored) return Response.json({ error: "The uploaded snapshot could not be found." }, { status: 404 });
  if (!canAccessSnapshot(auth.staffProfile, stored)) return forbidden();
  try {
    const { bookings, show } = await loadReconciliationBookings(auth.serviceClient, body.showId);
    const location = normalizeShowLocation(show.venue);
    if (!location || !canAccessLocation(auth.staffProfile.venue_scope ?? [], show.venue)) return forbidden();
    if (!matchesDineplanPerformance({
      performanceDate: stored.performance_date,
      performanceTime: stored.performance_time,
      venue: stored.venue,
    }, show)) {
      return Response.json({ error: "The selected performance does not match the Dineplan snapshot." }, { status: 400 });
    }
    const snapshot: DineplanSnapshot = {
      checksum: stored.checksum,
      covers: stored.covers,
      generatedAt: stored.source_generated_at,
      performanceDate: stored.performance_date,
      performanceTime: stored.performance_time,
      reservations: stored.normalized_reservations,
      venue: stored.venue,
    };
    const reconciliation = reconcileDineplanSnapshot(snapshot, bookings);
    const comparedAt = new Date().toISOString();
    const { error: updateError } = await auth.serviceClient
      .from("dineplan_reconciliation_snapshots")
      .update({ compared_at: comparedAt, compared_by: auth.staffProfile.id, reconciliation_results: reconciliation, show_id: body.showId, status: "reconciled", venue: location })
      .eq("id", body.snapshotId);
    if (updateError) throw updateError;
    let actionSyncStatus: "ready" | "unavailable" = "ready";
    try {
      await syncDineplanReconciliationActions(auth.serviceClient, {
        comparedAt,
        performanceDate: show.date,
        performanceTime: show.time,
        results: reconciliation.results,
        showId: body.showId,
        snapshotId: body.snapshotId,
        sourceGeneratedAt: snapshot.generatedAt,
        venue: location,
      });
    } catch (actionError) {
      actionSyncStatus = "unavailable";
      console.error("[Dineplan Reconciliation] Action Centre sync failed", actionError);
    }
    const auditRecorded = await tryRecordAuditEvent(auth.serviceClient, auth.staffProfile, auth.user, {
      action: "Dineplan reconciliation run",
      afterValues: { critical: reconciliation.counts.critical ?? 0, matched: reconciliation.counts.matched ?? 0, showId: body.showId },
      entityId: body.snapshotId,
      entityLocation: show.venue,
      entityReference: stored.original_filename,
      entityType: "data-portability-import",
      outcome: "success",
      request,
      sourceArea: "Dineplan Reconciliation",
    });
    return Response.json({ actionSyncStatus, auditRecorded, comparedAt, reconciliation, show, snapshot: { ...stored, normalized_reservations: undefined, show_id: body.showId, status: "reconciled", venue: location } });
  } catch (error) {
    console.error("[Dineplan Reconciliation] Comparison failed", error);
    return Response.json({ error: "The selected show could not be reconciled. No booking data was changed." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const auth = await requireActiveStaff(request);
  if (auth.error || !auth.staffProfile || !auth.serviceClient || !auth.user) return auth.error;
  if (!canReconcile(auth.staffProfile)) return forbidden();
  const body = await request.json().catch(() => null) as { disposition?: string; notes?: string; resultKey?: string; snapshotId?: string } | null;
  const dispositions = new Set(["reviewed", "no_action", "box_office", "management_review"]);
  if (!body?.snapshotId || !body.resultKey || !body.disposition || !dispositions.has(body.disposition)) {
    return Response.json({ error: "Choose a valid review outcome." }, { status: 400 });
  }
  const { data: reviewSnapshot, error: reviewSnapshotError } = await auth.serviceClient
    .from("dineplan_reconciliation_snapshots")
    .select("id,venue,uploaded_by")
    .eq("id", body.snapshotId)
    .single();
  if (reviewSnapshotError || !reviewSnapshot) return Response.json({ error: "The reconciliation snapshot could not be found." }, { status: 404 });
  if (!canAccessSnapshot(auth.staffProfile, reviewSnapshot)) return forbidden();
  const { data, error } = await auth.serviceClient
    .from("dineplan_reconciliation_reviews")
    .upsert({ disposition: body.disposition, notes: body.notes?.trim().slice(0, 1000) || null, result_key: body.resultKey, reviewed_at: new Date().toISOString(), reviewed_by: auth.staffProfile.id, snapshot_id: body.snapshotId }, { onConflict: "snapshot_id,result_key" })
    .select("id,disposition,notes,reviewed_at,result_key")
    .single();
  if (error || !data) return Response.json({ error: "The review outcome could not be saved." }, { status: 500 });
  const auditRecorded = await tryRecordAuditEvent(auth.serviceClient, auth.staffProfile, auth.user, {
    action: "Dineplan discrepancy reviewed",
    afterValues: { disposition: body.disposition, resultKey: body.resultKey },
    entityId: body.snapshotId,
    entityReference: body.resultKey,
    entityType: "data-portability-import",
    outcome: "success",
    request,
    sourceArea: "Dineplan Reconciliation",
  });
  return Response.json({ auditRecorded, review: data });
}
