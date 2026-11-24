# PayFast Payment And Fulfilment Investigation

DATE: 23 NOVEMBER 2026

STATUS: READ-ONLY PLATFORM AUDIT COMPLETE; PROVIDER TRACE AND OPERATIONAL FOLLOW-UP REQUIRED

## Scope And Safety

- Recovered AGENTS.md, CURRENT_TASK.md, README.md and the Phase 65,
  November public-payment-integrity and Microsoft 365 outage records.
- Existing branch/worktree and unrelated uncommitted work preserved.
- Production SQL was enclosed in `begin read only` / `rollback`; no checkout,
  payment, booking, message, ticket, invoice or data-changing RPC was invoked.
- Frontend 2.0 untouched. No code/configuration/migration changes, commit, push
  or deployment. No confirmed payment-processing defect justifies a release.
- Snapshot queries ran from approximately 10:43 SAST. Main 14-day aggregate window:
  9 November 10:48:13 through 23 November 10:48:13 SAST. Follow-up delivery
  queries used that start with the then-current ledger state.

## Theresa May

- One exact matching customer and one associated booking found: **ZNG-YW2USY**.
  Alternate names/contact identities cannot be excluded by this name match.
- Booking created 21 November 18:47:27.585 SAST, total **R7,700**, paid **R0**,
  outstanding **R7,700**. Currently cancelled/archived after automatic checkout
  expiry on 21 November 19:18:11.072 SAST. The balance is not a live payment
  instruction: an expired reservation is not automatically payable.
- PayFast checkout attempt **82255d28-9e92-4f33-aee6-15da2cd732c6** created
  21 November **18:47:28.722 SAST**: R7,700 booking allocation + R10 transaction
  fee = **R7,710 provider gross**. A separate zero-value reservation placeholder
  is not a second charge. Both local rows are pending, with no provider ID.
- Server checkout preparation returned 200 at 18:47:28.947; mobile browser
  recorded redirecting to PayFast at 18:47:29.660. No subsequent browser return
  event was recorded for this reference.
- **No ITN receipt of any status**, no imported provider event, no successful
  payment allocation, no ticket and no communication exists for this booking.
- This establishes the last platform-observed step, NOT the bank/provider's
  exact failure point. Banking-app approval is not settlement evidence.
- Integration: PayFast Aggregation hosted checkout. Shopper-selected payment
  instrument is not retained by these checkout/receipt records; `platform` /
  `payfast` identifies workflow/gateway, not card/EFT/CapitecPay/MobiCred.
- A bank hold, delayed callback, alternative merchant reference or capture
  cannot be excluded without PayFast/bank evidence. Do not promise no duplicate
  charge or attribute Theresa's attempt to MobiCred.

## Fourteen-Day Production Findings

- **986 distinct COMPLETE provider transactions / receipts across 971 bookings**, all `processed`,
  all linked to existing payments and bookings. No received rejected, failed,
  pending-processing or retryable-failure ITN in the aggregate window.
- Zero received-gross versus persisted-provider-gross mismatches in that cohort.
- Payment rows are `fully_paid` or `deposit_paid`; provider transaction unique
  index and pending-checkout-attempt index remain installed.
- **1,020** distinct references reached successful server checkout preparation;
  **193** have no processed COMPLETE receipt, including **188** unpaid archived
  reservations. These are incomplete checkout observations, NOT 193 proven
  banking failures or charged customers. Payment initiation telemetry commonly
  has both server and browser events; do not count both as separate attempts.
- Browser return telemetry: 79 cancelled events and 1,242 ordinary return events;
  events can repeat. Twelve checkout 429 events; no logged checkout/ITN HTTP
  5xx in the queried durable platform-event subset. This is not a complete CDN
  request-log claim. Ordinary returns are not proof of payment success.
- Daily confirmations continued throughout, including 57 references on
  17 November and 86 on 18 November. Calendar-day figures span different
  attempt cohorts and must not be used as conversion rates.

### Successful Payment Requiring Capacity Review

- **ZNG-X94SUT**, PayFast **341736879**: R6,170 gross / R6,160 applied;
  paid R6,160, outstanding R0, but booking remains cancelled with no ticket or
  communication. Successful callback first received **18 November 09:58:37.927
  SAST**, after hold expiry **17 November 07:50:40.857 SAST**.
