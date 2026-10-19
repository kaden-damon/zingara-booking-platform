import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  canManageStaffTraining,
  getTrainingStatus,
  normalizeCompetencies,
  trainingPageSize,
} from "./staffTraining.ts";

test("training status requires confirmation and independent demonstration", () => {
  assert.equal(getTrainingStatus({ choice: null, demonstratedIndependently: true }), "awaiting_confirmation");
  assert.equal(getTrainingStatus({ choice: "understood", demonstratedIndependently: false }), "confirmed_understanding");
  assert.equal(getTrainingStatus({ choice: "understood", demonstratedIndependently: true }), "proficiency_verified");
  assert.equal(getTrainingStatus({ choice: "further_training", demonstratedIndependently: true }), "further_training_required");
});

test("training management stays limited and pages stay bounded", () => {
  assert.equal(trainingPageSize, 10);
  assert.equal(canManageStaffTraining("super-admin"), true);
  assert.equal(canManageStaffTraining("venue-manager"), true);
  assert.equal(canManageStaffTraining("box-office-manager"), true);
  assert.equal(canManageStaffTraining("box-office-staff"), false);
  assert.deepEqual(normalizeCompetencies(["Floor", "Floor", "  Payments ", ""]), ["Floor", "Payments"]);
});

test("migration enforces immutable identities, duplicate protection and staff-only acknowledgement", async () => {
  const sql = await readFile("supabase/migrations/20261019110000_phase_50_2_staff_training_register.sql", "utf8");
  assert.match(sql, /staff_profile_id uuid not null references public\.staff_profiles/);
  assert.match(sql, /staff_training_duplicate_prevention/);
  assert.match(sql, /Only the trained staff member may acknowledge this record/);
  assert.match(sql, /for update/);
  assert.match(sql, /staff_training_events/);
  assert.doesNotMatch(sql, /on delete cascade/);
});

test("training API is server paginated and acknowledgement email is idempotent", async () => {
  const route = await readFile("src/app/api/admin/training/route.ts", "utf8");
  const email = await readFile("src/lib/email/staffTrainingEmail.ts", "utf8");
  assert.match(route, /pageSize.*trainingPageSize/);
  assert.match(route, /\.range\(/);
  assert.match(route, /acknowledge_staff_training/);
  assert.match(email, /claimStaffEmailDelivery/);
  assert.match(email, /training-acknowledgement/);
  assert.match(email, /Tracy Maltman/);
  assert.match(email, /Kaden Damon/);
});
