import {
  buildTablePlanWorkbook,
  type TablePlanBooking,
  type TablePlanCustomer,
  type TablePlanPayment,
  type TablePlanShow,
  type TablePlanTable,
} from "@/lib/exports/tablePlan";
import type { TablePlanLegacyPaymentEvidence } from "@/lib/exports/tablePlanFinance";
import { normalizeStaffVenueScope } from "@/lib/staffLocations";
import {
  getRolePermissions,
  requireActiveStaff,
} from "@/lib/supabase/serverAdmin";
import {
  defaultVenueSettings,
  normalizeShowLocation,
  normalizeVenueSettings,
} from "@/lib/zingaraDemo";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type ShowRow = TablePlanShow & {
  notes: string | null;
};

type CustomerNameAuditRow = {
  after_values: Record<string, unknown> | null;
  before_values: Record<string, unknown> | null;
  created_at: string;
  entity_id: string;
};

function normalizeNameValue(value: unknown) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

function isEmailLikeName(value: string) {
  return value.includes("@");
}

function getRole(profile: NonNullable<Awaited<ReturnType<typeof requireActiveStaff>>["staffProfile"]>) {
  return Array.isArray(profile.roles) ? profile.roles[0] : profile.roles;
}

function hasLocationAccess(venueScope: string[], location: "cape-town" | "johannesburg") {
  const normalizedScope = normalizeStaffVenueScope(venueScope);

  return normalizedScope.includes("all") || normalizedScope.includes(location);
}

function getFileLocation(location: "cape-town" | "johannesburg") {
  return location === "johannesburg" ? "JHB" : "CPT";
}