- Existing audit `public_booking.late-payment-review-required` at 18 November
  09:58:39.194 SAST records `capacity_review`: four Golden Circle guests,
  only two seats available, deficit two, for the 2 December performance.
- Payment was preserved; automatic restoration/ticket issuance correctly did
  not bypass capacity. This is a confirmed paid-but-unfulfilled operational
  exception, not proof that payment allocation failed. Callback timing alone
  cannot establish when PayFast collected funds or why notification was late.
- Box Office must resolve capacity/booking eligibility or approved financial
  remediation separately. No restoration, seating change or refund performed.

### Separate Ticket-Validity Exception

Follow-up: the separately authorised 23 November recovery has now restored both
original ZNG-6MGLG2 tickets and released the stale snapshot correction. See
ZNG_6MGLG2_TICKET_RESTORATION_2026-11-23.md. The findings below describe the
pre-recovery audit state, not the booking's current ticket validity.

- A stricter valid-ticket check found **ZNG-6MGLG2**, confirmed / fully paid,
  R2,720 paid and R0 outstanding, with two stored tickets both `cancelled`.
- PayFast allocations: R1,100 / provider 337544887 on 30 October and R1,620 /
  provider 341807867 on 18 November 10:23:48.836 SAST.
- Audit records show reinstatement on 17 November 10:06:05.643 SAST and show
  transfer at 10:06:43.509. Ticket cancellation timestamps are 10:06:05.645.
- This is an established ticket-validity anomaly, distinct from missing payment
  notifications. Audit action names alone do not establish the intended ticket
  state, whether replacement delivery exists elsewhere, or a systemic code cause.
  The ITN helper reuses an existing ticket-code record; it is not safe to blindly
  reactivate cancelled tickets or rewrite their history based on this audit.
- Requires targeted ticket/reinstatement review and operational recovery after
  current identity/show/eligibility validation. No ticket was issued, reactivated
  or sent. Do not describe all paid bookings as fully fulfilled.

### Confirmation / Receipt Delivery Is A Separate Problem

- In the successful-payment booking cohort, 47 failed reservation-confirmation
  records and 40 failed payment-confirmation records exist. **78 of these 87
  failures** fall on 12-13 November, overlapping the independently documented
  Microsoft SMTP outage (see P0_MICROSOFT_365_OUTAGE_IMPACT_AUDIT_2026-11-13.md).
- Current sent-record comparison: **45 confirmed bookings have no sent booking
  confirmation**, **39 have no sent payment confirmation**, **37 lack both**,
  **47 lack either**. The separately cancelled late-payment booking above is
  excluded from these delivery counts. Failed ticket renders were not indicated
  by the specific render-failure marker in the inspected gap records.
- These are delivery-ledger gaps, not missing payment allocations. `sent` means
  provider handoff, not verified inbox delivery. A custom/manual delivery might
  exist under another communication type; do not blindly replay failed rows.
- Missing sent reservation confirmations:
  ZNG-934JWH, ZNG-Y2JCNH, ZNG-WMMRT9, ZNG-LW23W3, ZNG-GKVKBB,
  ZNG-PEFZSF, ZNG-VYJDBE, ZNG-UUZKHY, ZNG-7YEFDB, ZNG-PBJVBK,
  ZNG-6AXZHL, ZNG-3T5DY9, ZNG-26Y2AX, ZNG-SFDZLV, ZNG-PK6FJR,
  ZNG-LD5Y32, ZNG-L4HD58, ZNG-JHQ3TX, ZNG-W3T3RJ, ZNG-PLN3W3,
  ZNG-FLW6QJ, ZNG-NNYQWM, ZNG-UDU7LA, ZNG-7G559B, ZNG-7JCDPF,
  ZNG-RE9EUN, ZNG-YP65DJ, ZNG-W8SUR5, ZNG-3A6F8Z, ZNG-98HVA3,
  ZNG-WCWPZV, ZNG-JF7LBD, ZNG-NU2X5X, ZNG-FPPBKP, ZNG-B99S65,
  ZNG-HT5FKS, ZNG-E7UXJA, ZNG-UTEV2U, ZNG-TA6GL3, ZNG-D6NQJQ,
  ZNG-MZLT7M, ZNG-WAJYTU, ZNG-L3YNPS, ZNG-H4S54E, ZNG-YFEXH7.
