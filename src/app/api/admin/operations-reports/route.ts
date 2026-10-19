import { getRolePermissions, requireActiveStaff } from "@/lib/supabase/serverAdmin";
import { normalizeStaffVenueScope } from "@/lib/staffLocations";
import { normalizeShowLocation } from "@/lib/zingaraDemo";
import {
  isOperationalReportType,
  operationalReportColumns,
  operationalReportLabels,
  type OperationalReportRow,
} from "@/lib/operationsReports";

export const dynamic = "force-dynamic";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function money(value: unknown) {
  return Number(Number(value ?? 0).toFixed(2));
}

function metadata(notes: unknown) {
  const prefix = "__zingara_booking_meta__:";
  if (typeof notes !== "string" || !notes.startsWith(prefix)) return null;
  try {
    return JSON.parse(notes.slice(prefix.length)) as {
      arrivalTime?: string;
      customer?: { email?: string; name?: string; phone?: string };
      operationalNotes?: string;
    };
  } catch {
    return null;
  }
}

function statusLabel(value: unknown) {
  return text(value).replaceAll("_", " ").replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function zoneLabel(booking: Record<string, unknown>) {
  const entitlements = Array.isArray(booking.zone_entitlements)
    ? booking.zone_entitlements as Array<{ pax?: number; zoneId?: string }>
    : [];
  if (entitlements.length) {
    return entitlements
      .map((entry) => `${statusLabel(entry.zoneId)} ${Number(entry.pax ?? 0)}`)
      .join(" / ");
  }
  return statusLabel(booking.section) || "Not assigned";
}

export async function GET(request: Request) {
  const auth = await requireActiveStaff(request);
  if (auth.error || !auth.serviceClient || !auth.staffProfile) return auth.error;
  const role = Array.isArray(auth.staffProfile.roles) ? auth.staffProfile.roles[0] : auth.staffProfile.roles;
  const permissions = getRolePermissions(role);
  if (!permissions.includes("analytics:read") && !permissions.includes("bookings:manage")) {
    return Response.json({ error: "Reports access is required." }, { status: 403 });
  }

  const url = new URL(request.url);
  const reportType = url.searchParams.get("type") ?? "";
  const showId = url.searchParams.get("showId") ?? "";
  if (!isOperationalReportType(reportType) || !uuidPattern.test(showId)) {
    return Response.json({ error: "Choose a valid report and performance." }, { status: 400 });
  }

  try {
    const { data: show, error: showError } = await auth.serviceClient
      .from("shows")
      .select("id,name,date,time,venue")
      .eq("id", showId)
      .maybeSingle();
    if (showError) throw showError;
    if (!show) return Response.json({ error: "Performance could not be found." }, { status: 404 });

    const venue = normalizeShowLocation(show.venue);
    const scope = normalizeStaffVenueScope(auth.staffProfile.venue_scope ?? []);
    if (!venue || (!scope.includes("all") && !scope.includes(venue))) {
      return Response.json({ error: "This performance is outside your assigned location." }, { status: 403 });
    }
    const date = url.searchParams.get("date") ?? "";
    if (date && date !== show.date) return Response.json({ rows: [], total: 0, columns: operationalReportColumns[reportType] });

    let bookingsQuery = auth.serviceClient
      .from("bookings")
      .select("id,booking_reference,customer_id,guest_count,booking_status,payment_status,section,zone_entitlements,total_amount,amount_paid,balance_outstanding,table_id,notes,created_at")
      .eq("show_id", show.id)
      .is("archived_at", null)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true });
    const bookingStatus = url.searchParams.get("bookingStatus") ?? "all";
    const paymentStatus = url.searchParams.get("paymentStatus") ?? "all";
    const zone = url.searchParams.get("zone") ?? "all";
    if (bookingStatus !== "all") bookingsQuery = bookingsQuery.eq("booking_status", bookingStatus.replaceAll("-", "_"));
    if (paymentStatus !== "all") bookingsQuery = bookingsQuery.eq("payment_status", paymentStatus.replaceAll("-", "_"));
    const { data: bookings, error: bookingsError } = await bookingsQuery;
    if (bookingsError) throw bookingsError;

    const filteredBookings = (bookings ?? []).filter((booking) => {
      if (zone === "all") return true;
      const sectionKey = text(booking.section).toLowerCase().replaceAll(" ", "-");
      const entitlements = Array.isArray(booking.zone_entitlements)
        ? booking.zone_entitlements as Array<{ zoneId?: string }>
        : [];
      return sectionKey === zone || entitlements.some((entry) => entry.zoneId === zone);
    });

    const customerIds = [...new Set(filteredBookings.map((row) => row.customer_id).filter(Boolean))];
    const bookingIds = filteredBookings.map((row) => row.id);
    const [customersResult, tablesResult] = await Promise.all([
      customerIds.length
        ? auth.serviceClient.from("customers").select("id,first_name,surname,email,mobile").in("id", customerIds)
        : Promise.resolve({ data: [], error: null }),
      bookingIds.length
        ? auth.serviceClient.from("show_tables").select("booking_id,table_code").in("booking_id", bookingIds).order("table_code")
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (customersResult.error) throw customersResult.error;
    if (tablesResult.error) throw tablesResult.error;
    const customers = new Map((customersResult.data ?? []).map((customer) => [customer.id, customer]));
    const tables = new Map<string, string[]>();
    for (const table of tablesResult.data ?? []) {
      const current = tables.get(table.booking_id) ?? [];
      current.push(table.table_code);
      tables.set(table.booking_id, current);
    }

    const rows: OperationalReportRow[] = filteredBookings.map((booking) => {
      const customer = customers.get(booking.customer_id);
      const snapshot = metadata(booking.notes);
      const base = {
        "Booking Ref": booking.booking_reference,
        Customer: [customer?.first_name, customer?.surname].filter(Boolean).join(" ") || snapshot?.customer?.name || "Not recorded",
        Email: customer?.email || snapshot?.customer?.email || "",
        Phone: customer?.mobile || snapshot?.customer?.phone || "",
        Guests: Number(booking.guest_count ?? 0),
        Zone: zoneLabel(booking as Record<string, unknown>),
        Table: (tables.get(booking.id) ?? []).join(" + ") || "Needs a table",
        "Booking Status": statusLabel(booking.booking_status),
        "Payment Status": statusLabel(booking.payment_status),
        Notes: snapshot?.operationalNotes || "",
      };
      if (reportType === "guest-list") {
        return Object.fromEntries(operationalReportColumns[reportType].map((column) => [column, base[column as keyof typeof base] ?? ""]));
      }
      if (reportType === "check-ins") {
        const checkedIn = text(booking.booking_status).replaceAll("_", "-") === "checked-in";
        const values = { ...base, "Arrival Time": snapshot?.arrivalTime || "", "Checked In": checkedIn ? "Yes" : "No", Signature: "" };
        return Object.fromEntries(operationalReportColumns[reportType].map((column) => [column, values[column as keyof typeof values] ?? ""]));
      }
      const values = {
        ...base,
        "Booking Value": money(booking.total_amount),
        Paid: money(booking.amount_paid),
        Outstanding: money(booking.balance_outstanding),
      };
      return Object.fromEntries(operationalReportColumns[reportType].map((column) => [column, values[column as keyof typeof values] ?? ""]));
    });

    return Response.json({
      columns: operationalReportColumns[reportType],
      label: operationalReportLabels[reportType],
      performance: `${show.name} · ${show.venue} · ${show.date} · ${text(show.time).slice(0, 5)}`,
      rows,
      total: rows.length,
      totalGuests: rows.reduce((sum, row) => sum + Number(row.Guests ?? 0), 0),
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("[Zingara API] Operations report failed", error);
    return Response.json({ error: "The report couldn't be loaded. Try again." }, { status: 500 });
  }
}
