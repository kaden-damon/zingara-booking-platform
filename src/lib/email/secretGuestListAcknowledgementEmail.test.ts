import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  createSecretGuestListAcknowledgementEmail,
  secretGuestListAcknowledgementSubject,
} from "./secretGuestListAcknowledgementEmail.ts";

async function source(path: string) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

test("customer acknowledgement uses the approved branded content and legal notice", async () => {
  const email = await createSecretGuestListAcknowledgementEmail({
    date: "2026-11-04",
    guestCount: 4,
    time: "17:00:00",
    venue: "johannesburg",
  });

  assert.equal(
    secretGuestListAcknowledgementSubject,
    "🎪 You're on Zingara's Secret Guest List!",
  );
  assert.match(email.html, /data-zingara-customer-email="true"/);
  assert.match(email.html, /YOU&#39;RE ON THE LIST!/);
  assert.match(email.html, /A LITTLE ZINGARA MAGIC MIGHT BE COMING YOUR WAY/);
  assert.match(email.html, /Wednesday, 04 November 2026 at 17:00/);
  assert.match(email.html, /Johannesburg/);
  assert.match(email.html, /Number of guests:<\/strong> 4/);
  assert.match(email.html, /does not constitute a confirmed booking/);
  assert.match(email.html, /No seats have been reserved/);
  assert.match(email.html, /Privacy Policy/);
  assert.match(email.html, /Terms &amp; Conditions/);
  assert.doesNotMatch(email.html, /OPEN SECURE ZINGARA LINK/);
});

test("automatic acknowledgement is disabled by configuration and claimed before delivery", async () => {
  const [email, route, migration] = await Promise.all([
    source("./secretGuestListAcknowledgementEmail.ts"),
    source("../../app/api/waitlist/route.ts"),
    source("../../../supabase/migrations/20261030223000_phase_67_customer_acknowledgement.sql"),
  ]);

  assert.match(email, /workflow_key", workflowKey/);
  assert.match(email, /if \(!configuration\?\.enabled\) return \{ status: "disabled"/);
  assert.ok(
    email.indexOf("claimOneTimeEmailCommunication") <
      email.indexOf("sendOperationalCustomerEmail"),
  );
  assert.match(email, /kind: "waitlist_update"/);
  assert.match(route, /Promise\.allSettled/);
  assert.match(route, /sendSecretGuestListNotification/);
  assert.match(route, /sendSecretGuestListCustomerAcknowledgement/);
  assert.match(
    migration,
    /secret_guest_list_customer_acknowledgement',[\s\S]*false,/,
  );
  assert.match(migration, /communications_secret_guest_list_ack_once_uidx/);
});

test("preview resolves Kaden by stable staff id and cannot create an enquiry", async () => {
  const email = await source("./secretGuestListAcknowledgementEmail.ts");

  assert.match(email, /e8598359-54a0-4e1f-a635-1ec8ae02cb78/);
  assert.match(email, /TEST EMAIL — CUSTOMER ACKNOWLEDGEMENT PREVIEW/);
  assert.doesNotMatch(email, /waitlist_entries|createSecretGuestListEntry/);
  assert.match(email, /sendZingaraEmail/);
  assert.match(email, /completeClaimedEmailCommunication/);
});
