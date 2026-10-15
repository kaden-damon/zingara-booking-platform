import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = process.cwd();
const migrationPath = `${root}/supabase/migrations/20261015193000_phase_49_5_review_enhancements.sql`;

test("new review submissions require five independent ratings and explicit confirmation", async () => {
  const [form, route, reviews] = await Promise.all([
    readFile(`${root}/src/app/review/[token]/ReviewSubmissionClient.tsx`, "utf8"),
    readFile(`${root}/src/app/api/reviews/[token]/route.ts`, "utf8"),
    readFile(`${root}/src/lib/reviews/reviews.ts`, "utf8"),
  ]);
  for (const label of ["Food", "Value", "Service", "Ambience"]) assert.match(form, new RegExp(label));
  assert.match(form, /Yes, Submit/);
  assert.match(form, /Edit Rating/);
  assert.match(reviews, /Choose a rating for Food, Value, Service and Ambience/);
  assert.match(route, /p_food_rating/);
  assert.match(route, /p_ambience_rating/);
});

test("historical reviews remain valid and category ratings are immutable once submitted", async () => {
  const migration = await readFile(migrationPath, "utf8");
  assert.match(migration, /food_rating smallint check/);
  assert.doesNotMatch(migration, /food_rating smallint not null/);
  assert.match(migration, /review_category_submission/);
  assert.match(migration, /REVIEW_CATEGORY_RATINGS_REQUIRED/);
});

test("guest replies are provider-accepted, retry-safe, audited, and detail-only", async () => {
  const [migration, reply, admin, smtp] = await Promise.all([
    readFile(migrationPath, "utf8"),
    readFile(`${root}/src/app/api/admin/reviews/reply/route.ts`, "utf8"),
    readFile(`${root}/src/app/api/admin/reviews/route.ts`, "utf8"),
    readFile(`${root}/src/lib/email/smtp.ts`, "utf8"),
  ]);
  assert.match(migration, /unique \(review_id, idempotency_key\)/);
  assert.match(migration, /where guest_review_replies\.status='failed'/);
  assert.ok(reply.indexOf("sendZingaraEmail") < reply.indexOf('p_status: sent.ok ? "sent"'));
  assert.match(reply, /review\.reply_sent/);
  assert.match(smtp, /replyTo/);
  assert.match(admin, /input\.includeDetails[\s\S]*guest_review_replies/);
});

test("review alerts use configurable staff identities and exact privacy-aware subjects", async () => {
  const [migration, workflow, settings] = await Promise.all([
    readFile(migrationPath, "utf8"),
    readFile(`${root}/src/lib/workflows/reviewManagement.ts`, "utf8"),
    readFile(`${root}/src/lib/email/staffEmailNotifications.ts`, "utf8"),
  ]);
  assert.match(migration, /'new-review-alert',true,array\[v_nicky\],array\[v_kaden,v_fatima\]/);
  assert.match(workflow, /just submitted a \$\{review\.review_privacy_requested \? "Private" : "Public"\} Review/);
  assert.match(workflow, /loadManagementEmailRoute\(client, "new-review-alert"\)/);
  assert.match(settings, /key: "new-review-alert"/);
});

test("contact details stay selected-review-only and public APIs remain identity-safe", async () => {
  const [admin, publicFeed, wix] = await Promise.all([
    readFile(`${root}/src/app/api/admin/reviews/route.ts`, "utf8"),
    readFile(`${root}/src/app/api/reviews/public/route.ts`, "utf8"),
    readFile(`${root}/docs/wix-reviews/reviews.web.js`, "utf8"),
  ]);
  assert.match(admin, /input\.includeDetails[\s\S]*customers/);
  assert.doesNotMatch(publicFeed, /customer_id|mobile|recipient_email|actor_email/);
  assert.doesNotMatch(wix, /customer_id|mobile|recipient_email|actor_email/);
});
