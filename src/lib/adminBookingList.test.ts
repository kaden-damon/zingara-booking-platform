import assert from "node:assert/strict";
import test from "node:test";

import {
  adminBookingListSearchParams,
  type AdminBookingListFilters,
} from "./adminBookingList.ts";

test("attendance uses the existing booking-list request", () => {
  const filters: AdminBookingListFilters = {
    archive: "active",
    attendance: "declined",
    bookingCreatedDateFilter: "all",
    bookingCreatedFrom: "",
    bookingCreatedSpecificDate: "",
    bookingCreatedTo: "",
    bookingDate: "all",
    bookingStatus: "all",
    createdBy: "all",
    hideCancelled: true,
    kind: "standard",
    location: "all",
    page: 1,
    pageSize: 10,
    paymentStatus: "all",
    performanceFrom: "",
    performanceTo: "",
    promo: "all",
    search: "",
    seatingZone: "all",
    show: "all",
    sortDirection: "desc",
    sortKey: "createdAt",
    source: "all",
  };

  const params = adminBookingListSearchParams(filters);
  assert.equal(params.get("attendance"), "declined");
  assert.equal(params.get("listPage"), "1");
  assert.equal(params.get("pageSize"), "10");
});
