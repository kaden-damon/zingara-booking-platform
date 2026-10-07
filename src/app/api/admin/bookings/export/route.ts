import { buildBookingsWorkbook, bookingsExportFilename } from "@/lib/exports/bookingsWorkbook";
import {
  BookingsExportError,
  loadBookingsExportRows,
} from "@/lib/supabase/bookingsExportServer";
import { getRolePermissions, requireActiveStaff } from "@/lib/supabase/serverAdmin";
import { tryRecordAuditEvent } from "@/lib/supabase/serverAudit";

export const dynamic = "force-dynamic";

function roleOf(
  profile: NonNullable<
    Awaited<ReturnType<typeof requireActiveStaff>>["staffProfile"]
  >,
) {
  return Array.isArray(profile.roles) ? profile.roles[0] : profile.roles;
}

function parseReferences(value: unknown) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value
    .filter((reference): reference is string => typeof reference === "string")
    .map((reference) => reference.trim())
    .filter((reference) => reference.length > 0 && reference.length <= 100))];
}

export async function POST(request: Request) {
  const auth = await requireActiveStaff(request);
  if (auth.error || !auth.serviceClient || !auth.staffProfile || !auth.user) {
    return auth.error ?? Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  const permissions = getRolePermissions(roleOf(auth.staffProfile));
  if (
    !permissions.includes("bookings:manage") &&
    !permissions.includes("tickets:validate")
  ) {
    return Response.json(
      { error: "Bookings access is required." },
      { status: 403 },
    );
  }

  try {
    const body = (await request.json()) as {
      filterSummary?: unknown;
      references?: unknown;
    };
    const references = parseReferences(body.references);
    if (references.length === 0) {
      return Response.json(
        { error: "No bookings match the current filters." },
        { status: 400 },
      );
    }

    const exportedAt = new Date().toISOString();
    const filterSummary =
      typeof body.filterSummary === "string" && body.filterSummary.trim()
        ? body.filterSummary.trim()
        : "Current Bookings filters";
    const rows = await loadBookingsExportRows(
      auth.serviceClient,
      references,
      auth.staffProfile.venue_scope,
    );
    const workbook = await buildBookingsWorkbook({
      exportedAt,
      exportedBy: auth.staffProfile.full_name,
      filterSummary,
      rows,
    });

    await tryRecordAuditEvent(
      auth.serviceClient,
      auth.staffProfile,
      auth.user,
      {
        action: "bookings.filtered_exported",
        afterValues: {
          filter_summary: filterSummary.slice(0, 1000),
          row_count: rows.length,
        },
        entityReference: "bookings-filtered-export",
        entityType: "data-portability-export",
        outcome: "success",
        reason: "Authorised filtered Bookings workbook download.",
        request,
        sourceArea: "Bookings",
      },
    );

    return new Response(new Uint8Array(workbook), {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Disposition": `attachment; filename="${bookingsExportFilename(exportedAt)}"`,
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      },
    });
  } catch (error) {
    if (error instanceof BookingsExportError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    console.error("[Zingara Bookings] Filtered export failed", error);
    return Response.json(
      { error: "The bookings workbook could not be generated. Try again." },
      { status: 500 },
    );
  }
}
