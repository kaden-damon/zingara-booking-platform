import { buildBookingsWorkbook, bookingsExportFilename } from "@/lib/exports/bookingsWorkbook";
import {
  BookingsExportError,
  loadBookingsExportRows,
} from "@/lib/supabase/bookingsExportServer";
import { getRolePermissions, requireActiveStaff } from "@/lib/supabase/serverAdmin";
import { tryRecordAuditEvent } from "@/lib/supabase/serverAudit";
import { resolveBookingCreatedWindow } from "@/lib/bookingSalesFilters";
import { normalizeStaffVenueScope } from "@/lib/staffLocations";
import type { AdminBookingListFilters } from "@/lib/adminBookingList";

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
      filters?: AdminBookingListFilters;
      filterSummary?: unknown;
      references?: unknown;
    };
    let references = parseReferences(body.references);

    if (body.filters) {
      const createdWindow = resolveBookingCreatedWindow({
        filter: body.filters.bookingCreatedDateFilter,
        from: body.filters.bookingCreatedFrom,
        specificDate: body.filters.bookingCreatedSpecificDate,
        to: body.filters.bookingCreatedTo,
      });
      if (createdWindow.error) {
        return Response.json({ error: createdWindow.error }, { status: 400 });
      }

      const { data, error } = await auth.serviceClient.rpc(
        "get_admin_booking_page",
        {
          p_authorized_venues: normalizeStaffVenueScope(
            auth.staffProfile.venue_scope ?? [],
          ),
          p_filters: {
            archive: body.filters.archive,
            bookingDate: body.filters.bookingDate,
            bookingStatus: body.filters.bookingStatus,
            createdBy: body.filters.createdBy,
            createdFrom: createdWindow.startMs === null
              ? ""
              : new Date(createdWindow.startMs).toISOString(),
            createdToExclusive: createdWindow.endExclusiveMs === null
              ? ""
              : new Date(createdWindow.endExclusiveMs).toISOString(),
            hideCancelled: body.filters.hideCancelled,
            kind: body.filters.kind,
            location: body.filters.location,
            paymentStatus: body.filters.paymentStatus,
            performanceFrom: body.filters.performanceFrom,
            performanceTo: body.filters.performanceTo,
            promo: body.filters.promo,
            search: body.filters.search,
            seatingZone: body.filters.seatingZone,
            show: body.filters.show,
            sortDirection: body.filters.sortDirection,
            sortKey: body.filters.sortKey,
            source: body.filters.source,
          },
          p_page: 1,
          p_page_size: 10000,
        },
      );
      if (error) throw error;
      references = ((data as { ids?: string[] } | null)?.ids ?? []).length > 0
        ? await resolveBookingReferences(auth.serviceClient, (data as { ids: string[] }).ids)
        : [];
    }
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

async function resolveBookingReferences(
  serviceClient: NonNullable<Awaited<ReturnType<typeof requireActiveStaff>>["serviceClient"]>,
  ids: string[],
) {
  const references: string[] = [];
  for (let index = 0; index < ids.length; index += 500) {
    const { data, error } = await serviceClient
      .from("bookings")
      .select("id,booking_reference")
      .in("id", ids.slice(index, index + 500));
    if (error) throw error;
    const byId = new Map((data ?? []).map((row) => [row.id, row.booking_reference]));
    references.push(
      ...ids.slice(index, index + 500)
        .map((id) => byId.get(id))
        .filter((reference): reference is string => Boolean(reference)),
    );
  }
  return references;
}
