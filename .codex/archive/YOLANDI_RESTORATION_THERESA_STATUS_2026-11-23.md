# Yolandi Restoration And Theresa Status Verification

Date: 23 November 2026. Existing task continuation. Times SAST.
Status: subsequent expressly authorised queue recovery completed in Production.
The first investigation below is preserved as historical evidence; its blocked
outcome is superseded by the authorised recovery continuation at the end.

## Scope And Safety

Recovered AGENTS.md, CURRENT_TASK.md, README.md and prior PayFast / ZNG-6MGLG2
restoration records. Reviewed existing reinstatement route and lifecycle functions.
User explicitly authorises only ZNG-X94SUT restoration; ZNG-YW2USY remains read-only.
No Production mutation, capacity override, payment action, invoice, ticket issuance
or communication occurred. No code changes, commit, push or deployment. Unrelated
work, historical records and Frontend 2.0 preserved.

Verification used reference-bounded, timeout-limited `begin read only` queries
and existing `preview_booking_reinstatement`. An initial projection used a wrong
ticket column and failed without writes; corrected to authoritative ticket_status.
Supabase CLI returns the last SELECT, so combined state/lifecycle/preview evidence
was retrieved in one JSON result rather than treating omitted results as evidence.

## ZNG-X94SUT / Yolandi

- Booking ID 903ca00a-0e97-4a4a-a102-d13a17dcc619; Johannesburg 2 December,
  four Golden Circle guests, table null. Original identity/count preserved.
- 17 November 07:19:41: online booking new -> pending_payment.
- 17 November 07:50:40.857: checkout hold expired; SYSTEM audit records
  pending_payment -> cancelled; archived with "Public payment hold expired".
  This was automated unpaid reservation expiry, not an identified staff cancellation.
- 18 November 09:58:39.199: PayFast payment 341736879 recorded, but lifecycle
  stayed cancelled because operational capacity review was required. Earlier
  audit found only two available seats for four; the payment was not discarded.
- Current total R6,160; paid R6,160; balance R0; payment status fully_paid.
  One successful R6,160 payment plus a zero-value pending placeholder; these
  are not two payments. Zero existing tickets and zero communications.

### Restoration Blockers

Live existing preview: Golden Circle active entitlement **149**, effective
operational capacity **149**, availability **0**, restoration pax **4**, deficit
**4**. Show status sold_out. Leaving table_id null does not avoid zone entitlement
capacity. Confirming now would exceed approved capacity, contrary to explicit
user constraints. No mutation RPC or direct row update was attempted.

The preview returns NOT_ELIGIBLE rather than merely CAPACITY_BLOCKED because
the paid public booking remains archived. Existing public-expiry archive exception
requires amount_paid=0 / pending_payment; the paid released-booking path rejects
archived rows. Payment evidence itself passes. No direct unarchive or lifecycle
bypass is justified. Capacity independently prevents safe recovery today, so no
speculative code change or release was made to work around that primary blocker.

Outcome: **not reinstated; no tickets created; no successful Assignment Queue
handoff claimed**. Existing table_id is null, but booking remains cancelled, not
an active unassigned confirmed entitlement. Box Office/management must first
legitimately resolve capacity without displacing other bookings or altering this
guest's approved entitlement. Then review the narrow paid-expiry eligibility
limitation and safely issue exactly four valid entitlements via existing ticket
lifecycle; no duplicate restoration of nonexistent tickets. No financial action
is implied or authorised by these outstanding steps.

## ZNG-YW2USY / Theresa

Booking ID 635fea34-22ca-4a7f-ae1a-9b54d7ca559e; Cape Town 13 December,
five Golden Circle guests. Complete available authoritative lifecycle:

| Timestamp SAST | Transition | Source/actor |
| --- | --- | --- |
| 21 Nov 18:47:25.323 | null -> new | Online checkout, server-authoritative pricing; no staff actor |
| 21 Nov 18:47:25.323 | new -> pending_payment | Online checkout; awaiting PayFast |
| 21 Nov 19:18:11.072 | pending_payment -> cancelled | SYSTEM public checkout hold expiry |