- Receipt-only gaps with sent reservation confirmation: ZNG-B66H3W, ZNG-P9PYTK.
- Failures outside the documented outage need individual delivery/provider
  evidence; do not attribute them all to Microsoft or change SMTP credentials.
- The 14-day Vercel runtime-log query timed out (504). One narrowed one-day SMTP
  query returned one record with no excluded interval. Redacted extraction did
  not establish an exact SMTP error; no comprehensive 14-day runtime-log or
  current provider-outage conclusion is claimed.

## PayFast Official Incident Correlation

- Ongoing Aggregation MobiCred degradation began 17 November 22:53 SAST:
  https://payfast.statuspage.io/incidents/9b7wx7fc3dyk
- Aggregation ITN delays on 17 November 10:58-12:50 SAST, now resolved:
  https://payfast.statuspage.io/incidents/sv991rdmqzxw
- Official status history also lists CapitecPay / Instant EFT / Aggregation
  processing incidents on 16-17 November: https://payfast.statuspage.io/
- These overlap the investigation window but do not establish transaction-level
  causation. Theresa's 21 November attempt is outside the resolved 17 November
  callback window; her instrument is unknown. Gateway-only FNB SiD and encryption
  key notices are not automatically applicable to this Aggregation integration.
- Latest imported PayFast provider-history event is 1 October; no imported
  provider transaction evidence covers this 14-day period. The ledger cannot
  exclude successful captures for which no ITN was ever received.

## Escalation And Safe Recovery

1. Ask PayFast to trace Theresa using ZNG-YW2USY, exact attempt UUID above,
   21 November 18:47:28-30 SAST, ZAR7,710 gross. Request actual instrument,
   provider transaction ID, authorisation/capture/void state, failure reason,
   and ITN dispatch/retry timestamps and HTTP responses. No provider ID is
   available locally to supply. Confirm whether her reported 23 November action
   used this checkout or another reference/contact identity.
2. Other recent expired/no-callback examples for provider lookup (not independently
   reported banking failures): ZNG-PCFS9F (23 Nov 09:55:10 SAST, R4,630),
   ZNG-HYG7XV (22 Nov 22:51:07, R3,090), ZNG-WHS8GE (22 Nov 22:23:12, R12,890),
   ZNG-YTW266 (22 Nov 18:34:08, R2,730), ZNG-63CT6Y (22 Nov 18:03:04, R2,760),
   ZNG-HAL98K (22 Nov 17:24:56, R3,090). Selected instrument unknown in each.
3. Do not instruct a guest to retry while provider/bank outcome is unresolved.
   Never request passwords, OTPs, CVVs or full card details. Obtain only a
   redacted transaction trace and bank/payment-method identification if needed.
4. For verified paid bookings with email gaps, verify current valid tickets,
   booking identity and prior deliveries through existing Admin/Find My Booking
   controls. Any actual resend must be deliberate and separately authorised;
   this audit sent nothing. Do not ask a paid guest to pay again for an email gap.
5. For an unpaid expired hold, resolve provider status and current availability
   before using the existing booking recovery flow. Do not manually mark paid,
   revive an expired payment link or issue tickets based on app approval alone.

## Targeted Verification

- Seventeen existing tests passed: PayFast ITN reliability (3), managed payment
  links (10), Phase 65 exact-attempt reconciliation / Table Plan integrity (4).
- Production functions `prepare_payfast_checkout_attempt_v2` and
  `confirm_payfast_payment_core_v2` remain installed; prepare inserts a distinct
  attempt, confirmation accepts exact attempt identity. Definition MD5 values:
  `93f2a3fe8ed2a1f067de915f84e84b2a` and
  `8c6d1e663985f65ba4576df290c778e2`, respectively.
- Source continues signing custom_str3 and using the exact-attempt confirmation
  RPC. Provider-ID unique index remains installed; no safeguard weakened.
