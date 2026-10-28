import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../../supabase/migrations/20261028120000_phase_54_1_authoritative_seating_configuration.sql",
  import.meta.url,
);

async function migrationSource() {
  return readFile(migrationUrl, "utf8");
}

function expectedMaster() {
  const expected = new Map<string, { zone: string; maximumGuests: number }>();

  for (const code of [...Array.from({ length: 12 }, (_, index) => index + 1), ...Array.from({ length: 11 }, (_, index) => index + 14)]) {
    expected.set(String(code), { zone: "royal-booths", maximumGuests: 6 });
  }

  const middleRing: Record<string, number> = {
    "200": 4, "201": 2, "202": 8, "203": 8, "204": 6, "205": 6,
    "206": 5, "207": 4, "208": 4, "209": 4, "210": 4, "211": 6,
    "300": 7, "301": 4, "302": 2, "303": 3, "304": 4, "305": 4,
    "306": 6, "307": 6, "308": 6, "309": 6, "310": 6, "400": 10,
  };
  for (const [code, maximumGuests] of Object.entries(middleRing)) {
    expected.set(code, { zone: "middle-ring", maximumGuests });
  }

  const goldenCircle: Record<string, number> = {
    "401": 6, "402": 6, "403": 4, "404": 8, "405": 8, "406": 10,
    "500": 10, "501": 6, "502": 8, "503": 6, "504": 6, "505": 8, "506": 10,
    "600": 2, "601": 2, "602": 4, "603": 2, "604": 2, "605": 2,
    "606": 4, "607": 2, "608": 2, "609": 2,
  };
  for (const [code, maximumGuests] of Object.entries(goldenCircle)) {
    expected.set(code, { zone: "golden-circle", maximumGuests });
  }

  for (const code of ["900", "901", "800", "801"]) {
    expected.set(code, { zone: "royal-balcony", maximumGuests: 8 });
  }

  return expected;
}

function parseMaster(migration: string) {
  const start = migration.indexOf("with master_tables(");
  const end = migration.indexOf(")\ninsert into public.physical_seating_layout_tables", start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);

  const rows = new Map<string, { zone: string; maximumGuests: number }>();
  const rowPattern = /\('(\d+)'(?:::text)?,\s*'([^']+)'(?:::text)?,\s*(\d+),\s*(\d+)\)/g;
  for (const match of migration.slice(start, end).matchAll(rowPattern)) {
    rows.set(match[1], { zone: match[2], maximumGuests: Number(match[3]) });
  }
  return rows;
}

test("the Phase 54.1 master contains the exact approved 74 tables", async () => {
  const migration = await migrationSource();
  const actual = parseMaster(migration);
  const expected = expectedMaster();

  assert.equal(actual.size, 74);
  assert.deepEqual([...actual.entries()].sort(), [...expected.entries()].sort());
  assert.deepEqual(actual.get("400"), { zone: "middle-ring", maximumGuests: 10 });
  assert.equal(actual.has("13"), false);
});

test("approved table maxima reconcile to all four physical zone totals", async () => {
  const actual = parseMaster(await migrationSource());
  const totals = new Map<string, { tables: number; capacity: number }>();

  for (const table of actual.values()) {
    const total = totals.get(table.zone) ?? { tables: 0, capacity: 0 };
    total.tables += 1;
    total.capacity += table.maximumGuests;
    totals.set(table.zone, total);
  }

  assert.deepEqual(Object.fromEntries(totals), {
    "royal-booths": { tables: 23, capacity: 138 },
    "middle-ring": { tables: 24, capacity: 125 },
    "golden-circle": { tables: 23, capacity: 120 },
    "royal-balcony": { tables: 4, capacity: 32 },
  });
  assert.equal([...totals.values()].reduce((sum, zone) => sum + zone.capacity, 0), 415);
});

test("each venue receives an independent approved version with assignment disabled", async () => {
  const migration = await migrationSource();

  assert.match(migration, /'54010000-0000-4000-8000-000000000001',[\s\S]*?'cape-town'/);
  assert.match(migration, /'54010000-0000-4000-8000-000000000002',[\s\S]*?'johannesburg'/);
  assert.match(migration, /\('cape-town', '54010000-0000-4000-8000-000000000001', false\)/);
  assert.match(migration, /\('johannesburg', '54010000-0000-4000-8000-000000000002', false\)/);
  assert.doesNotMatch(migration, /insert into public\.show_physical_seating_layouts/i);
});

test("approved layouts are immutable, private and service-only", async () => {
  const migration = await migrationSource();

  assert.match(migration, /APPROVED_PHYSICAL_LAYOUT_VERSION_IMMUTABLE/);
  assert.match(migration, /APPROVED_PHYSICAL_LAYOUT_CONTENT_IMMUTABLE/);
  assert.match(migration, /enable row level security/g);
  assert.match(migration, /revoke all on table public\.physical_seating_layout_tables from public, anon, authenticated/);
  assert.match(migration, /grant all on table public\.physical_seating_layout_tables to service_role/);
  assert.match(migration, /get_authoritative_show_table_availability/);
  assert.match(migration, /adoption\.adoption_status = 'adopted'/);
});

test("the migration is additive and leaves operational seating and sales capacity untouched", async () => {
  const migration = await migrationSource();
  const operationalMutation = /\b(?:alter table|update|delete from|insert into)\s+public\.(?:venue_tables|show_tables|shows|bookings|show_zone_sales_controls)\b/i;

  assert.doesNotMatch(migration, operationalMutation);
  assert.match(migration, /physical_seating_reconciliation_queue/);
  assert.match(migration, /active-bookings-exceed-approved-physical-zone-capacity/);
  assert.match(migration, /automatic_assignment_enabled[\s\S]*?default false/);
});