Supporting audit: provenance recorded / table auto-assigned by SYSTEM at
18:47:27.585, then successful public_checkout.hold.expired at 19:18:11.042.
No successful reinstatement, staff cancellation or later status reversal appears
in the available booking-reference audit or authoritative lifecycle history.
Current updated_at remains 21 November 19:18:11.072, matching expiry.

Current: cancelled and archived, reason "Public payment hold expired", table null,
R7,700 total, R0 paid, R7,700 recorded outstanding. Two pending payment records
(zero reservation placeholder and R7,700 checkout attempt), no provider transaction
ID or successful payment. Zero tickets and zero communications. Recorded balance
is not an instruction to pay an expired reservation. Prior investigation found
no ITN receipt; no new provider retry/inquiry was performed for this status audit.

Conclusion: it **was actually stored as cancelled as a result of automatic
expiry**, not just visually expired. Claim that it subsequently became uncancelled
is **not supported** by current persisted status, revision, lifecycle or audit.
Historical browser display cannot be reconstructed from these records; do not
assert what Hannah saw, or invent a UI defect without evidence. No Theresa
record, payment, invoice, link, ticket or communication was modified.

## Essential Verification And Outstanding Action

Read-only state, payment, lifecycle, audit and existing reinstatement preview
verified against both exact references. No browser testing or repeated broad
investigation. No code tests rerun because no source or function changed.
Primary outstanding action: four approved Golden Circle seats for Yolandi's
2 December show, followed by safe lifecycle eligibility/ticket recovery review.
Do not report completed restoration until confirmed booking and valid tickets
are actually observed. Theresa requires no status correction on current evidence.

## Authorised Queue Recovery: Completed

Subsequent explicit user instruction authorises this existing paid obligation
to be confirmed without immediate seating, remaining in Assignment Queue even
with 149/149 existing commitments. No general capacity override was authorised.
Do not confuse this with the earlier instruction prohibiting any excess active
entitlement, under which the first read-only investigation correctly stopped.

### Smallest Scoped Correction

Committed only three related files:

- `supabase/migrations/20261123180000_authorised_paid_checkout_queue_recovery.sql`
- `scripts/verify-authorised-paid-queue-recovery.mjs`
- `src/lib/paidCheckoutQueueRecovery.test.ts`

Function-only migration; no new tables, columns, pricing or UI workflow. New
service-role-only recovery is allowlisted to this booking ID/reference, original
show, four guests, Golden Circle and original R6,160 / PayFast 341736879 receipt.
Checks revision, active edit lock, cancellation/late-payment audit, archived
checkout source, original paid state, no refund/reversal/previous ticket,
no table claims or active same-journey sibling. No staff identity is impersonated:
audit actor is explicitly `AUTHORISED SUPPORT RECOVERY`, with owner-authorisation
reason rather than attributing an interactive staff action to Hannah.

Restoration records approval in the same transaction. Capacity trigger accepts
only the exact approved transition and transaction ID/current original revision,
with all non-lifecycle/metadata fields equal. The existing ordinary capacity
enforcement body is unchanged; a regression compares it against its prior source.
No trigger disabled, session replication bypass or capacity configuration change.
Idempotent retry returns existing result without duplicate tickets or audits;
if later booking/ticket state changed it fails rather than claim restored state.

Existing `reconcile_per_guest_ticket_population` created four identities (there
were none to reactivate), using the normal ticket/QR format and security/payment
triggers. Booking metadata status synchronised to confirmed, no reservation table
claims, floor-assignment marker initially set. Live ticket hydration subsequently
normalised the display to TBC/empty table ID; authoritative table_id remains null
and queue predicates still pass. Historical expiry/payment lifecycle is retained,
with new cancelled -> confirmed event, no historical event rewritten.

### Capacity Reporting Defect Caught Before Commit