- No successful payment was manufactured, retried, reconciled or emailed in QA.
- No confirmed platform payment defect; no speculative fix/release performed.
  Provider trace, capacity/ticket exceptions and communication recovery remain open.

## New PayFast CSV Evidence: Timely Payments, Delayed Notifications

23 November 2026, focused read-only continuation. Earlier investigation lacked
the provider's actual November transaction times; the new file changes that
evidence boundary. No replay of previous broad 14-day investigation or browser QA.

Source: `/Users/kadendamon/Downloads/2026-11-23-Transaction_History_36090701.csv`,
SHA256 `8e7aaebbe2883c079f6d52144af9e8a719e5bef17503d0489381e821fa7818f1`.
Existing structured CSV parser reused locally; NO import into Production.
71 Funds Received payments /71 bookings, 17 Nov 07:20:02-21:38:24 SAST.

### Yolandi's Payment Was Before Expiry

CSV row 72 identifies original booking ZNG-X94SUT, PayFast 341736879, exact
checkout attempt 16f3e1a4-2a3f-41b2-b327-64737cc4d71f, Funds Received,
Credit Card, **17 Nov 07:27:27**, gross R6,170. Booking allocation R6,160 plus
R10 checkout transaction fee; CSV provider processing fee -R189.76 / merchant
net R5,980.24 are separate settlement fields, not a booking underpayment.

CSV Date has no embedded timezone. Applied supplied SAST interpretation and
existing import convention (+02:00). Independent alignment: 57 other provider
times match UTC-stored notification times within 0.774-2.178 seconds under that
interpretation; Yolandi's browser return at 07:27:35 is eight seconds after the
provider event. No two-hour UTC/SAST conversion bug found. This establishes the
provider's Funds Received time; bank authorisation time is not supplied separately.

Timeline SAST:

- 17 Nov 07:19:44.016: original persisted booking /30-minute hold begins.
- 07:19:45.256: exact checkout attempt created; redirect 07:19:46.033.
- **07:27:27: PayFast Funds Received**, 22m17s before deadline.
- 07:27:35.338: browser returned awaiting confirmation.
- 07:49:44.016: hold deadline; 07:50:40.857 SYSTEM cancels/releases reservation.
- **18 Nov 09:58:37.558: Vercel POST ingress**, request
  `swcsv-1794988717558-73b5bcb5450f`, `/api/payfast/itn`, response **200**.
- 09:58:37.927: first durable ITN receipt, provider 341736879, COMPLETE.
- 09:58:39.199: financial allocation recorded; receipt processed 09:58:39.447.
  All signature/source/merchant/amount/provider-validation checks passed.
- Existing capacity-review audit: 147 active /149 approved, four required,
  only two available. Payment preserved without unsafe automatic reinstatement.
  Later expressly authorised recovery remains confirmed with four valid tickets.

Elapsed provider Funds Received -> first durable notification **26h31m10.927s**;
receipt -> allocation **1.272s**, receipt processing **1.520s**. This was NOT a
customer payment the following morning, nor a day spent processing a received
notification inside Zingara.

### Cohort Reconciliation

One bounded read-only VALUES cohort joined exact booking references and indexed
provider receipt/payment identifiers. All 71 have COMPLETE/processed receipts,
one matching successful allocation each; allocation +R10 matches provider gross.
No missing receipt, rejected current receipt or allocation mismatch in this export.
Fourteen delayed by 22.399-26.631 hours; other 57 notifications within 2.178 seconds.
Delayed methods: eight Credit Card, five ApplePay, one GooglePay. Gross delayed
payments R88,333.75 is an observation, NOT lost/unallocated money or new debt.

All payment times below are **17 November**, notification times **18 November**,
all SAST. Every listed booking currently confirmed. "Expired in window" means
it was expired even though provider payment preceded its stored hold deadline;
it does not claim that every other transaction used a new public seat hold.

