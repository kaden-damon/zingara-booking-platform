import type { SupabaseClient } from "@supabase/supabase-js";
import {
  corporateChecklistItems,
  createEmptyCorporateBookingOperations,
  getChecklistStatusLabel,
  normalizeCorporateBookingOperations,
  type CorporateBookingOperations,
  type CorporateOperationsBookingSnapshot,
  type CorporateOperationsDocument,
} from "@/lib/corporateBookingOperations";
import { createZingaraTextPdf, type ZingaraPdfSection } from "@/lib/exports/zingaraTextPdf";

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

function moneyLabel(value: number) {
  return `R${new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  }).format(value)}`;
}

function dateLabel(value: string) {
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("en-ZA", { dateStyle: "long", timeZone: "Africa/Johannesburg" }).format(date);
}

function titleCaseStatus(value: string) {
  return value.replaceAll("_", " ").replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export async function loadCorporateOperationsContext(
  serviceClient: ServiceClient,
  bookingReference: string,
): Promise<CorporateOperationsContext | null> {
  const { data: booking, error: bookingError } = await serviceClient
    .from("bookings")
    .select("id,booking_reference,booking_source,booking_origin,corporate_request_id,customer_id,show_id,company_name,guest_count,section,zone_entitlements,total_amount,amount_paid,balance_outstanding,payment_status,dietary_requirements,created_by_staff_id")
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

  const [showResult, customerResult, requestByIdResult, requestByReferenceResult, operationsResult, evidenceResult, tableResult, creatorResult] = await Promise.all([
    serviceClient.from("shows").select("id,date,time,venue,notes").eq("id", booking.show_id).maybeSingle(),
    serviceClient.from("customers").select("id,first_name,surname,dietary_requirements").eq("id", booking.customer_id).maybeSingle(),
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
  ]);
  const firstError = [showResult, customerResult, requestByIdResult, requestByReferenceResult, operationsResult, evidenceResult, tableResult, creatorResult]
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
  const dietaryRequirements = [
    ...(Array.isArray(request?.dietary_requirements) ? request.dietary_requirements : []),
    text(request?.other_dietary_requirement),
    text(customerResult.data?.dietary_requirements),
    bookingDietary,
  ].filter((item): item is string => Boolean(item));
  const zoneEntitlements = Array.isArray(booking.zone_entitlements)
    ? booking.zone_entitlements as Array<{ pax?: number; zoneId?: string }>
    : [];
  const seating = zoneEntitlements.length > 0
    ? zoneEntitlements.map((entry) => `${titleCaseStatus(text(entry.zoneId))} ${Number(entry.pax) || 0}`).join(" / ")
    : titleCaseStatus(text(booking.section) || "Not assigned");

  return {
    bookingId: booking.id,
    location: showResult.data.venue,
    operations,
    snapshot: {
      amountPaid: money(booking.amount_paid),
      barGratuityAmount: money(evidence?.bar_gratuity_amount),
      barTabAmount: money(evidence?.bar_tab_paid_amount),
      bookedThrough: creatorResult.data?.full_name ?? "Not recorded",
      bookingReference: booking.booking_reference,
      companyName: text(booking.company_name) || text(request?.company_name) || customerName || "Corporate booking",
      dietaryRequirements: Array.from(new Set(dietaryRequirements)),
      eventName: text(request?.occasion) || text(request?.other_description) || "Corporate function",
      guestCount: Number(booking.guest_count) || 0,
      organiserName: text(request?.contact_name) || customerName || "Not recorded",
      outstandingAmount: money(booking.balance_outstanding),
      paymentStatus: titleCaseStatus(text(booking.payment_status)),
      seating,
      showDate: showResult.data.date,
      showTime: text(showResult.data.time).slice(0, 5),
      tableSummary: (tableResult.data ?? []).map((row) => row.table_code).filter(Boolean).join(" + ") || "Floor assignment required",
      ticketGratuityAmount: money(evidence?.ticket_gratuity_amount),
      ticketValue: evidence?.source_ticket_amount == null ? money(booking.total_amount) : money(evidence.source_ticket_amount),
      totalAmount: money(booking.total_amount),
      venue: showResult.data.venue,
    },
  };
}

function sharedBookingSections(snapshot: CorporateOperationsBookingSnapshot): ZingaraPdfSection[] {
  return [
    {
      title: "Booking",
      rows: [
        { label: "Company", value: snapshot.companyName },
        { label: "Organiser", value: snapshot.organiserName },
        { label: "Reference", value: snapshot.bookingReference },
        { label: "Booked through", value: snapshot.bookedThrough },
        { label: "Performance", value: `${snapshot.venue} - ${dateLabel(snapshot.showDate)} - ${snapshot.showTime}` },
        { label: "Guests", value: String(snapshot.guestCount) },
        { label: "Seating", value: snapshot.seating },
        { label: "Tables", value: snapshot.tableSummary },
      ],
    },
    {
      title: "Live financial position",
      rows: [
        { label: "Total booking amount", value: moneyLabel(snapshot.totalAmount) },
        { label: "Total amount paid", value: moneyLabel(snapshot.amountPaid) },
        { label: "Outstanding balance", value: moneyLabel(snapshot.outstandingAmount) },
        { label: "Payment status", value: snapshot.paymentStatus },
        { label: "Ticket value", value: moneyLabel(snapshot.ticketValue) },
        { label: "Ticket gratuity", value: moneyLabel(snapshot.ticketGratuityAmount) },
        { label: "Bar tab paid", value: moneyLabel(snapshot.barTabAmount) },
        { label: "Bar gratuity", value: moneyLabel(snapshot.barGratuityAmount) },
      ],
    },
  ];
}

export function buildCorporateOperationsPdf(
  document: CorporateOperationsDocument,
  context: CorporateOperationsContext,
) {
  const { operations, snapshot } = context;
  let title = "Corporate Function Brief";
  let sections = sharedBookingSections(snapshot);

  if (document === "function-brief") {
    sections = [
      ...sections,
      { title: "Event details", rows: [
        { label: "Event", value: snapshot.eventName },
        { label: "Requirements", value: operations.eventRequirements },
        { label: "Running order", value: operations.runningOrder },
        { label: "Special requests", value: operations.specialRequests || "None recorded" },
      ] },
      { title: "Guest requirements", rows: [
        { label: "Booking dietary information", value: snapshot.dietaryRequirements.join(", ") || "None recorded" },
        { label: "Operational dietary notes", value: operations.dietaryNotes },
        { label: "Accessibility", value: operations.accessibilityNotes },
      ] },
      { title: "Gratuity and staffing", rows: [
        { label: "Allocation", value: operations.gratuityAllocation },
        { label: "Operational notes", value: operations.functionNotes || "None recorded" },
      ] },
    ];
  } else if (document === "bar-brief") {
    title = "Corporate Bar Brief";
    sections = [
      ...sections,
      { title: "Bar operations", rows: [
        { label: "Wristbands", value: operations.wristbandDetails },
        { label: "Service plan", value: titleCaseStatus(operations.barServicePlan) },
        { label: "Operational limit", value: operations.operationalBarLimit === null ? "Not confirmed" : moneyLabel(operations.operationalBarLimit) },
        { label: "Limit instructions", value: operations.barLimitInstructions || "None recorded" },
        { label: "Alcohol restrictions", value: operations.alcoholRestrictions },
        { label: "Settlement contact", value: operations.settlementContact || "Not applicable" },
        { label: "Requests", value: operations.barRequests || "None recorded" },
      ] },
    ];
  } else {
    title = "Corporate Function Checklist";
    sections = [
      ...sections,
      { title: "Operational review", rows: corporateChecklistItems.map((item) => ({
        label: item.label,
        value: `${getChecklistStatusLabel(operations.checklist[item.id].status)}${operations.checklist[item.id].note ? ` - ${operations.checklist[item.id].note}` : ""}`,
      })) },
      { title: "Sign-off context", rows: [
        { label: "Employee", value: operations.employeeName || "Not recorded" },
        { label: "Manager", value: operations.managerName || "Not recorded" },
      ] },
    ];
  }

  return createZingaraTextPdf({
    sections,
    subtitle: `${snapshot.companyName} - ${snapshot.bookingReference} - ${dateLabel(snapshot.showDate)}`,
    title,
  });
}