First real-trigger rollback assertion rejected capacity changing 149 -> 151:
current demand had reactivated two dormant legacy adjustment seats under the
existing protected-legacy ratchet. No trial changes persisted. Scoped expression
correction excludes only this audited recovery's demand from historical excess
used to activate legacy capacity, while retaining it in active entitlement totals.
It does not exclude the guest obligation from demand or grant sellable seats.
The migration fails closed if its single expected existing expression is absent.

Verified final state: base 120 + existing temporary 29 = **149 approved**;
**153 active guests**, zero base sellable/operational remaining, four-seat shortfall.
No capacity adjustment, physical/temporary table or other booking was changed.
Existing floor planner separates approved seats from booked/queued guests and
shows unresolved capacity. Box Office still must arrange lawful seating; four
valid tickets do not themselves resolve that operational shortfall.

### Verification And Production Release

- 22 focused tests pass: scoped recovery regression plus existing floor planning
  and authoritative ticket reinstatement tests. TypeScript, changed-file ESLint
  and whitespace checks pass. No repeated broad browser QA.
- Real-trigger recovery tested inside transactions ending ROLLBACK, including
  definition changes, ticket creation and deferred constraints. Stale revision,
  active competing lock, direct unauthorised unarchive/confirmation and further
  guest increase rejected. Four distinct tickets, idempotent retry, unchanged
  payments/communications/Theresa/other show bookings/tables, queue predicate and
  153 active /149 approved assertions passed. No notifications dispatched.
- Original Production function definitions checkpoint:
  `local-evidence/X94SUT-recovery-original-functions-2026-11-23.json`.
  Restoring old reporting definitions after recovery is not an automatic rollback
  recommendation: it could reactivate legacy reporting inflation. Any reversal
  needs fresh operational review; do not silently cancel the recovered booking.
- Commit **09e30f4ae4759eb237026a493469fb1a23edd429** pushed to main through
  existing Git workflow. All unrelated Markdown/evidence remained unstaged.
- Vercel **dpl_7f7AvUckokfQkfBt4cXqkxPTHTj2**, **READY**, exact commit SHA;
  Production alias `book.zingara.co.za`, deployment
  `zingara-booking-platform-iinxcg2ra-kaden-damons-projects.vercel.app`.
- After READY, applied only migration **20261123180000** and the authorised
  booking recovery atomically with original-definition/revision checks. Registered
  only that migration; did not replay/repair unrelated migration history.
  Transaction asserted immutable financial/provenance fields, exact original
  payment records, communications, Theresa, other show bookings and tables before
  COMMIT. All passed. No financial or customer-message mutations.
- Recovery audit **41ece4d5-677f-473d-b451-eae0c661ac2a**, action
  `booking.paid-checkout-queue-recovered`, **23 Nov 17:31:57.795 SAST**;
  stable request `authorised-X94SUT-queue-recovery-20261123`.
- All four actual Production `/api/tickets/ZNG-X94SUT-01` through `-04`
  lookups returned **200**, matching active indices 1-4, all statuses valid,
  confirmed/fully-paid booking, four guests, R6,160 paid/R0 balance, correct show,
  no table claims. No admission scan/check-in was performed.
- Final read-only database check after lookups: confirmed, unarchived, table null,
  **existing Assignment Queue predicate true**, four tickets/four valid/four
  distinct QR payloads, one original successful payment, zero communications;
  capacity remains 149 approved/153 committed/zero availability. This verifies
  live data feeding the existing queue; no new authenticated Admin browser session
  or physical iPhone verification is claimed.
- Theresa stays cancelled, R0 paid, exact revision 21 Nov 19:18:11.072 SAST.
  Frontend 2.0/checkpoints and unrelated work untouched.

Private generated evidence: `local-evidence/X94SUT-production-deployment-2026-11-23.json`,
`X94SUT-production-recovery-2026-11-23.json`,
`X94SUT-live-ticket-verification-2026-11-23.json`,
`X94SUT-post-recovery-verification-2026-11-23.json`.
Guarded local execution script `apply-X94SUT-authorised-recovery-2026-11-23.mjs`
is fail-closed on the original function hashes/migration absence; do not rerun as
a general operation or use it for other bookings.