| Booking | PayFast ID | Provider Funds Received | First durable notification | Expired despite payment within hold |
| --- | --- | --- | --- | --- |
| ZNG-LQY5ZS | 341736411 | 07:20:02 | 09:57:55.337 | Yes |
| ZNG-X94SUT | 341736879 | 07:27:27 | 09:58:37.927 | Yes |
| ZNG-849V7E | 341738089 | 07:28:57 | 09:58:48.394 | Yes |
| ZNG-C3W7LV | 341768807 | 09:36:13 | 09:42:03.401 | Yes |
| ZNG-BBDTL6 | 341774413 | 09:56:08 | 09:44:30.220 | Yes |
| ZNG-VJKAY7 | 341781903 | 10:20:19 | 10:04:47.576 | Yes |
| ZNG-373JZB | 341794415 | 11:01:45 | 10:12:53.850 | No expiry recorded |
| ZNG-W8VHMY | 341795811 | 11:08:49 | 10:14:31.069 | Yes |
| ZNG-LR3KMB | 341801799 | 11:27:22 | 10:18:25.288 | No hold/expiry recorded |
| ZNG-DVGVX9 | 341804475 | 11:37:42 | 10:20:24.556 | Yes |
| ZNG-78QNTW | 341806949 | 11:47:15 | 10:22:09.776 | No hold/expiry recorded |
| ZNG-6MGLG2 | 341807867 | 11:56:29 | 10:23:47.549 | No expiry recorded for this payment |
| ZNG-26SYD8 | 341808839 | 11:59:07 | 10:24:20.206 | Yes |
| ZNG-URU559 | 341810017 | 12:00:37 | 10:24:33.568 | Yes |

Ten premature-from-provider-perspective expiries, including Yolandi. All fourteen
notifications processed within 2.872 seconds of first receipt. Funding methods
and interleaved near-instant transactions contradict a blanket MobiCred cause or
complete application outage. No assertion that every affected ticket/email is
fulfilled from current confirmed status alone; Yolandi's four tickets separately
verified unchanged. Cohort is this supplied day/export, not all merchant history.

### Logs, Safeguards And Remaining Cause Gap

Bounded historical Vercel log query covered 17 Nov 07:15-12:15 SAST for the
notification route; returned successful HTTP 200 callbacks for other bookings,
with `url.parse` deprecation warnings. An error-level log warning is NOT itself
a failed webhook. Separate 40-second query around Yolandi's 18 Nov receipt
confirms COMPLETE/valid/200 and capacity_review, not signature rejection or a
payment save exception. No earlier stored receipt or rejected ITN for her
provider ID. No new notification POST was sent by this investigation.

Receipt logging occurs before signature/merchant/source/server validation, so
ordinary validation rejections should leave a durable receipt. But the existing
durable receipt starts only after config/service setup/body read: network/TLS,
firewall/routing, pre-handler failures or failure to persist the first receipt
cannot be ruled out solely from absence of that receipt. Runtime observations
are not a complete packet trace or a guarantee about all CDN/firewall attempts.

Yolandi's receipt attempt_count=1; several others have 2-3 arrivals close together
on 18 November. These count persisted identical-body arrivals, not PayFast's
unobserved dispatch attempts. Actual **first notification SEND time, original
URL and delivery/retry results are absent from the CSV and local ITN evidence**.
Cannot prove provider first sent next day, nor falsely clear every pre-handler
platform boundary. Confirmed notification/recognition gap precedes application
receipt; exact delivery root cause and fault ownership remain unresolved.

Official provider acknowledgement:
https://payfast.statuspage.io/incidents/sv991rdmqzxw, posted 17 Nov 10:58,
resolved 12:50 SAST, describes Aggregation notification delays. Relevant to
escalation, but published times do not prove this transaction's onset/dispatch
and cannot alone explain 07:27 -> next-day delivery. MobiCred report posted
22:53 on 17 Nov is not the instrument shown in these transactions.

Phase 65 hashes freshly verified unchanged: prepare
`93f2a3fe8ed2a1f067de915f84e84b2a`, confirmation
`8c6d1e663985f65ba4576df290c778e2`. PayFast provider-transaction unique index
still installed; exact-attempt and duplicate guards untouched. Existing prior
17 targeted-test evidence reused, not rerun for unchanged code. No new code
defect confirmed; no speculative fix, commit, push, deployment or financial edit.

