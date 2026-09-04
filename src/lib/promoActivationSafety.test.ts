import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path: string) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

const migrationPath =
  "../../supabase/migrations/20260904140000_phase_39_65b_promo_activation_guard.sql";

test("migration and seed promos are forced disabled without rewriting history", async () => {
  const migration = await source(migrationPath);

  assert.match(migration, /alter column active set default false/);
  assert.match(
    migration,
    /if tg_op = 'INSERT' then[\s\S]*new\.active := false/,
  );
  assert.match(migration, /creation_source set default 'migration_seed'/);
  assert.doesNotMatch(migration, /COUNTESS10|ROYAL500|STAGE15/);
  assert.doesNotMatch(migration, /update public\.promo_codes[\s\S]*where upper\(code\)/);
});

test("direct false-to-true promo activation is blocked", async () => {
  const migration = await source(migrationPath);

  assert.match(
    migration,
    /not old\.active[\s\S]*and new\.active[\s\S]*PROMO_ACTIVATION_REQUIRES_AUTHORISED_ADMIN_ACTION/,
  );
  assert.match(
    migration,
    /current_setting\('zingara\.promo_activation_authorized', true\)/,
  );
});

test("explicit activation requires an active matching Super Admin identity", async () => {
  const migration = await source(migrationPath);

  assert.match(migration, /create or replace function public\.activate_promo_code/);
  assert.match(migration, /sp\.user_id = p_actor_auth_user_id/);
  assert.match(migration, /sp\.active/);
  assert.match(migration, /lower\(trim\(r\.name\)\) = 'super admin'/);
  assert.match(migration, /PROMO_ACTIVATION_FORBIDDEN/);
});

test("activation and its immutable audit event share one database transaction", async () => {
  const migration = await source(migrationPath);

  assert.match(
    migration,
    /set_config\('zingara\.promo_activation_authorized', 'on', true\)[\s\S]*update public\.promo_codes[\s\S]*insert into public\.audit_events/,
  );
  assert.match(migration, /'promo\.enabled'/);
  assert.match(migration, /'authorised_admin_action'/);
  assert.match(migration, /'success'/);
});

test("untrusted callers cannot execute the activation function", async () => {
  const migration = await source(migrationPath);

  assert.match(
    migration,
    /revoke all on function public\.activate_promo_code\([\s\S]*from public, anon, authenticated/,
  );
  assert.match(
    migration,
    /grant execute on function public\.activate_promo_code\([\s\S]*to service_role/,
  );
});

test("Admin creation is disabled and records normal creation audit", async () => {
  const route = await source("../app/api/admin/promo-codes/route.ts");

  assert.match(route, /const payload = \{[\s\S]*active: false/);
  assert.match(route, /creation_source: "admin"/);
  assert.match(route, /action: "promo\.created"/);
  assert.doesNotMatch(route, /active: payload\.active \?\? true/);
});

test("activation uses the dedicated protected action rather than an active payload", async () => {
  const [page, route] = await Promise.all([
    source("../app/admin/page.tsx"),
    source("../app/api/admin/promo-codes/route.ts"),
  ]);

  assert.match(route, /export async function PATCH\(request: Request\)/);
  assert.match(route, /isSuperAdminProfile\(auth\.staffProfile\)/);
  assert.match(route, /\.rpc\("activate_promo_code"/);
  assert.match(page, /action: active \? "activate" : "disable"/);
  assert.match(page, /method: "PATCH"/);
  assert.match(page, /New promo codes are saved disabled/);
  assert.doesNotMatch(page, /checked=\{promoCodeForm\.active\}/);
});

test("existing legitimate active promo validation remains authoritative", async () => {
  const validation = await source("./supabase/promoCodes.ts");

  assert.match(validation, /if \(!promo\.active\)/);
  assert.match(validation, /status: "invalid"/);
  assert.match(validation, /getDiscountAmount/);
});