Remaining action: **Box Office resolve Yolandi's four unassigned guests and the
four-seat operational shortfall.** Booking/ticket recovery itself is complete.

## Read-Only Payment Timeline Follow-Up

23 November 2026: reused recovery and earlier PayFast findings. Only two focused
Production read-only sessions queried this booking's timestamps, installed hold
function, payment/ITN records, indexed booking telemetry, provider-event lookup
and original capacity-review audit. No booking/configuration/code/provider API
mutation, payment attempt, browser testing or deployment. Completed reinstatement
is unchanged. No new full-population investigation.

All times SAST:

| Time | Actual evidence |
| --- | --- |
| 17 Nov 07:19:41.219 | Client booking snapshot/lifecycle creation time; not the database hold-start timestamp. |
| 17 Nov 07:19:44.016 | Persisted booking created; hold starts. |
| 17 Nov 07:19:45.256 | Checkout payment attempt 16f3e1a4-2a3f-41b2-b327-64737cc4d71f created. |
| 17 Nov 07:19:45.470 | Server checkout preparation 200. |
| 17 Nov 07:19:46.033 | Mobile browser reports redirecting to PayFast. Not proof of provider page arrival or bank authorisation. |
| 17 Nov 07:27:35.338 | Browser return, paymentState=return / Awaiting Payment Confirmation. Before expiry, but not proof of successful payment. |
| 17 Nov 07:49:44.016 | Exact persisted 30-minute payment-hold deadline. |
| 17 Nov 07:50:40.857 | SYSTEM expiry cleanup cancels/archives unpaid booking; no successful payment evidence then recorded. |
| 18 Nov 09:58:37.927 | First received COMPLETE PayFast ITN for provider 341736879. |
| 18 Nov 09:58:39.194 | Audit records capacity_review: four guests, 147 committed /149 effective, two available, deficit two. |
| 18 Nov 09:58:39.199 | Original checkout payment allocated; R6,160 paid, R0 outstanding; lifecycle retained cancelled pending operational review. |
| 18 Nov 09:58:39.447 | Receipt processed; no failure code. |
| 18 Nov 09:58:39.553 | payment_confirmed telemetry, source payfast-itn, 200. This records payment, not automatic booking reinstatement. |

### Window, Processing And Cause

Installed Production `set_public_checkout_hold()` uses creation + interval
'30 minutes' as the default for new unpaid public bookings; the original booking
persists exactly that interval. This is an implementation/database default, not
an exposed Admin-configurable setting. The column can be supplied by trusted
insertion code, but no setting-based alternate window was found in this flow.
Changing the general default would require an authorised code/function change.

Actual cancellation was 56.841 seconds after deadline, not an additional grace
period entitlement. Cleanup is invoked by public availability, booking and
checkout requests and workflow runs, in indexed bounded batches; it checks
pending/unpaid/unarchived state, due timestamp and absence of successful provider
payment/ticket/communication evidence. Existing cron workflow runs every 15
minutes; request-driven cleanup can execute sooner. Do not describe this case
as exactly a 31-minute configured window or claim an exact per-second scheduler.

Receipt e34ba957-b817-404a-8c99-104798709663, attempt_count=1, processing_status
processed, amount_gross R6,170; original checkout allocation R6,160 plus R10
transaction fee. The zero-value reservation placeholder is not another payment.
ITN receipt to financial allocation took approximately 1.272 seconds; completion
of receipt processing 1.520 seconds. Payment row created_at is checkout initiation,
NOT settlement; payments.processed_at is local recording, NOT provider capture.

Stored receipt evidence has only itemName, customString1/2/3 and itemDescription,
not a payment/authentication/settlement/dispatch date. No imported
payfast_provider_events record exists for 341736879. Bank approval and PayFast
processing times are therefore unknown. Browser return proves neither successful
settlement nor a particular payment instrument. Cannot determine whether payment
completed before the deadline with delayed notification, was still pending when
the browser returned, or completed later. Do not blame PayFast, the bank, the
customer, MobiCred or Zingara reception without provider/bank evidence.