### Required Next Evidence / Hannah Explanation

Ask PayFast for transaction 341736879 and the other 13 IDs: provider payment
completion, original notification URL/time, every dispatch/retry, HTTP status/body
and delivery failure reason. Compare Yolandi and neighbouring delayed transactions
341736411/341738089 with normal near-instant controls ZNG-GRRH7A 07:36:22 and
ZNG-YY268R 07:42:34 on 17 Nov.
Do not send or trigger resends as QA. With dispatch times/HTTP results, correlate
specific ingress request IDs and determine whether a targeted application/network
correction is justified. Do not lengthen holds or bypass capacity speculatively.

For Hannah: "Yolandi paid at 07:27, within her 30-minute booking window. The
payment confirmation only reached our system the next morning, so her seats
had already been released. We found 13 other delayed notifications in the same
PayFast report. All 14 bookings are now confirmed. We need PayFast's delivery
history to establish why those confirmations arrived late; it wasn't a delay
in our system recording the payment once the notification arrived."

Private evidence: `local-evidence/payfast-notification-cohort-2026-11-23.json`,
read-only cohort script and `payfast-Yolandi-receipt-runtime-2026-11-23.jsonl`.
CSV unchanged; no import, real booking/payment/ticket/communication mutation,
credential change, browser QA or Frontend 2.0 work. Yolandi remains confirmed,
four guests/four valid tickets, R6,160 paid /R0 outstanding.

## Full Merchant History Reconciliation - 23 November 2026

READ-ONLY AUDIT COMPLETE. This section expands the earlier 17 November cohort;
it does not replace or alter earlier evidence. No remediation authorised here.

### Scope And Evidence

- Source: `/Users/kadendamon/Downloads/2026-11-23-Transaction_History_36090701 (1).csv`.
  SHA-256 `e7084e7e36e1d7fd084e549e6131f74d97f201547389f812632a7fc007cd3d42`.
- 5,360 rows: 5,284 Funds Received, 24 Funds Received (Reversal), 52 Payouts.
  All ZAR; successful payments span 1 September 10:15:48 to 23 November
  17:46:12 SAST. Payouts are merchant withdrawals, not customer failures.
  This export does not enumerate failed/abandoned payment attempts.
- Reused existing CSV row parser, without its ZNG-only filtering: includes all
  12 successful DP-reference imported payments. 5,039 source booking references.
- Fourteen sequential exact-ID batches of at most 400, explicit READ ONLY
  transactions and 25-second statement timeout. Production snapshots
  23 November 16:22:37.988-16:23:24.233 UTC /18:22:37-18:23:24 SAST.
  One subsequent targeted query covered 84 exception references, cancellation
  audit evidence, refunds, provider reversal events and authorised reallocations.
- Private evidence: `local-evidence/full-payfast-audit-2026-11-23.json`,
  `full-payfast-audit-summary-2026-11-23.json` and
  `full-payfast-exception-history-2026-11-23.json`; read-only extraction scripts
  retained beside them. No customer contact details exported in the report.

### Matching And Financial Integrity

- All 5,284 distinct successful provider IDs match exactly one recorded payment
  allocation. Zero unmatched IDs, missing source bookings or duplicate provider
  allocation rows. All gross amounts reconcile to allocated amount plus checkout
  fee at cent precision. Zero current paid-plus-balance-versus-total discrepancies
  or current overpaid bookings in this cohort. Successful export allocations do
  not exceed the corresponding booking's recorded amount paid.
- One different recipient reference is an approved transfer, not misallocation:
  provider 335149581, R4,410 gross/R4,400 booking value, ZNG-XD6ABJ to ZNG-759ZR8;
  management-approved reallocation recorded 29 October 13:56:25 SAST. Existing
  Norman recovery migration/evidence agrees. Multiple distinct deposit/balance
  payments are not automatically duplicate charges.
- This proves allocation matching, not a complete external accounting, bank
  settlement, chargeback or refund-entitlement audit.

### Notification Delays And Premature Expiry

