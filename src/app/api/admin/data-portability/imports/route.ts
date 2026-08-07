import { createHash } from "crypto";
import {
  isSuperAdminProfile,
  requireActiveStaff,
} from "@/lib/supabase/serverAdmin";
import {
  pickAuditFields,
  recordAuditEvent,
  tryRecordAuditEvent,
} from "@/lib/supabase/serverAudit";
import {
  type BookingStatus,
  type DemoBooking,
  type EntryLocationKey,
  type PaymentStatus,
  createTicketCode,
  getShowLocationOption,
  seatingZones,
} from "@/lib/zingaraDemo";

export const dynamic = "force-dynamic";

type DataPortabilityEntity = "bookings" | "customers";
type ImportAction = "Create" | "Skip" | "Update";
type PreviewRow = {
  action: ImportAction;
  errors?: string[];
  rowNumber: number;
  valid: boolean;
  values: Record<string, string>;
  warnings?: string[];
};
type ImportRequestBody =
  | {
      action: "execute";
      dataset: DataPortabilityEntity;
      fileName: string;
      rows: PreviewRow[];
    }
  | {
      action: "restore-preview" | "restore";
      importId: string;
    };

type ShowRow = {
  date: string;
  id: string;
  name: string;
  notes: string | null;
  time: string;
  venue: string;
};
type TableRow = {
  id: string;
  section: string;
  show_id: string;
  table_code: string;
};

const bookingMetadataPrefix = "__zingara_booking_meta__:";

const bookingStatusMap: Record<string, BookingStatus> = {
  cancelled: "cancelled",
  completed: "completed",
  confirmed: "confirmed",
  "checked in": "checked-in",
  checked_in: "checked-in",
  new: "new",
  "new booking": "new",
  "no show": "no-show",
  no_show: "no-show",
  pending: "pending",
  "pending payment": "pending-payment",
  pending_payment: "pending-payment",
  refunded: "refunded",
  waitlisted: "waitlisted",
};

const paymentStatusMap: Record<string, PaymentStatus> = {
  "comp/vip": "comp-vip",
  comp_vip: "comp-vip",
  "deposit paid": "deposit-paid",
  deposit_paid: "deposit-paid",
  "fully paid": "fully-paid",
  fully_paid: "fully-paid",
  "pending payment": "pending-payment",
  pending_payment: "pending-payment",
  refunded: "refunded",
};

function normalizeValue(value?: string | null) {
  return value?.trim().toLowerCase() ?? "";
}

function hashImportRows(rows: PreviewRow[]) {
  return createHash("sha256")
    .update(
      JSON.stringify(
        rows.map((row) => ({
          action: row.action,
          rowNumber: row.rowNumber,
          valid: row.valid,
          values: row.values,
        })),
      ),
    )
    .digest("hex");
}

function toSupabaseBookingStatus(value: string) {
  const status = bookingStatusMap[normalizeValue(value)] ?? "pending-payment";

  if (status === "pending-payment" || status === "pending") {
    return "pending_payment";
  }

  if (status === "checked-in") {
    return "checked_in";
  }

  if (status === "no-show") {
    return "no_show";
  }

  return status;
}

function toSupabasePaymentStatus(value: string) {
  const status = paymentStatusMap[normalizeValue(value)] ?? "pending-payment";

  if (status === "deposit-paid") {
    return "deposit_paid";
  }

  if (status === "fully-paid") {
    return "fully_paid";
  }

  if (status === "comp-vip") {
    return "comp_vip";
  }

  if (status === "pending-payment") {
    return "pending_payment";
  }

  return status;
}

function getNumericValue(value?: string, fallback = 0) {
  const parsedValue = Number(String(value ?? "").replace(/[^\d.-]/g, ""));

  return Number.isFinite(parsedValue) ? parsedValue : fallback;
}

function getBooleanValue(value?: string) {
  return ["1", "true", "yes", "y"].includes(normalizeValue(value));
}

function splitName(value?: string) {
  const name = value?.trim() || "Imported Guest";
  const [firstName = name, ...surnameParts] = name.split(/\s+/);

  return {
    firstName,
    surname: surnameParts.join(" "),
  };
}

function getLocation(value?: string): EntryLocationKey | null {
  const normalized = normalizeValue(value);

  if (
    normalized === "cape-town" ||
    normalized === "cape town" ||
    normalized === "cape town — the night court" ||
    normalized === "cape town - the night court"
  ) {
    return "cape-town";
  }

  if (
    normalized === "johannesburg" ||
    normalized === "joburg" ||
    normalized === "johannesburg — the spring court" ||
    normalized === "johannesburg - the spring court"
  ) {
    return "johannesburg";
  }

  return null;
}