Confirmed immediate cause of cancellation: Zingara had no verified successful
payment by the due hold cleanup. Confirmed reason automatic recovery later failed:
insufficient entitlement capacity at callback time (two seats available, four
required), not a missing payment allocation. The 30-minute expiry and payment
preservation/capacity safeguards behaved as designed. The original archived-paid
manual recovery limitation was separately corrected for the expressly authorised
booking; do not conflate it with the original callback's capacity-review decision.

### Expired Hosted Checkout And Wider Risk

New PayFast checkout preparation rejects cancelled/archived/non-payable bookings;
the route runs hold cleanup before preparation. But local reservation expiry does
not revoke an already-issued PayFast form/hosted session. Existing payment request
builder sends no expiry linked to public_checkout_expires_at, and hold expiry
does not call a provider-session cancellation API. Consequently late confirmations
of previously initiated checkout remain possible. This does not establish that
Yolandi made a new payment after expiry, or prove PayFast accepts any given old
session indefinitely. No live expired checkout was submitted in this audit.

This timing gap can affect other bookings when a pending external payment remains
unconfirmed beyond the seat hold. Reused prior 14-day audit: 986 COMPLETE receipts
across 971 bookings processed; ZNG-X94SUT was the identified paid/expired capacity
exception. Unpaid expired checkout observations were not proven bank failures.
No fresh claim of current platform-wide incident count is made.

No new payment-posting defect established; no basis to change the hold duration
or weaken capacity checks. Obtain a focused provider trace for merchant reference
ZNG-X94SUT, checkout attempt 16f3e1a4-2a3f-41b2-b327-64737cc4d71f, provider
341736879, R6,170 gross: authorisation, completion and first/retried ITN dispatch
timestamps/HTTP results. Then assess supported provider-session expiry alignment
and visibility of paid-expired operational exceptions. Any such prevention change
is separate work; no speculative implementation or deployment in this follow-up.

### Short Email Draft For Hannah

Hi Hannah,

Yolandi's seats were held for 30 minutes, until 07:49 on 17 November. The
booking was automatically cancelled just after 07:50 because no payment
confirmation had reached us. Her browser had returned from PayFast earlier, but
we only received confirmation of the R6,160 the next morning at 09:58. We can't
yet tell when her bank actually completed the payment, so we shouldn't blame
PayFast without their trace.

By then only two seats were available for her four guests, so the payment was
recorded but the booking needed manual review. It is now confirmed with four
valid tickets and is in the Assignment Queue for Box Office to resolve seating.

## Superseding Provider Evidence: Payment Completed Before Expiry

Later 23 November follow-up located actual PayFast export
`Downloads/2026-11-23-Transaction_History_36090701.csv`: original transaction
341736879 /same checkout attempt is Funds Received, Credit Card, R6,170, at
**17 Nov 07:27:27 SAST**, before the 07:49:44 hold deadline. This resolves the
earlier uncertainty above about when the payment itself completed. The earlier
unknown conclusion described the evidence available then, not a claim she paid late.

Historical Vercel ingress **18 Nov 09:58:37.558**, HTTP 200; first durable receipt
09:58:37.927, all validation checks true; local processing completed ~1.52 seconds
later. Confirmed gap is before notification receipt, not internal overnight
processing. Exact first provider notification send/retry/delivery failure remains
unknown; export does not include notification history. Do not assign fault solely
from the successful payment timestamp or a broad incident announcement.

The supplied day/export has 14 delayed notifications (22.4-26.6h) among 71,
including ten reservations expired despite timely provider payment; other 57
receipts near-instant. All fourteen currently confirmed. Full references, IDs,
times, query/log evidence and escalation boundary appended to existing
PAYFAST_PAYMENT_FAILURE_INVESTIGATION_2026-11-23.md. No change to this restored
booking, financials, tickets, seating, communications, code or deployment.
