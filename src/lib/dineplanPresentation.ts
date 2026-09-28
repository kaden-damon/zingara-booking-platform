import type { DineplanActionRecord } from "./dineplanActions.ts";

export function formatDineplanStaffState(value: string) {
  return value
    .replace(/No authoritative match/gi, "No booking found")
    .replace(/\bpax\b/gi, "guests")
    .replace(/authoritative Zingara entitlement/gi, "guests booked in Zingara");
}

export function getDineplanStaffActionCopy(
  action: Pick<DineplanActionRecord, "actionKind" | "zingaraState">,
) {
  if (action.actionKind === "verify_cancel") {
    return "Check whether this booking was cancelled or moved.";
  }
  if (action.actionKind === "verify_pax") {
    return "Check the guest count and update the incorrect booking.";
  }
  if (action.actionKind === "verify_performance") {
    return "Check the performance and move the booking only if the current show is incorrect.";
  }
  if (action.actionKind === "review_zone") {
    return "Check the seating section and update the incorrect booking.";
  }
  if (action.actionKind === "verify_payment") {
    return "Check the payment details before making any changes.";
  }
  if (/No authoritative match|No booking found/i.test(action.zingaraState)) {
    return "Check the Dineplan booking. If it's correct, create it in Zingara.";
  }
  return "Check the booking details and correct the booking only if needed.";
}