function getShowAliases(show: ShowRow) {
  return [
    show.id,
    show.name,
    show.date,
    `${show.name} ${show.date}`,
  ].map(normalizeValue);
}

function getShowLabel(show: ShowRow) {
  return `${show.name} · ${show.date} · ${show.time.slice(0, 5)}`;
}

function serializeBooking(booking: DemoBooking) {
  return `${bookingMetadataPrefix}${JSON.stringify(booking)}`;
}

function buildDemoBooking(row: PreviewRow, show: ShowRow, table: TableRow | null) {
  const values = row.values;
  const reference = values.booking_reference.trim();
  const zone =
    seatingZones.find(
      (candidate) =>
        normalizeValue(candidate.title) === normalizeValue(values.seating_zone) ||
        normalizeValue(candidate.id) === normalizeValue(values.seating_zone),
    ) ?? seatingZones[0];
  const totalPrice = getNumericValue(values.booking_total);
  const amountPaid = getNumericValue(values.amount_paid);
  const balanceDue = getNumericValue(
    values.balance_due,
    Math.max(totalPrice - amountPaid, 0),
  );
  const partySize = Math.max(1, Math.round(getNumericValue(values.number_of_guests, 1)));
  const paymentStatus = getBooleanValue(values.complimentary_flag)
    ? "comp-vip"
    : paymentStatusMap[normalizeValue(values.payment_status)] ?? "pending-payment";
  const location = getLocation(values.location) ?? "cape-town";
  const locationOption = getShowLocationOption(location);
  const now = new Date().toISOString();

  return {
    addons: [],
    addonsTotal: 0,
    amountPaid,
    balanceDue,
    bookingDate: getShowLabel(show),
    communicationHistory: [],
    createdAt: values.booking_date || now,
    customer: {
      email: values.customer_email?.trim() ?? "",
      name: values.customer_name?.trim() || "Imported Guest",
      phone: values.customer_phone?.trim() ?? "",
    },
    discountAmount: 0,
    lifecycleHistory: [],
    operationalNotes: values.guest_notes?.trim() ?? "",
    partySize,
    paymentOption: "deposit",
    paymentStatus,
    pricePerPerson: partySize > 0 ? Math.round(totalPrice / partySize) : 0,
    reference,
    refundNotes: "",
    serviceFeeAmount: 0,
    showId: show.id,
    source: getBooleanValue(values.corporate_flag) ? "corporate-direct" : "admin",
    status: bookingStatusMap[normalizeValue(values.booking_status)] ?? "pending-payment",
    subtotalPrice: totalPrice,
    tableId: table?.id ?? "imported-table",
    tableNumber: table?.table_code ?? values.table?.trim() ?? "Not recorded",
    ticketCode: createTicketCode(reference),
    ticketIssuedAt: now,
    totalPrice,
    zoneId: zone.id,
    zoneTitle: zone.title || locationOption.courtName,
  } satisfies DemoBooking;
}

async function getImportHistory(
  serviceClient: NonNullable<Awaited<ReturnType<typeof requireActiveStaff>>["serviceClient"]>,
) {
  const { data, error } = await serviceClient
    .from("data_portability_import_runs")
    .select(
      "id,dataset,started_at,completed_at,initiated_by,original_file_name,total_rows,valid_rows,created_count,updated_count,skipped_count,failed_count,final_status,duration_ms,restore_point_id,error_summary,result_log,staff_profiles(full_name,email)",
    )
    .order("started_at", { ascending: false })
    .limit(50);

  if (error) {
    throw error;
  }

  return data ?? [];
}