- 3,315 successful transactions have durable COMPLETE receipts, all processed.
  Of these, 3,299 arrive within five minutes; 16 exceed five minutes. The other
  1,969 historical payments still match allocations but predate retained receipt
  coverage (latest source payment without receipt 8 October 17:30:10 SAST).
  Their notification latency is unknown, not evidence of missing payment.
- Delay means provider payment time to first durable COMPLETE receipt, not
  receipt-to-processing time or proof of PayFast's first send time.
- Previous 14 delayed payments on 17 November remain confirmed; two additional
  cases on 21 November show this was not limited to the earlier day's export.
  Methods across all 16: Credit Card 8, ApplePay 6, GooglePay 1, Zapper 1.
  No basis to attribute these to MobiCred.

| Additional booking | Provider ID | Paid SAST | First receipt SAST | Delay | Gross / booking value | Current fulfilment |
| --- | --- | --- | --- | --- | --- | --- |
| ZNG-NQ5S4A | 342677641 | 21 Nov 18:47:33 | 23 Nov 12:40:18 | 41.88 h | R7,210 / R7,200 | Confirmed, fully paid, 5 valid individual tickets; 13 Dec |
| ZNG-WDU462 | 342675217 | 21 Nov 18:26:06 | 23 Nov 12:41:39 | 42.26 h | R5,770 / R5,760 | Confirmed, fully paid, 1 valid group ticket for 4 guests; 19 Dec |

- Twelve timely payments first reached durable receipt logging after their hold
  deadline and their bookings expired. Including historical ZNG-2WTFSB gives
  13 actual expiries despite provider payment before the initial hold deadline:
  ZNG-NQ5S4A, ZNG-WDU462, ZNG-URU559, ZNG-26SYD8, ZNG-DVGVX9, ZNG-W8VHMY,
  ZNG-VJKAY7, ZNG-BBDTL6, ZNG-C3W7LV, ZNG-849V7E, ZNG-X94SUT, ZNG-LQY5ZS,
  ZNG-2WTFSB. All are now confirmed. The historical case has no durable receipt,
  so the same delivery mechanism is not established for it.
- All 16 delayed-notification bookings now have usable ticket entitlements.
  Existing group-ticket bookings must not be misclassified as missing tickets
  merely because one ticket covers multiple guests. No future confirmed paid
  booking without a usable ticket was identified in this export cohort.
- Delivery ownership remains unproven: provider dispatch/retry times and ingress
  evidence are needed. No speculative code correction, resend or retry performed.

### Provider Reversals: Confirmed Structured Reconciliation Gap

All 24 reversals pair with original source payments; gross total R127,915.
ZNG-DRHB7L (R6,060) and ZNG-J4YHPC (R2,730) already have imported structured
reversal records and zero current paid balances. The following 22 do not have
corresponding provider-reversal events or completed local refund records, while
the original allocations remain recorded. Gross R119,125; booking value
R118,905; difference R220 is the 22 original R10 checkout fees. These are provider
reversals, not evidence that another refund should be issued. External accounting
or manual settlement may exist and was not inferred from absence of local rows.

| Booking | Provider-reversed gross | Original booking allocation | Future show, if applicable |
| --- | ---: | ---: | --- |
| ZNG-K4UJS7 | R1,110 | R1,100 | - |
| ZNG-LTGP8X | R3,310 | R3,300 | 5 Dec |
| ZNG-AP5J7K | R22,960 | R22,950 | - |
| ZNG-FT6HRB | R3,310 | R3,300 | - |
| ZNG-WHVT7Y | R5,450 | R5,440 | - |
| ZNG-RGFUQ2 | R4,410 | R4,400 | - |
| ZNG-98HMMG | R5,450 | R5,440 | - |
| ZNG-H9KSYB | R6,810 | R6,800 | - |
| ZNG-UDSZPZ | R6,170 | R6,160 | - |
| ZNG-WZ3UZW | R3,090 | R3,080 | - |
| ZNG-K49BEP | R12,250 | R12,240 | 23 Dec |
| ZNG-TF4LCP | R6,170 | R6,160 | - |
| ZNG-BPW92Y | R1,660 | R1,650 | 25 Nov |
| ZNG-BSN78Q | R10,405 | R10,395 | - |
| ZNG-56FD3H | R1,110 | R1,100 | - |
| ZNG-TS2P8F | R2,510 | R2,500 | - |
| ZNG-GVMML5 | R3,860 | R3,850 | 11 Dec |
| ZNG-9MYZ22 | R1,110 | R1,100 | 26 Nov |
| ZNG-Q5R54V | R9,730 | R9,720 | - |
| ZNG-DTJBU4 | R1,110 | R1,100 | - |
| ZNG-MSK9QA | R2,510 | R2,500 | - |
| ZNG-CAMQBK | R4,630 | R4,620 | - |

