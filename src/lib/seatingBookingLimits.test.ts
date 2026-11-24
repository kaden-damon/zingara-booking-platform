import assert from "node:assert/strict";
import test from "node:test";
import { performance } from "node:perf_hooks";
import { readFileSync } from "node:fs";
import { canEditSeatingBookingLimits, getSeatingBookingLimit, validateSeatingBookingLimit, type SeatingBookingLimits } from "./seatingBookingLimits";
import { getTableBookingMaximum, physicalTableDefinitions } from "./physicalTables";
import { isStandardBookingZoneGuestCountAllowed } from "./bookingSeatingAvailability";
import { defaultVenueSettings, findSuitableTableAllocations, type DemoTable } from "./zingaraDemo";

test("both venues default to six-to-eight booths; other booking ranges are unchanged", () => {
  for (const venue of ["cape-town", "johannesburg"]) {
    for (const zone of ["golden-circle", "middle-ring", "royal-booths", "royal-balcony"]) {
      assert.deepEqual(getSeatingBookingLimit(defaultVenueSettings, venue, zone),
        zone === "royal-booths" ? { minGuests: 6, maxGuests: 8 } : { minGuests: 1, maxGuests: 19 });
    }
  }
});

test("venue-specific changes apply only to that venue and zone", () => {
  const settings = { bookingLimits: { "cape-town": { "golden-circle": { minGuests: 3, maxGuests: 12 } } } as SeatingBookingLimits };
  assert.deepEqual(getSeatingBookingLimit(settings, "cape-town", "golden-circle"), { minGuests: 3, maxGuests: 12 });
  assert.deepEqual(getSeatingBookingLimit(settings, "johannesburg", "golden-circle"), { minGuests: 1, maxGuests: 19 });
  for (const count of [2,13]) assert.equal(isStandardBookingZoneGuestCountAllowed("golden-circle",count,getSeatingBookingLimit(settings,"cape-town","golden-circle")),false);
});

test("Standard booking limits are not individual-table limits or public zone capacities", () => {
  for (const [zone, tableMaximum, capacity] of [["golden-circle",10,120],["middle-ring",10,125],["royal-balcony",8,32]] as const) {
    const limits = getSeatingBookingLimit(defaultVenueSettings,"cape-town",zone);
    for (const guests of [1,19]) assert.equal(isStandardBookingZoneGuestCountAllowed(zone,guests,limits),true);
    assert.equal(isStandardBookingZoneGuestCountAllowed(zone,20,limits),false);
    const tables = physicalTableDefinitions.filter((table)=>table.zoneId===zone);
    assert.equal(Math.min(...tables.map((table)=>table.minimumCapacity)),2);
    assert.equal(Math.max(...tables.map((table)=>table.maximumCapacity)),tableMaximum);
    assert.equal(tables.reduce((sum,table)=>sum+(table.defaultCapacity??0),0),capacity);
  }
});

test("only the two active recorded staff identities can edit", () => {
  for (const id of ["e8598359-54a0-4e1f-a635-1ec8ae02cb78", "3ac09b59-fc3f-4c6d-9bb3-8dd47a077188"]) {
    assert.equal(canEditSeatingBookingLimits({ id, active: true }),true);
    assert.equal(canEditSeatingBookingLimits({ id, active: false }),false);
  }
  assert.equal(canEditSeatingBookingLimits({ id: "other-super-admin", active: true }),false);
  assert.equal(canEditSeatingBookingLimits(null),false);
});

test("invalid limits fail without weakening the booth maximum", () => {
  for (const value of [{ minGuests: 0, maxGuests: 8 },{ minGuests: 8, maxGuests: 6 },{ minGuests: 6, maxGuests: 9 },{ minGuests: 6.5, maxGuests: 8 }]) {
    assert.equal(validateSeatingBookingLimit("royal-booths",value),false);
  }
  assert.equal(validateSeatingBookingLimit("royal-booths",{ minGuests: 6,maxGuests: 8 }),true);
});

test("23 original booths fit eight without changing the 415-seat baseline", () => {
  const booths=physicalTableDefinitions.filter((row)=>row.zoneId==="royal-booths");
  assert.equal(booths.length,23);
  assert.equal(booths.some((row)=>row.code==="13"),false);
  assert.equal(physicalTableDefinitions.reduce((sum,row)=>sum+(row.defaultCapacity??0),0),415);
  for (const row of booths) assert.equal(getTableBookingMaximum({ zoneId:row.zoneId,tableNumber:row.code,physicalTable:true,seatCapacity:6 }),8);
});

test("new booth bookings enforce six-to-eight and never split across tables", () => {
  const table: DemoTable={ id:"booth",authoritativeId:"booth",tableNumber:"1",zoneId:"royal-booths",showId:"show",seatCapacity:6,physicalTable:true,capacityConfigured:true,status:"available",guestNotes:"" };
  for (const pax of [6,7,8]) {
    assert.equal(isStandardBookingZoneGuestCountAllowed("royal-booths",pax),true);
    const allocation=findSuitableTableAllocations([table],"show","royal-booths",pax);
    assert.equal(allocation.length,1); assert.equal(allocation[0].isCombination,false);
    assert.equal(allocation[0].wastedSeats,8-pax);
  }
  for (const pax of [4,5,9,12]) assert.equal(isStandardBookingZoneGuestCountAllowed("royal-booths",pax),false);
  assert.equal(findSuitableTableAllocations([table,{ ...table,id:"second",tableNumber:"2" }],"show","royal-booths",12).length,0);
});

test("custom, temporary, merged and unconfigured capacities are preserved", () => {
  const booth={ zoneId:"royal-booths" as const, tableNumber:"1",physicalTable:true,seatCapacity:6 };
  for (const change of [{ isOverride:true },{ capacityConfigured:false },{ physicalTable:false },{ mergedFrom:["x"] },{ mergedInto:"parent" },{ tableNumber:"13" }]) assert.equal(getTableBookingMaximum({ ...booth,...change }),6);
  assert.equal(getTableBookingMaximum({ ...booth,seatCapacity:4 }),4);
});

test("fit helper performs no I/O and preserves all raw capacity inputs", () => {
  const booth={ zoneId:"royal-booths" as const,tableNumber:"1",physicalTable:true,seatCapacity:6 };
  const start=performance.now();
  for (let n=0;n<10000;n++) getTableBookingMaximum(booth);
  assert.equal(booth.seatCapacity,6);
  assert.ok(performance.now()-start<250);
});

test("migration changes configuration and fit functions, not bookings or table rows", () => {
  const sql=readFileSync(new URL("../../supabase/migrations/20261124153000_venue_booking_limits.sql",import.meta.url),"utf8");
  assert.doesNotMatch(sql,/\b(?:update|delete from|insert into)\s+public\.(?:bookings|show_tables|venue_tables|physical_seating_layout_tables)\b/i);
  assert.match(sql,/BOOKING_LIMIT_PERMISSION_REQUIRED/);
  assert.match(sql,/BOOKING_LIMIT_FUNCTION_DRIFT/);
  assert.match(sql,/preserve_seating_booking_limits/);
  assert.match(sql,/assign_unallocated_booking_table_atomic/);
  for (const path of ["../app/api/admin/bookings/route.ts", "../app/api/admin/corporate-requests/convert/route.ts"]) {
    assert.match(readFileSync(new URL(path,import.meta.url),"utf8"),/getTableBookingMaximum/);
  }
});