async function enrichRowsForTransaction(
  serviceClient: NonNullable<Awaited<ReturnType<typeof requireActiveStaff>>["serviceClient"]>,
  dataset: DataPortabilityEntity,
  rows: PreviewRow[],
) {
  if (dataset === "customers") {
    return rows.map((row) => ({
      ...row,
      values: {
        ...row.values,
        email: row.values.email?.trim().toLowerCase() ?? "",
      },
    }));
  }

  const [{ data: shows, error: showsError }, { data: tables, error: tablesError }] =
    await Promise.all([
      serviceClient.from("shows").select("id,name,date,time,venue,notes"),
      serviceClient.from("show_tables").select("id,show_id,table_code,section"),
    ]);

  if (showsError) {
    throw showsError;
  }

  if (tablesError) {
    throw tablesError;
  }

  const showRows = (shows ?? []) as ShowRow[];
  const tableRows = (tables ?? []) as TableRow[];

  return rows.map((row) => {
    if (!row.valid || row.action === "Skip") {
      return row;
    }

    const values = row.values;
    const showValue = normalizeValue(values.show);
    const showDate = values.show_date?.trim();
    const location = getLocation(values.location);
    const matchedShow = showRows.find((show) => {
      const showLocation = getLocation(show.venue);

      return (
        (showValue ? getShowAliases(show).includes(showValue) : true) &&
        (showDate ? show.date === showDate : true) &&
        (location ? showLocation === location : true)
      );
    });

    if (!matchedShow) {
      throw new Error(`Row ${row.rowNumber}: referenced show is no longer valid.`);
    }

    const matchedTable =
      tableRows.find(
        (table) =>
          table.show_id === matchedShow.id &&
          normalizeValue(table.table_code) === normalizeValue(values.table),
      ) ?? null;
    const booking = buildDemoBooking(row, matchedShow, matchedTable);

    return {
      ...row,
      values: {
        ...values,
        resolved_booking_source: booking.source ?? "admin",
        resolved_booking_status: toSupabaseBookingStatus(values.booking_status),
        resolved_payment_status: toSupabasePaymentStatus(values.payment_status),
        resolved_show_id: matchedShow.id,
        resolved_table_id: matchedTable?.id ?? "",
        serialized_booking: serializeBooking(booking),
      },
    };
  });
}

