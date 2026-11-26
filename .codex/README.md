# Codex Task Instructions

## Reported Issue Completion

After operational verification, complete reported issues through the existing
authenticated `PATCH /api/admin/issues` management workflow. Send `id`,
`status: "completed"`, `resolutionVerified: true` and `resolutionNotes` of at most
TWO short, plain-English sentences confirming the fix and next action. No root
causes or technical details in reporter notes; retain findings in task archives.
This applies to Codex and Admin alike; do not close bugs through ad hoc SQL.
The completion trigger records genuine completion time and queues one reporter
notification through the existing staff email delivery log. The API dispatches
after its response; the existing scheduled workflow recovers pending work.
Verify Communications plus `staff_email_notification_deliveries` for the issue
ID (`staff-issue-resolution`), including preference suppression or delivery errors.
SMTP acceptance is not inbox confirmation. Do not blindly resend failed/uncertain
deliveries or retrospectively notify historical reporters. Notes edits do not resend.

## Mandatory Reuse-First Doctrine

AGENTS.md records the mandatory development doctrine for all future tasks,
sessions and model changes. Before coding, identify the existing implementation
and document the specific gap in the current task record. For regressions,
compare the previous working version and reuse existing findings. Reuse, restore
or extend existing workflows first; never duplicate controls, APIs, calculations,
components or business logic. New workflows/controls require demonstrated
necessity and explicit user approval BEFORE implementation. Client-side checks
never replace authoritative server validation. Make the smallest safe change,
preserve performance/stability/data integrity, and reuse verification evidence
with only essential targeted tests. This doctrine supplements, not replaces,
the release, permissions, financial-authority and isolation rules below.

## Recover Context Efficiently

1. Read AGENTS.md, CURRENT_TASK.md and this file after every session/model change.
2. Use the **24 November 2026 superseding baseline** at the top of
   [Development Baseline Reconciliation](archive/DEVELOPMENT_BASELINE_RECONCILIATION_2026-10-30.md).
   It maps each platform area to current source, decision archives, dependencies,
   superseded rules, evidence boundaries and outstanding actions. Its archive
   catalogue covers all113 records present at reconciliation; absence of an old
   phase record is not proof that its functionality is absent.
3. Read only the relevant dated archive sections and implementation for the task;
   follow callers, server/API authorisation, SQL functions and downstream outputs.
   Compare the last working version for regressions. Check worktree/Git state,
   actual live deployment and relevant configuration before any release.
4. Record a brief change contract: existing path; confirmed gap; approved rule
   source; retained controls; affected dependencies; safe verification; release
   and rollback boundary. If rules/evidence conflict, expose the conflict first.
5. Reuse prior verified evidence where unchanged. Do not rerun this platform-wide
   reconciliation for each task or treat the snapshot as permanently live truth.

## Authority And Evidence

- Explicit applicable approvals govern intended changes; current code/SQL and
  verified live configuration establish implemented behaviour. A mismatch is a
  finding, not permission to silently pick a new rule or rewrite history.
- Read superseding follow-ups within an archive, not only its title/first status.
  Dates, commit IDs, active call paths and live evidence outrank undated summaries
  for factual currency; filenames and model memories do not establish authority.
- Separate current rules, legitimate historical exceptions, proposed changes,
  unresolved questions and dated observations. Never turn a sample into a
  platform-wide guarantee or a count from an old audit into a live queue count.
- Retain original financial/audit records. Do not recalculate past entitlements
  from today's prices, policy or guessed components. Do not assume a zero balance
  implies lifecycle confirmation or that provider payment time is ITN receipt time.
- Documentation, source inspection, fixtures, browser interaction, authenticated
  live verification and actual consequential writes are different evidence levels.
  Report which occurred. No real customer action merely to prove functionality.

## Required Task Close-Out

- Requested outcome and affected identities/workflows, not just changed wording.
- Essential tests and relevant retained functionality/permission checks.
- For releases: exact application commit, READY deployment and live alias; actual
  functional evidence and unverified boundaries. Never call a push a deployment.
- Financial/configuration/data delta, unresolved decisions, rollback/checkpoint
  references, and existing archive/CURRENT_TASK updates. Protect private evidence;
  never commit customer exports, tokens, credentials or sensitive QA payloads.
- For documentation-only work, check the deployment trigger BEFORE pushing.
  Main currently triggers Vercel Production, including Markdown-only commits.
  Unless a verified non-deploying destination exists and is authorised, commit
  only the scoped documentation locally and retain it for the next authorised
  application release. Report the commit/retention explicitly; do not change
  Vercel settings, add skip-build rules, push a potentially deploying branch or
  trigger a redundant application release to satisfy documentation housekeeping.

## Existing Workflow

- Read AGENTS.md, CURRENT_TASK.md, this file and relevant archive records
  before changing code. Recover existing work; do not create a new phase
  merely because the model or chat changes. Preserve unrelated local work.
- For normal authorised Production development, carry the task through:
  investigate and confirm the cause; smallest safe correction; essential
  targeted checks; commit and push only approved files; Vercel Production
  release; actual Production verification; update the task/archive records;
  report commit, deployment and evidence. Do not pause for redundant approval
  when release is explicitly requested or covered by this workflow.
- Use the existing GitHub main / Vercel Git-triggered release workflow.
  Check remote main and the current live deployment first. Do not upload
  a dirty worktree or include unrelated changes in a release.
- Real booking, payment, financial and historical record changes are
  separate from code release authority and require applicable explicit
  authorisation. Never manufacture transactions to verify a deployment.
- Frontend 2.0 / Phase 50.9 is strictly isolated: no commits, pushes, merges,
  deployments, database connections or live integrations without explicit
  approval for that work. Preserve its worktree and rollback checkpoints.
- Specific task safety restrictions override this default release workflow.
  CURRENT_TASK.md never overrides higher-priority instructions. Never claim
  a release or fix is verified without evidence; record residual limitations.
