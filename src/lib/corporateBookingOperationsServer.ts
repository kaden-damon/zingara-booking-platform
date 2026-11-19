import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createEmptyCorporateBookingOperations,
  normalizeCorporateBookingOperations,
  type CorporateBookingOperations,
  type CorporateOperationsBookingSnapshot,
  type CorporateOperationsDocument,
} from "@/lib/corporateBookingOperations";
import { buildCorporateOperationalPdf } from "@/lib/corporateBookingOperationsPdf";
import { resolveCorporateFunctionBriefFinancials, resolveFunctionBriefBuyoutComposition,
  type FunctionBriefBuyoutRow } from "@/lib/corporateFunctionBriefFinancials";
import { getDietaryAddonSummary } from "@/lib/bookingAddons";
import type { BookingAddon } from "@/lib/zingaraDemo";
import { readCorporateBuyoutAgreement } from "@/lib/corporateBuyoutAgreement";

type ServiceClient = SupabaseClient;

export type CorporateOperationsContext = {
  bookingId: string;
  location: string;
  operations: CorporateBookingOperations;
  snapshot: CorporateOperationsBookingSnapshot;
};

function money(value: unknown) {
  return Math.max(0, Math.round((Number(value) || 0) * 100) / 100);
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function titleCaseStatus(value: string) {
  return value.replaceAll("_", " ").replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

type BookingCreationAudit = {
  action?: string | null;
  actor_name?: string | null;
  actor_staff_profile_id?: string | null;
  outcome?: string | null;
};

export function resolveCorporateBookingCreator(input: {
  auditEvents: BookingCreationAudit[];
  creatorName: string | null | undefined;
  createdByStaffId: string | null | undefined;
}) {
  if (!input.createdByStaffId) return "Not recorded";
  const corroboratingEvent = input.auditEvents.find((event) =>
    event.outcome === "success" &&
    ["booking.provenance-recorded", "booking.create"].includes(event.action ?? "") &&
    event.actor_staff_profile_id === input.createdByStaffId,
  );
  return text(input.creatorName) || text(corroboratingEvent?.actor_name) || "Not recorded";
}

export async function loadCorporateOperationsContext(
  serviceClient: ServiceClient,
  bookingReference: string,
): Promise<CorporateOperationsContext | null> {
  const { data: booking, error: bookingError } = await serviceClient
    .from("bookings")
    .select("id,booking_reference,booking_source,booking_origin,corporate_request_id,customer_id,company_id,show_id,company_name,guest_count,section,zone_entitlements,service_fee,subtotal_amount,discount_amount,addons_total,total_amount,amount_paid,balance_outstanding,booking_status,payment_status,notes,dietary_requirements,created_by_staff_id,corporate_buyouts(package_snapshot,commercial_base_amount,commercial_vat_amount,commercial_gratuity_amount,commercial_additional_guest_amount,commercial_total_amount)")
    .eq("booking_reference", bookingReference.trim().toUpperCase())
    .maybeSingle();
  if (bookingError) throw bookingError;
  if (!booking) return null;
  if (
    booking.booking_source !== "corporate-direct" &&
    booking.booking_origin !== "corporate" &&
    !booking.corporate_request_id
  ) {
    throw new Error("NOT_CORPORATE_BOOKING");
  }

  const [showResult, customerResult, companyResult, requestByIdResult, requestByReferenceResult, operationsResult, evidenceResult, tableResult, creatorResult, creationAuditResult] = await Promise.all([
    serviceClient.from("shows").select("id,date,time,venue,notes").eq("id", booking.show_id).maybeSingle(),
    serviceClient.from("customers").select("id,first_name,surname,email,mobile,dietary_requirements").eq("id", booking.customer_id).maybeSingle(),
    booking.company_id
      ? serviceClient.from("companies").select("id,legal_name,trading_name").eq("id", booking.company_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    booking.corporate_request_id
      ? serviceClient.from("corporate_requests").select("id,company_name,contact_name,dietary_requirements,other_dietary_requirement,bar_tab,occasion,other_description").eq("id", booking.corporate_request_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    serviceClient.from("corporate_requests").select("id,company_name,contact_name,dietary_requirements,other_dietary_requirement,bar_tab,occasion,other_description").eq("linked_booking_reference", booking.booking_reference).maybeSingle(),
    serviceClient.from("corporate_booking_operations").select("*").eq("booking_id", booking.id).maybeSingle(),
    serviceClient.from("legacy_booking_payment_evidence").select("source_ticket_amount,ticket_gratuity_amount,bar_tab_paid_amount,bar_gratuity_amount").eq("booking_id", booking.id).maybeSingle(),
    serviceClient.from("show_tables").select("table_code").eq("booking_id", booking.id).order("table_code", { ascending: true }),
    booking.created_by_staff_id
      ? serviceClient.from("staff_profiles").select("full_name").eq("id", booking.created_by_staff_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    serviceClient.from("audit_events")
      .select("action,actor_name,actor_staff_profile_id,outcome")
      .eq("entity_reference", booking.booking_reference)
      .in("action", ["booking.provenance-recorded", "booking.create"])
      .order("created_at", { ascending: true })
      .limit(10),
  ]);
  const firstError = [showResult, customerResult, companyResult, requestByIdResult, requestByReferenceResult, operationsResult, evidenceResult, tableResult, creatorResult, creationAuditResult]
    .find((result) => result.error)?.error;
  if (firstError) throw firstError;
  if (!showResult.data) throw new Error("SHOW_NOT_FOUND");

  const request = requestByIdResult.data ?? requestByReferenceResult.data;
  const customerName = [customerResult.data?.first_name, customerResult.data?.surname].filter(Boolean).join(" ").trim();
  const evidence = evidenceResult.data;
  const operationRow = operationsResult.data as Record<string, unknown> | null;
  const operations = normalizeCorporateBookingOperations(operationRow ? {
    accessibilityNotes: operationRow.accessibility_notes,
    alcoholRestrictions: operationRow.alcohol_restrictions,
    barLimitInstructions: operationRow.bar_limit_instructions,
    barRequests: operationRow.bar_requests,
    barServicePlan: operationRow.bar_service_plan,
    checklist: operationRow.checklist,
    dietaryNotes: operationRow.dietary_notes,
    employeeName: operationRow.employee_name,
    eventRequirements: operationRow.event_requirements,
    functionNotes: operationRow.function_notes,
    gratuityAllocation: operationRow.gratuity_allocation,
    managerName: operationRow.manager_name,
    operationalBarLimit: operationRow.operational_bar_limit,
    revision: operationRow.revision,
    runningOrder: operationRow.running_order,
    settlementContact: operationRow.settlement_contact,
    specialRequests: operationRow.special_requests,
    updatedAt: operationRow.updated_at,
    wristbandDetails: operationRow.wristband_details,
  } : createEmptyCorporateBookingOperations());

  if (operationRow?.updated_by_staff_profile_id) {
    const { data: updater, error } = await serviceClient.from("staff_profiles")
      .select("full_name")
      .eq("id", operationRow.updated_by_staff_profile_id)
      .maybeSingle();
    if (error) throw error;
    operations.updatedByName = updater?.full_name ?? null;
  }

  const bookingDietary = text(booking.dietary_requirements);
  const agreement = readCorporateBuyoutAgreement(booking.notes, money(booking.total_amount));
  let structuredDietary = "";
  const prefix = "__zingara_booking_meta__:";
  if (booking.notes?.startsWith(prefix)) {
    try {
      const metadata = JSON.parse(booking.notes.slice(prefix.length));
      if (Array.isArray(metadata?.addons)) {
        structuredDietary = getDietaryAddonSummary(metadata.addons.filter(
          (addon: BookingAddon) => addon && typeof addon.id === "string" && typeof addon.name === "string",
        ));
      }
    } catch {
      // Unstructured historical notes remain available through existing fields.
    }
  }
  const dietaryRequirements = [
    ...(Array.isArray(request?.dietary_requirements) ? request.dietary_requirements : []),
    text(request?.other_dietary_requirement),
    text(customerResult.data?.dietary_requirements),
    bookingDietary,
    agreement ? (agreement.requirements.allocationUnconfirmed
      ? `Workbook meal quantity: ${agreement.requirements.sourceQuantity}. Strictly Halaal/Kosher allocation unconfirmed. Financial reconciliation only; supplier orders not created or confirmed.`
      : `Workbook requirements: ${agreement.requirements.strictlyHalaal} Strictly Halaal; ${agreement.requirements.kosher} Kosher. Financial reconciliation only; supplier orders not created or confirmed.`) : "",
    structuredDietary,
  ].filter((item): item is string => Boolean(item));
  const zoneEntitlements = Array.isArray(booking.zone_entitlements)
    ? booking.zone_entitlements as Array<{ pax?: number; zoneId?: string }>
    : [];
  const seating = zoneEntitlements.length > 0
    ? zoneEntitlements.map((entry) => `${titleCaseStatus(text(entry.zoneId))} ${Number(entry.pax) || 0}`).join(" / ")
    : titleCaseStatus(text(booking.section) || "Not assigned");
  const financials = resolveCorporateFunctionBriefFinancials({
    addonsTotal: money(booking.addons_total),
    amountPaid: money(booking.amount_paid),
    bookingOrigin: booking.booking_origin,
    bookingStatus: booking.booking_status,
    discountAmount: money(booking.discount_amount),
    evidence,
    notes: booking.notes,
    paymentStatus: booking.payment_status,
    serviceFee: money(booking.service_fee),
    subtotalAmount: money(booking.subtotal_amount),
    totalAmount: money(booking.total_amount),
  });
  const buyout = (Array.isArray(booking.corporate_buyouts)
    ? booking.corporate_buyouts[0] : booking.corporate_buyouts) as FunctionBriefBuyoutRow | null;
  const composition = resolveFunctionBriefBuyoutComposition(buyout ?? null, {
    notes: booking.notes,
    addonsTotal: money(booking.addons_total), serviceFee: money(booking.service_fee),
    totalAmount: money(booking.total_amount),
  });

  return {
    bookingId: booking.id,
    location: showResult.data.venue,
    operations,
    snapshot: {
      ...composition,
      addOns: financials.addOns,
      amountPaid: money(booking.amount_paid),
      barGratuityAmount: financials.barGratuityPaid,
      barTabAmount: financials.barTabAmount,
      bookingFeeAmount: financials.bookingFeeAmount,
      bookedThrough: resolveCorporateBookingCreator({
        auditEvents: creationAuditResult.data ?? [],
        creatorName: creatorResult.data?.full_name,
        createdByStaffId: booking.created_by_staff_id,
      }),
      bookingReference: booking.booking_reference,
      companyName: text(companyResult.data?.trading_name) || text(companyResult.data?.legal_name) || text(booking.company_name) || text(request?.company_name) || "Company not linked",
      chargedGratuityAmount: money(booking.service_fee),
      discountAmount: money(booking.discount_amount),
      dietaryRequirements: Array.from(new Set(dietaryRequirements)),
      eventName: text(request?.occasion) || text(request?.other_description) || "Corporate function",
      guestCount: Number(booking.guest_count) || 0,
      organiserName: customerName || text(request?.contact_name) || "Not recorded",
      organiserEmail: text(customerResult.data?.email),
      organiserPhone: text(customerResult.data?.mobile),
      outstandingAmount: money(booking.balance_outstanding),
      paymentStatus: titleCaseStatus(text(booking.payment_status)),
      seating,
      showDate: showResult.data.date,
      showTime: text(showResult.data.time).slice(0, 5),
      tableSummary: (tableResult.data ?? []).map((row) => row.table_code).filter(Boolean).join(" + ") || "Floor assignment required",
      ticketGratuityAmount: financials.ticketGratuityPaid,
      ticketValue: financials.ticketValue,
      totalAmount: money(booking.total_amount),
      venue: showResult.data.venue,
    },
  };
}

export function buildCorporateOperationsPdf(
  document: CorporateOperationsDocument,
  context: CorporateOperationsContext,
) {
  return buildCorporateOperationalPdf(document, context);
}