export async function GET(request: Request) {
  const auth = await requireActiveStaff(request);

  if (auth.error || !auth.serviceClient || !auth.staffProfile) {
    return auth.error ?? Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (!getRolePermissions(getRole(auth.staffProfile)).includes("analytics:read")) {
    return Response.json(
      { error: "You do not have permission to export table plans." },
      { status: 403 },
    );
  }

  const requestedShowId = new URL(request.url).searchParams.get("showId")?.trim();

  if (!requestedShowId) {
    return Response.json({ error: "A performance is required." }, { status: 400 });
  }

  try {
    const { data: show, error: showError } = await auth.serviceClient
      .from("shows")
      .select("id,name,date,time,venue,notes")
      .eq("id", requestedShowId)
      .maybeSingle();

    if (showError) {
      throw showError;
    }

    if (!show) {
      return Response.json({ error: "The selected performance was not found." }, { status: 404 });
    }

    const typedShow = show as ShowRow;
    const location = normalizeShowLocation(typedShow.venue);

    if (!location) {
      return Response.json(
        { error: "The selected performance has an unsupported location." },
        { status: 422 },
      );
    }

    if (!hasLocationAccess(auth.staffProfile.venue_scope, location)) {
      return Response.json(
        { error: "You do not have access to this performance location." },
        { status: 403 },
      );
    }

    const [
      { data: tableRows, error: tableError },
      { data: bookingRows, error: bookingError },
      { data: venueSettingsRow, error: venueSettingsError },
    ] =
      await Promise.all([
        auth.serviceClient
          .from("show_tables")
          .select(
            "id,table_code,section,capacity,capacity_configured,status,booking_id,is_override,is_physical,availability_scope,merged_from,merged_parent_id,override_notes",
          )
          .eq("show_id", typedShow.id)
          .order("section", { ascending: true })
          .order("table_code", { ascending: true }),
        auth.serviceClient
          .from("bookings")
          .select(
            "id,customer_id,table_id,booking_reference,guest_count,booking_status,payment_status,section,total_amount,amount_paid,balance_outstanding,notes,dietary_requirements,archived_at,booking_origin",
          )
          .eq("show_id", typedShow.id)
          .not("table_id", "is", null),
        auth.serviceClient
          .from("venue_settings")
          .select("settings")
          .eq(
            "venue_key",
            defaultVenueSettings.venueId || "zingara-cape-town",
          )
          .maybeSingle(),
      ]);

    if (tableError) {
      throw tableError;
    }

    if (bookingError) {
      throw bookingError;
    }

    if (venueSettingsError) {
      throw venueSettingsError;
    }

    if (!venueSettingsRow?.settings) {
      throw new Error("Authoritative Venue Configuration is unavailable.");
    }

    const venueSettings = normalizeVenueSettings(venueSettingsRow.settings);

    const bookings = (bookingRows ?? []) as TablePlanBooking[];
    const customerIds = Array.from(
      new Set(bookings.map((booking) => booking.customer_id).filter(Boolean)),
    ) as string[];
    const bookingIds = bookings.map((booking) => booking.id);

    const customerRequest = customerIds.length
      ? auth.serviceClient
          .from("customers")
          .select(
            "id,first_name,surname,email,mobile,relationship_notes,dietary_requirements",
          )
          .in("id", customerIds)
      : Promise.resolve({ data: [], error: null });
    const paymentRequest = bookingIds.length
      ? auth.serviceClient
          .from("payments")
          .select(
            "booking_id,payment_type,payment_status,amount,method,notes,provider_transaction_id,provider_gross_amount,transaction_fee_amount",
          )
          .in("booking_id", bookingIds)
      : Promise.resolve({ data: [], error: null });
    const legacyPaymentEvidenceRequest = bookingIds.length
      ? auth.serviceClient
          .from("legacy_booking_payment_evidence")
          .select(
            "booking_id,complimentary,complimentary_amount,source_ticket_amount,full_card_amount,pre_paid_card_amount,pre_paid_eft_amount,full_eft_amount,ticket_gratuity_amount,bar_tab_paid_amount,bar_gratuity_amount,halaal_meals_amount,kosher_meals_amount",
          )
          .in("booking_id", bookingIds)
      : Promise.resolve({ data: [], error: null });
    const [customerResult, paymentResult, legacyPaymentEvidenceResult] = await Promise.all([
      customerRequest,
      paymentRequest,
      legacyPaymentEvidenceRequest,
    ]);

    if (customerResult.error) {
      throw customerResult.error;
    }

    if (paymentResult.error) {
      throw paymentResult.error;
    }

    if (legacyPaymentEvidenceResult.error) {
      throw legacyPaymentEvidenceResult.error;
    }

    const customers = (customerResult.data ?? []) as TablePlanCustomer[];
    const emailNamedCustomerIds = customers
      .filter((customer) =>
        isEmailLikeName(
          `${customer.first_name ?? ""} ${customer.surname ?? ""}`,
        ),
      )
      .map((customer) => customer.id);
    const customerNameAuditResult = emailNamedCustomerIds.length
      ? await auth.serviceClient
          .from("audit_events")
          .select("entity_id,before_values,after_values,created_at")
          .eq("action", "customer.edit")
          .in("entity_id", emailNamedCustomerIds)
          .order("created_at", { ascending: false })
      : { data: [], error: null };

    if (customerNameAuditResult.error) {
      throw customerNameAuditResult.error;
    }

    const auditsByCustomerId = new Map<string, CustomerNameAuditRow[]>();

    for (const audit of (customerNameAuditResult.data ?? []) as CustomerNameAuditRow[]) {
      auditsByCustomerId.set(audit.entity_id, [
        ...(auditsByCustomerId.get(audit.entity_id) ?? []),
        audit,
      ]);
    }

    const customersWithNameHistory = customers.map((customer) => {
      const currentFirstName = normalizeNameValue(customer.first_name);
      const matchingAudit = (auditsByCustomerId.get(customer.id) ?? []).find(
        (audit) => {
          const afterFirstName = normalizeNameValue(
            audit.after_values?.first_name,
          );
          const beforeFirstName = normalizeNameValue(
            audit.before_values?.first_name,
          );

          return (
            afterFirstName.toLowerCase() === currentFirstName.toLowerCase() &&
            !isEmailLikeName(beforeFirstName) &&
            /[A-Za-z]/.test(beforeFirstName)
          );
        },
      );

      return {
        ...customer,
        historical_first_name:
          normalizeNameValue(matchingAudit?.before_values?.first_name) || null,
        historical_surname:
          normalizeNameValue(matchingAudit?.before_values?.surname) || null,
      };
    });

    const workbook = await buildTablePlanWorkbook({
      bookings,
      configuredZonePrices: {
        "golden-circle": venueSettings.zonePricing["golden-circle"].price,
        "middle-ring": venueSettings.zonePricing["middle-ring"].price,
        "private-booths": venueSettings.zonePricing["royal-booths"].price,
        "royal-balcony": venueSettings.zonePricing["royal-balcony"].price,
      },
      customers: customersWithNameHistory,
      legacyPaymentEvidence:
        (legacyPaymentEvidenceResult.data ?? []) as TablePlanLegacyPaymentEvidence[],
      payments: (paymentResult.data ?? []) as TablePlanPayment[],
      show: typedShow,
      tables: (tableRows ?? []) as TablePlanTable[],
    });
    const filename = `Zingara_Table_Plan_${getFileLocation(location)}_${typedShow.date}.xlsx`;

    return new Response(new Uint8Array(workbook), {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      },
    });
  } catch (error) {
    console.error("[Zingara table plan export] Export failed", error);

    return Response.json(
      { error: "The table plan could not be generated." },
      { status: 500 },
    );
  }
}
