export const corporateChecklistItems = [
  { id: "payment-full", label: "Full payment received" },
  { id: "bar-tab-arranged", label: "Bar tab arranged and paid" },
  { id: "bar-limit-specified", label: "Bar spending limit specified" },
  { id: "religious-dietary", label: "Strict Halaal / Kosher requirements confirmed" },
  { id: "general-dietary", label: "General dietary requirements confirmed" },
  { id: "accessibility", label: "Accessibility requirements confirmed" },
  { id: "follow-up", label: "Outstanding follow-up completed" },
  { id: "departments-informed", label: "Relevant departments informed" },
  { id: "function-sheet-accurate", label: "Final function sheet is accurate" },
] as const;

export type CorporateChecklistItemId = (typeof corporateChecklistItems)[number]["id"];
export type CorporateChecklistStatus = "complete" | "needs-attention" | "not-applicable";
export type CorporateBarServicePlan = "limited" | "no-bar-tab" | "open" | "not-confirmed";

export type CorporateChecklistEntry = {
  note: string;
  status: CorporateChecklistStatus;
};

export type CorporateBookingOperations = {
  accessibilityNotes: string;
  alcoholRestrictions: string;
  barLimitInstructions: string;
  barRequests: string;
  barServicePlan: CorporateBarServicePlan;
  checklist: Record<CorporateChecklistItemId, CorporateChecklistEntry>;
  dietaryNotes: string;
  employeeName: string;
  eventRequirements: string;
  functionNotes: string;
  gratuityAllocation: string;
  managerName: string;
  operationalBarLimit: number | null;
  revision: number;
  runningOrder: string;
  settlementContact: string;
  specialRequests: string;
  updatedAt: string | null;
  updatedByName: string | null;
  wristbandDetails: string;
};

export type CorporateOperationsDocument = "bar-brief" | "checklist" | "function-brief";

export type CorporateOperationsBookingSnapshot = {
  amountPaid: number;
  barGratuityAmount: number;
  barTabAmount: number;
  bookedThrough: string;
  bookingReference: string;
  companyName: string;
  dietaryRequirements: string[];
  eventName: string;
  guestCount: number;
  organiserName: string;
  outstandingAmount: number;
  paymentStatus: string;
  seating: string;
  showDate: string;
  showTime: string;
  tableSummary: string;
  ticketGratuityAmount: number;
  ticketValue: number;
  totalAmount: number;
  venue: string;
};

const checklistStatuses = new Set<CorporateChecklistStatus>([
  "complete",
  "needs-attention",
  "not-applicable",
]);
const barServicePlans = new Set<CorporateBarServicePlan>([
  "limited",
  "no-bar-tab",
  "open",
  "not-confirmed",
]);

function cleanText(value: unknown, maxLength = 4_000) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

export function createEmptyCorporateBookingOperations(): CorporateBookingOperations {
  return {
    accessibilityNotes: "",
    alcoholRestrictions: "",
    barLimitInstructions: "",
    barRequests: "",
    barServicePlan: "not-confirmed",
    checklist: Object.fromEntries(
      corporateChecklistItems.map((item) => [
        item.id,
        { note: "", status: "needs-attention" },
      ]),
    ) as Record<CorporateChecklistItemId, CorporateChecklistEntry>,
    dietaryNotes: "",
    employeeName: "",
    eventRequirements: "",
    functionNotes: "",
    gratuityAllocation: "",
    managerName: "",
    operationalBarLimit: null,
    revision: 0,
    runningOrder: "",
    settlementContact: "",
    specialRequests: "",
    updatedAt: null,
    updatedByName: null,
    wristbandDetails: "",
  };
}

export function normalizeCorporateBookingOperations(value: unknown): CorporateBookingOperations {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const empty = createEmptyCorporateBookingOperations();
  const rawChecklist = source.checklist && typeof source.checklist === "object"
    ? source.checklist as Record<string, unknown>
    : {};
  const checklist = Object.fromEntries(corporateChecklistItems.map((item) => {
    const entry = rawChecklist[item.id] && typeof rawChecklist[item.id] === "object"
      ? rawChecklist[item.id] as Record<string, unknown>
      : {};
    const status = checklistStatuses.has(entry.status as CorporateChecklistStatus)
      ? entry.status as CorporateChecklistStatus
      : "needs-attention";
    return [item.id, { note: cleanText(entry.note, 1_000), status }];
  })) as CorporateBookingOperations["checklist"];
  const limit = source.operationalBarLimit === null || source.operationalBarLimit === ""
    ? null
    : Number(source.operationalBarLimit);

  return {
    accessibilityNotes: cleanText(source.accessibilityNotes),
    alcoholRestrictions: cleanText(source.alcoholRestrictions),
    barLimitInstructions: cleanText(source.barLimitInstructions),
    barRequests: cleanText(source.barRequests),
    barServicePlan: barServicePlans.has(source.barServicePlan as CorporateBarServicePlan)
      ? source.barServicePlan as CorporateBarServicePlan
      : empty.barServicePlan,
    checklist,
    dietaryNotes: cleanText(source.dietaryNotes),
    employeeName: cleanText(source.employeeName, 200),
    eventRequirements: cleanText(source.eventRequirements),
    functionNotes: cleanText(source.functionNotes),
    gratuityAllocation: cleanText(source.gratuityAllocation),
    managerName: cleanText(source.managerName, 200),
    operationalBarLimit: limit !== null && Number.isFinite(limit) && limit >= 0
      ? Math.round(limit * 100) / 100
      : null,
    revision: Math.max(0, Math.floor(Number(source.revision) || 0)),
    runningOrder: cleanText(source.runningOrder),
    settlementContact: cleanText(source.settlementContact, 500),
    specialRequests: cleanText(source.specialRequests),
    updatedAt: cleanText(source.updatedAt, 100) || null,
    updatedByName: cleanText(source.updatedByName, 200) || null,
    wristbandDetails: cleanText(source.wristbandDetails, 500),
  };
}

export function getCorporateOperationsReadiness(operations: CorporateBookingOperations) {
  const functionFields = [
    operations.eventRequirements,
    operations.runningOrder,
    operations.dietaryNotes,
    operations.accessibilityNotes,
    operations.gratuityAllocation,
  ];
  const functionCompleted = functionFields.filter(Boolean).length;
  const barRequirements = [
    Boolean(operations.wristbandDetails),
    operations.barServicePlan !== "not-confirmed",
    Boolean(operations.alcoholRestrictions),
    operations.barServicePlan === "no-bar-tab" || Boolean(operations.settlementContact),
    operations.barServicePlan !== "limited" || (
      operations.operationalBarLimit !== null && operations.operationalBarLimit > 0
    ),
  ];
  const checklistCompleted = corporateChecklistItems.filter(
    (item) => operations.checklist[item.id].status !== "needs-attention",
  ).length;

  return {
    bar: { completed: barRequirements.filter(Boolean).length, ready: barRequirements.every(Boolean), total: barRequirements.length },
    checklist: { completed: checklistCompleted, ready: checklistCompleted === corporateChecklistItems.length, total: corporateChecklistItems.length },
    function: { completed: functionCompleted, ready: functionCompleted === functionFields.length, total: functionFields.length },
  };
}

export function getChecklistStatusLabel(status: CorporateChecklistStatus) {
  if (status === "complete") return "Complete";
  if (status === "not-applicable") return "Not applicable";
  return "Needs attention";
}