### Intentional Cancellations And Other Exceptions

66 source bookings remain cancelled with positive historical paid amounts:
19 future and 47 past. All 66 have successful explicit guest/staff cancellation
audit evidence; none establishes an unresolved automatic payment-expiry case.
Five future cancellations are in the reversal table above. The following 14
have neither an export reversal nor completed local refund record. Accounts
must establish applicable forfeiture/refund/transfer or external settlement;
absence of such a record is not proof of money owed or a failed confirmation.

| Booking | Recorded paid | Show date 2026 |
| --- | ---: | --- |
| ZNG-5JKZK3 | R5,760 | 29 Nov |
| ZNG-JRNYL9 | R12,240 | 13 Dec |
| ZNG-YE8H6E | R5,440 | 12 Dec |
| ZNG-8G667F | R3,080 | 13 Dec |
| ZNG-7XS43H | R6,600 | 6 Dec |
| ZNG-AHMNYT | R3,300 | 25 Nov |
| ZNG-564SUS | R6,160 | 6 Dec |
| ZNG-YPEMCP | R3,300 | 26 Nov |
| ZNG-JU4QJC | R2,200 | 22 Dec |
| ZNG-92UEZR | R2,720 | 10 Dec |
| ZNG-2546HN | R7,700 | 4 Dec |
| ZNG-Q72ZXS | R1,100 | 19 Dec |
| ZNG-FPV4JM | R1,100 | 28 Nov |
| ZNG-YYQDZS | R2,200 | 23 Dec |

- ZNG-2WTFSB: historical 11 October show; R2,720 paid, R0 outstanding,
  confirmed, zero ticket rows. Provider payment 28 September 20:04:32 SAST,
  hold deadline 20:33:57, expiry 20:35. No durable notification evidence;
  historical processed_at alone cannot prove when the platform first knew.
  Review past entitlement history; no current admission emergency established.
- ZNG-DTMB3B: historical 2 October show; R9,180 paid, R1,360 outstanding,
  seven guests/six usable individual tickets. Rasmus increased guests 6 to 7
  on 25 September 11:37:37 SAST; added guest remains unpaid. This is not
  established as a successful paid entitlement that failed to issue.
- ZNG-6YHM7B: cancelled 3 October show, R5,760 recorded paid; guest cancellation
  for funeral. Two R5,770 refund requests on 9 November failed, neither completed,
  and no provider reversal in export. Accounts must confirm external settlement
  and entitlement before any retry. Two failed requests are not two paid refunds.
- ZNG-TF4LCP had four failed local refund attempts but a subsequent R6,170
  provider reversal is present. Do not retry on the basis of failed statuses.

### Outcome And Recommended Actions

1. No confirmed involuntary future paid booking without valid entitlement found.
   Do not reinstate intentionally cancelled bookings or issue tickets as QA.
2. Accounts should reconcile the 22 proven provider reversals against structured
   records, prioritising the five future-show references, and check the 14 other
   future cancellation outcomes plus the failed-refund case separately.
3. Escalate all 16 delayed IDs, including the two new 21 November cases, for
   actual PayFast dispatch/retry/HTTP traces. Clustering on two dates means the
   earlier 14 were not isolated, but does not establish universal payment failure
   or prove provider fault. Older notification latency remains unmeasurable.
4. No new code defect is proven by this audit. Existing Phase 65/idempotency
   evidence reused; no repeated browser QA or tests for unchanged code.

No app code, migrations, fixes, import, booking/payment/ticket/customer changes,
communications, commit, push or deployment. Frontend 2.0 and all prior work
preserved. Only local evidence and established Markdown records updated.
