# Staff Issue Resolution Notifications And Elapsed Time

Date: 26 November 2026. Status: released / READY; authenticated completion and inbox receipt verified.

## Existing Workflow And Actual Gap

- `src/app/api/admin/issues/route.ts` persists staff reports and completions;
  `src/lib/staffIssueNotification.ts` sends new-report alerts to Kaden only.
  There was no reporter completion notification or elapsed-time presentation.
- Extend existing `staff_email_notification_deliveries`, personal preferences,
  `communication_templates`, `insertCommunicationPayload`, branded customer-email
  wrapper and `sendZingaraEmail`. Existing scheduled `/api/workflows/run` recovers
  queued completion notifications; no extra cron, API, polling or dependency.
- Existing role/venue authority remains in `serverAdmin`, `zingaraAccess`,
  `staffLocations` and destination APIs. No booking/customer/financial mutation.

## Verified Resolution And Notification Contract

- Management PATCH requires `resolutionVerified: true` for first completion.
  Server validates notes (max300 characters/two sentences, no technical markers).
  Existing historical notes are preserved when unchanged. Role restrictions stay
  Super Admin / Venue Manager. Optimistic updated-at guard prevents stale saves.
- Migration20261126170000 adds pending state/index to existing delivery log and
  completion trigger. No new table or historical completion update/backfill.
  Database clock stamps first verified completion, snapshots original report time,
  summary/notes/reporter/context/verifier in existing metadata; protects evidence
  against subsequent notes edits. Historical completed entries are not replayed.
- Unique notification key+issue ID and atomic pending claim protect concurrent
  dispatch/retries. Pre-SMTP preparation failures remain queued; provider handoff
  uncertainty is failed/review-only, never blind automatic resend. A process dying
  after claim leaves processing evidence for reconciliation (do not blindly reset).
- Reporter is original staff-profile identity, not current editor or Kaden route.
  Current active email and Issue Resolutions personal subscription apply; missing
  subscription defaults enabled under existing internal-email policy. Inactive
  account/disabled preference/template/reopened issue logs suppression, no reroute.
- Existing Communications template `Staff Issue Resolution` controls subject/body
  and activation. Supported tokens: `bug_reference`, `issue_summary`, `status`,
  `resolution_time`, `reporter_name`, `resolution_notes`. Fixed summary/status/time
  remain prominent outside editable greeting/body. Existing branded gold CTA only
  to supported Admin booking/show/floor/customer/waitlist section, checked against
  current reporter role and actual show venue. Floor links require exact show.
  Unknown or unsupported context omits CTA rather than inventing destination.
- Elapsed time uses genuine created/completed timestamps; no artificial historical
  times or backdating. Missing/invalid/negative intervals display no invented value.
- AGENTS/README now require max TWO short plain-English resolution sentences,
  confirming fix and next action only. No technical/root-cause narrative. Codex
  completes via authenticated management PATCH and verifies Communications and
  delivery outcome; SMTP acceptance alone is not inbox receipt.

## Essential Verification

- 31 directly relevant Node tests pass: real PATCH through fixture authority,
  persisted completion/reopen, actual branded HTML, elapsed time, permissions,
  venue/exact-show links, absent CTA, personal/template suppression, concurrent
  claims, note-edit dedupe, uncertain SMTP failure, no historical replay, existing
  new-report media and subscription/routing regressions.
- Rollback-only migration exercised against real Postgres using isolated issue
  fixtures and existing authorised verifier identity: reject unverified/unauthorised
  completion and excessive notes; generate genuine time/snapshot; atomically claim
  once; reject failed-SMTP reclaims; preserve original completion evidence; historical
  note edits enqueue nothing; authenticated role cannot call claim function.
  Transaction rolled back; no fixture/report/email persisted during these checks.
- TypeScript passes. Changed-file lint clean except two pre-existing Admin
  `react-hooks/set-state-in-effect` errors2921/2934 (unchanged floor selector code)
  and existing warnings. An additional unrelated historical staffPlainLanguage
  wording test fails against unchanged BookingReconciliationModal, left untouched.
- No new queries on ordinary issue listing or other workspaces. Dispatch queries
  run only on completion/queue drain, bounded20/indexed pending; no new dependencies.
- Private evidence: `local-evidence/issue-resolution-migration-rollback.json`;
  never stage private operational snapshots. Production email/release checks below
  must be recorded before claiming completion. Frontend2 remains untouched.

## Release And Live Verification

- Initial application commit `dfca30e33f21906e57c550c4e75d1c369ff44c63`, pushed Main
  with prior approved pending documentation commits. Production
  `dpl_HYLSaftCG6QX3jBr5xZVHCCohprX` READY, actual alias book.zingara.co.za verified.
  Clean build compiles; budgets raw1,312,092/1,320,000;gzip319,009/320,000;
  largestgzip169,665/170,000. No budget increase. Unauthenticated live PATCH401.
- Migration20261126170000 applied transactionally with bounded lock/statement
  timeouts and ledger evidence; trigger present, historical queue count0. No
  booking/payment/customer row or historical issue completion changed.
- One explicitly labelled authorised fixture, `BUG-EMAIL-CHECK-20261126`,
  issueID`f1220807-1a8c-4e5d-8110-44a3b64c87db`, original reporter Kaden. Direct
  fixture insert avoids the separate new-report management alert. Genuine created
  26Nov14:45:16.007969 SAST, live verified completion14:52:06.925746 SAST, elapsed
  410.917777seconds. Native Chrome existing authenticated Kaden session: opened
  exact issue; entered two sentences; selected Completed/Fixed; checked Fix
  verified; saved successfully. Live list/detail show Resolved in6minutes.
- Exact sent notes: "This issue has been resolved. Please reopen Customers and
  continue." Branded HTML/gold button verified by actual renderer/fixture tests.
  Live destination https://book.zingara.co.za/admin?section=customers; never bug URL.
- Production Communications`0ddf1b18-cdce-40ea-ba94-b93dbe70750d` sent14:52:15.656,
  delivery`d5f26d1d-fd3c-41f8-ad9e-ffb82b61a6a6` sent14:52:15.770, one attempt,
  last_errornull. Total resolution deliveries1, all historical reporters untouched.
- Independent Outlook receipt confirmed26Nov14:52:26 SAST: exact subject
  `BUG-EMAIL-CHECK-20261126 resolved | Zingara`, from bookings@zingara.co.za,
  TO kaden@kaden.co.za, no CC. Received content confirms Zingara branding, reference,
  Resolved in6minutes, two sentences and Customers link. Connector normalises HTML
  to Markdown; no claim of raw received CSS inspection. One email only, no resend.
- Final targeted server-only correction handles a recorded show ID with no page
  URL, retaining exact venue/show and reporter permissions. Same31 tests pass with
  added case; final deployment evidence follows. No additional migration/email.

## Remaining Boundaries

- Unsupported/insufficient context intentionally omits CTA; do not guess identities
  or destinations. SMTP uncertainty/crash after claim needs manual reconciliation,
  not blind retry. Historical elapsed times use existing recorded timestamps,
  without inventing verification timestamps or sending historical notifications.
- Desktop live authenticated workflow verified; no physical iPhone verification
  claimed. Existing unrelated lint/wording-test failures remain as described above.
- Staff notification preference remains authoritative; suppressed mail is not
  falsely reported delivered. Future Codex tasks must verify real reporter outcome.
