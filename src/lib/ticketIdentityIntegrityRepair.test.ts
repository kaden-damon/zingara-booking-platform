import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const source = (path: string) => readFile(new URL(path, import.meta.url), "utf8");

test("an audited guest reduction can safely restore the same dormant QR identity", async () => {
  const migration = await source(
    "../../supabase/migrations/20261022123000_p0_ticket_identity_integrity_repair.sql",
  );

  assert.match(migration, /booking\.guest-ticket-population-reconciled/);
  assert.match(migration, /invalidated_ticket_codes/);
  assert.match(migration, /ticket\.ticket_status::text = 'void'/);
  assert.match(migration, /validation\.result::text = 'accepted'/);
  assert.match(migration, /set ticket_status = 'valid'/);
  assert.match(migration, /reactivated_ticket_codes/);
  assert.doesNotMatch(migration, /delete\s+from\s+public\.tickets/i);
});

test("cancelled, refunded, expired, and ambiguous identities remain fail closed", async () => {
  const migration = await source(
    "../../supabase/migrations/20261022123000_p0_ticket_identity_integrity_repair.sql",
  );

  assert.match(
    migration,
    /ticket\.ticket_status::text in \('cancelled', 'expired', 'refunded', 'void'\)/,
  );
  assert.match(migration, /TICKET_POPULATION_TERMINAL_IDENTITY_REVIEW_REQUIRED/);
  assert.match(migration, /TICKET_REGENERATION_IDENTITY_AMBIGUOUS/);
  assert.match(migration, /TICKET_REGENERATION_STATE_CHANGED/);
});

test("ticket regeneration is atomic and records an immutable successor relationship", async () => {
  const migration = await source(
    "../../supabase/migrations/20261022123000_p0_ticket_identity_integrity_repair.sql",
  );
  const route = await source("../app/api/tickets/[reference]/route.ts");

  assert.match(migration, /replaced_by_ticket_id uuid/);
  assert.match(migration, /create unique index[\s\S]*tickets_replaced_by_ticket_id_key/);
  assert.match(migration, /regenerate_guest_ticket_atomic/);
  assert.match(migration, /for update/);
  assert.match(migration, /booking\.guest-ticket-regenerated/);
  assert.match(route, /\.rpc\(\s*"regenerate_guest_ticket_atomic"/);
  assert.doesNotMatch(
    route,
    /\.from\("tickets"\)\s*\.update\(\{ ticket_status: "void" \}\)/,
  );
});

test("ticket repair does not mutate payment, capacity, show, or table state", async () => {
  const migration = await source(
    "../../supabase/migrations/20261022123000_p0_ticket_identity_integrity_repair.sql",
  );

  assert.doesNotMatch(migration, /update\s+public\.payments/i);
  assert.doesNotMatch(migration, /update\s+public\.shows/i);
  assert.doesNotMatch(migration, /update\s+public\.show_tables/i);
  assert.doesNotMatch(
    migration,
    /set[\s\S]{0,160}(guest_count|total_amount|amount_paid|balance_outstanding)\s*=/i,
  );
});
