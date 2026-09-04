import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  findBestTableAllocation,
  isValidMergedOperationalTable,
  type DemoTable,
  type SeatingZoneId,
} from "./zingaraDemo.ts";

const showId = "show-cpt-2026-11-27";
const zoneId: SeatingZoneId = "middle-ring";

function table(id: string, input: Partial<DemoTable> = {}): DemoTable {
  return {
    authoritativeId: `authoritative-${id}`,
    availabilityScope: "public",
    capacityConfigured: true,
    guestNotes: "",
    id,
    mergeable: true,
    physicalTable: true,
    seatCapacity: 8,
    showId,
    status: "available",
    tableNumber: id,
    zoneId,
    ...input,
  };
}

function mergedInventory() {
  const parentId = "200+201+202+203+204+205+206+207+208+209";
  const children = Array.from({ length: 10 }, (_, index) =>
    table(String(200 + index), {
      mergedInto: parentId,
      status: "disabled",
    }),
  );
  const parent = table(parentId, {
    availabilityScope: "operational",
    mergedFrom: children.map((child) => child.id),
    physicalTable: false,
    seatCapacity: 80,
  });

  return { children, parent, tables: [...children, parent] };
}

test("IFF-sized parties can use one valid operational merged parent", () => {
  const { parent, tables } = mergedInventory();
  const allocation = findBestTableAllocation(tables, showId, zoneId, 73);

  assert.equal(isValidMergedOperationalTable(parent, tables), true);
  assert.equal(allocation?.table.id, parent.id);
  assert.equal(allocation?.isCombination, false);
  assert.equal(allocation?.wastedSeats, 7);
});

test("disabled linked children remain contained by the merged parent", () => {
  const { children, parent, tables } = mergedInventory();

  assert.equal(isValidMergedOperationalTable(parent, tables), true);
  assert.equal(
    children.every(
      (child) =>
        child.status === "disabled" &&
        child.mergedInto === parent.id &&
        !child.bookingReference,
    ),
    true,
  );
});

test("stale or malformed merged parents are never suggested", () => {
  const cases = [
    (tables: DemoTable[]) => tables.slice(1),
    (tables: DemoTable[]) =>
      tables.map((candidate, index) =>
        index === 0 ? { ...candidate, status: "available" as const } : candidate,
      ),
    (tables: DemoTable[]) =>
      tables.map((candidate, index) =>
        index === 0 ? { ...candidate, bookingReference: "OTHER" } : candidate,
      ),
    (tables: DemoTable[]) =>
      tables.map((candidate, index) =>
        index === 0 ? { ...candidate, zoneId: "golden-circle" as const } : candidate,
      ),
    (tables: DemoTable[]) =>
      tables.map((candidate) =>
        candidate.mergedFrom?.length
          ? { ...candidate, seatCapacity: candidate.seatCapacity + 1 }
          : candidate,
      ),
  ];

  for (const mutate of cases) {
    const { parent, tables } = mergedInventory();
    const inventory = mutate(tables);
    const currentParent =
      inventory.find((candidate) => candidate.id === parent.id) ?? parent;

    assert.equal(isValidMergedOperationalTable(currentParent, inventory), false);
    assert.equal(findBestTableAllocation(inventory, showId, zoneId, 73), undefined);
  }
});

test("ordinary physical and temporary operational tables remain eligible", () => {
  const physical = table("MR-8", { seatCapacity: 8 });
  const temporary = table("MR-TEMP", {
    availabilityScope: "operational",
    physicalTable: false,
    seatCapacity: 12,
  });

  assert.equal(
    findBestTableAllocation([physical], showId, zoneId, 8)?.table.id,
    physical.id,
  );
  assert.equal(
    findBestTableAllocation([temporary], showId, zoneId, 10)?.table.id,
    temporary.id,
  );
});

test("atomic assignment accepts only the established operational booking cohort", async () => {
  const migration = await readFile(
    new URL(
      "../../supabase/migrations/20260904180000_phase_39_69_merged_floor_assignment.sql",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(
    migration,
    /booking_status::text not in \(\s*'new',\s*'pending_payment',\s*'confirmed',\s*'checked_in'\s*\)/s,
  );
  assert.match(migration, /v_booking\.archived_at is not null/);
  assert.match(migration, /raise exception 'BOOKING_NOT_ASSIGNABLE'/);
});

test("atomic assignment preserves show, zone, capacity, ownership, and merge guards", async () => {
  const migration = await readFile(
    new URL(
      "../../supabase/migrations/20260904180000_phase_39_69_merged_floor_assignment.sql",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(migration, /v_target\.show_id <> v_booking\.show_id/);
  assert.match(migration, /normalize_booking_capacity_zone\(v_target\.section\)/);
  assert.match(migration, /v_target\.capacity < v_booking\.guest_count/);
  assert.match(migration, /v_target\.booking_id is not null/);
  assert.match(migration, /v_target\.merged_parent_id is not null/);
  assert.match(migration, /member\.merged_parent_id = v_target\.id/);
  assert.match(migration, /v_member_capacity <> v_target\.capacity/);
  assert.match(migration, /raise exception 'MERGED_TABLE_NOT_AVAILABLE'/);
});

test("atomic assignment claims only the parent and remains service-role only", async () => {
  const migration = await readFile(
    new URL(
      "../../supabase/migrations/20260904180000_phase_39_69_merged_floor_assignment.sql",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(
    migration,
    /update public\.show_tables\s+set booking_id = v_booking\.id[\s\S]*where id = v_target\.id/,
  );
  assert.doesNotMatch(migration, /update public\.show_tables member/);
  assert.match(migration, /revoke all .* from anon/);
  assert.match(migration, /revoke all .* from authenticated/);
  assert.match(migration, /grant execute .* to service_role/);
});

test("assigned merged parents remain protected from splitting", async () => {
  const splitMigration = await readFile(
    new URL(
      "../../supabase/migrations/20260826170000_phase_37_5_physical_table_reallocation_multi_merge.sql",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(splitMigration, /MERGED_TABLE_HAS_BOOKING/);
});
