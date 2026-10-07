import type {
  BookingCreatedDateFilter,
  BookingSalesSourceFilter,
} from "@/lib/bookingSalesFilters";
import type { BookingPromoFilter } from "@/lib/bookingPromoUsage";
import type { CompactBookingSortDirection, CompactBookingSortKey } from "@/lib/compactBookingView";

export type AdminBookingListKind = "corporate" | "standard";

export type AdminBookingListFilters = {
  archive: "active" | "all" | "archived";
  bookingCreatedDateFilter: BookingCreatedDateFilter;
  bookingCreatedFrom: string;
  bookingCreatedSpecificDate: string;
  bookingCreatedTo: string;
  bookingDate: string;
  bookingStatus: string;
  createdBy: string;
  hideCancelled: boolean;
  kind: AdminBookingListKind;
  location: string;
  page: number;
  pageSize: number;
  paymentStatus: string;
  performanceFrom: string;
  performanceTo: string;
  promo: BookingPromoFilter;
  search: string;
  seatingZone: string;
  show: string;
  sortDirection: CompactBookingSortDirection;
  sortKey: CompactBookingSortKey;
  source: BookingSalesSourceFilter;
};

export function adminBookingListSearchParams(filters: AdminBookingListFilters) {
  const params = new URLSearchParams({
    archive: filters.archive,
    bookingCreatedDateFilter: filters.bookingCreatedDateFilter,
    bookingCreatedFrom: filters.bookingCreatedFrom,
    bookingCreatedSpecificDate: filters.bookingCreatedSpecificDate,
    bookingCreatedTo: filters.bookingCreatedTo,
    bookingDate: filters.bookingDate,
    bookingStatus: filters.bookingStatus,
    createdBy: filters.createdBy,
    hideCancelled: filters.hideCancelled ? "1" : "0",
    kind: filters.kind,
    listPage: String(filters.page),
    location: filters.location,
    pageSize: String(filters.pageSize),
    paymentStatus: filters.paymentStatus,
    performanceFrom: filters.performanceFrom,
    performanceTo: filters.performanceTo,
    promo: filters.promo,
    search: filters.search,
    seatingZone: filters.seatingZone,
    show: filters.show,
    sortDirection: filters.sortDirection,
    sortKey: filters.sortKey,
    source: filters.source,
  });

  return params;
}