export async function GET(request: Request) {
  const { error, serviceClient, staffProfile } = await requireActiveStaff(request);

  if (error) {
    return error;
  }

  if (!isSuperAdminProfile(staffProfile)) {
    await tryRecordAuditEvent(serviceClient, staffProfile, null, {
      action: "data-portability.access",
      entityReference: "imports",
      entityType: "data-portability-import",
      outcome: "blocked",
      reason: "Super Admin access is required.",
      request,
      sourceArea: "Data Portability",
    });

    return Response.json({ error: "Super Admin access is required." }, { status: 403 });
  }

  try {
    const rows = await getImportHistory(serviceClient);

    return Response.json({ rows });
  } catch (loadError) {
    console.error("[Zingara data portability] Failed to load import history", loadError);

    return Response.json(
      { error: "Import history could not be loaded." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const { error, serviceClient, staffProfile } = await requireActiveStaff(request);

  if (error) {
    return error;
  }

  if (!isSuperAdminProfile(staffProfile)) {
    await tryRecordAuditEvent(serviceClient, staffProfile, null, {
      action: "data-portability.access",
      entityReference: "imports",
      entityType: "data-portability-import",
      outcome: "blocked",
      reason: "Super Admin access is required.",
      request,
      sourceArea: "Data Portability",
    });

    return Response.json({ error: "Super Admin access is required." }, { status: 403 });
  }

  let auditContext: {
    action?: string;
    dataset?: DataPortabilityEntity;
    entityReference: string;
    entityType: "data-portability-import" | "data-portability-restore";
    rowCount?: number;
  } = {
    entityReference: "unknown-import",
    entityType: "data-portability-import",
  };

  try {
    const body = (await request.json()) as ImportRequestBody;

    if (body.action === "execute") {
      auditContext = {
        action: body.action,
        dataset: body.dataset,
        entityReference: body.fileName,
        entityType: "data-portability-import",
        rowCount: body.rows.length,
      };
    } else {
      auditContext = {
        action: body.action,
        entityReference: body.importId,
        entityType: "data-portability-restore",
      };
    }

    if (body.action === "restore-preview") {
      const { data, error: restoreError } = await serviceClient
        .from("data_portability_restore_points")
        .select("id,import_id,dataset,created_at,restored_at,restore_count,affected_bookings,affected_customers")
        .eq("import_id", body.importId)
        .maybeSingle();

      if (restoreError) {
        throw restoreError;
      }

      return Response.json({
        restorePoint: data
          ? {
              bookingCount: Array.isArray(data.affected_bookings)
                ? data.affected_bookings.length
                : 0,
              customerCount: Array.isArray(data.affected_customers)
                ? data.affected_customers.length
                : 0,
              dataset: data.dataset,
              id: data.id,
              restoredAt: data.restored_at,
              restoreCount: data.restore_count,
            }
          : null,
      });
    }

    if (body.action === "restore") {
      const { data, error: restoreError } = await serviceClient.rpc(
        "restore_data_portability_import",
        {
          p_import_id: body.importId,
          p_staff_profile_id: staffProfile.id,
        },
      );

      if (restoreError) {
        throw restoreError;
      }

      await tryRecordAuditEvent(serviceClient, staffProfile, null, {
        action: "data-portability.restore-completed",
        afterValues: {
          result: typeof data === "string" ? data : JSON.stringify(data ?? {}),
        },
        entityReference: body.importId,
        entityType: "data-portability-restore",
        outcome: "success",
        reason: "Restore completed from import restore point.",
        request,
        sourceArea: "Data Portability",
      });

      return Response.json({ result: data });
    }

    if (body.action !== "execute") {
      return Response.json(
        { error: "Unsupported import action." },
        { status: 400 },
      );
    }

    const previewHash = hashImportRows(body.rows);
    const enrichedRows = await enrichRowsForTransaction(
      serviceClient,
      body.dataset,
      body.rows,
    );
    const enrichedHash = hashImportRows(enrichedRows);

    if (!previewHash || enrichedRows.length !== body.rows.length) {
      return Response.json(
        { error: "Import payload could not be revalidated." },
        { status: 400 },
      );
    }

    await tryRecordAuditEvent(serviceClient, staffProfile, null, {
      action: "data-portability.import-started",
      afterValues: {
        dataset: body.dataset,
        fileName: body.fileName,
        rowCount: body.rows.length,
      },
      entityReference: body.fileName,
      entityType: "data-portability-import",
      outcome: "success",
      request,
      sourceArea: "Data Portability",
    });

    const { data, error: importError } = await serviceClient.rpc(
      "execute_data_portability_import",
      {
        p_dataset: body.dataset,
        p_file_name: body.fileName,
        p_preview_hash: enrichedHash,
        p_rows: enrichedRows,
        p_staff_profile_id: staffProfile.id,
        p_started_at: new Date().toISOString(),
      },
    );

    if (importError) {
      throw importError;
    }

    try {
      await recordAuditEvent(serviceClient, staffProfile, null, {
        action: "data-portability.import-completed",
        afterValues:
          typeof data === "object" && data
            ? (data as Record<string, never>)
            : pickAuditFields(
                {
                  result: String(data ?? "completed"),
                },
                ["result"],
              ),
        entityReference: body.fileName,
        entityType: "data-portability-import",
        outcome: "success",
        reason: `${body.dataset} import completed.`,
        request,
        sourceArea: "Data Portability",
      });
    } catch {
      return Response.json(
        {
          auditError:
            "Import completed, but the audit event could not be recorded.",
          result: data,
        },
        { status: 500 },
      );
    }

    return Response.json({ result: data });
  } catch (importError) {
    console.error("[Zingara data portability] Import request failed", importError);

    if (serviceClient && staffProfile) {
      if (auditContext.action === "execute" && auditContext.dataset) {
        const failureMessage =
          importError instanceof Error
            ? importError.message
            : "Import request failed.";
        const failureHash = createHash("sha256")
          .update(
            JSON.stringify({
              dataset: auditContext.dataset,
              error: failureMessage,
              fileName: auditContext.entityReference,
              rowCount: auditContext.rowCount ?? 0,
            }),
          )
          .digest("hex");
        const { data: failedRun } = await serviceClient
          .from("data_portability_import_runs")
          .insert({
            dataset: auditContext.dataset,
            completed_at: new Date().toISOString(),
            error_summary: failureMessage,
            failed_count: auditContext.rowCount ?? 0,
            final_status: "failed",
            initiated_by: staffProfile.id,
            original_file_name: auditContext.entityReference,
            preview_hash: failureHash,
            result_log: [
              {
                action: "Skip",
                errors: [failureMessage],
                message: "Import failed before any changes were committed.",
                status: "Failed",
              },
            ],
            total_rows: auditContext.rowCount ?? 0,
          })
          .select("id")
          .maybeSingle();

        if (failedRun?.id) {
          await serviceClient.from("data_portability_audit_events").insert({
            counts: {
              rows: auditContext.rowCount ?? 0,
            },
            dataset: auditContext.dataset,
            event_type: "import_failed",
            import_id: failedRun.id,
            outcome: "failed",
            staff_profile_id: staffProfile.id,
          });
        }
      }

      await tryRecordAuditEvent(serviceClient, staffProfile, null, {
        action:
          auditContext.action === "restore"
            ? "data-portability.restore-failed"
            : "data-portability.import-failed",
        entityReference: auditContext.entityReference,
        entityType: auditContext.entityType,
        outcome: "failed",
        reason:
          importError instanceof Error
            ? importError.message
            : "Import request failed.",
        request,
        sourceArea: "Data Portability",
      });
    }

    return Response.json(
      {
        error:
          importError instanceof Error
            ? importError.message
            : "Import could not be completed.",
      },
      { status: 500 },
    );
  }
}
