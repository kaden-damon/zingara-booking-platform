<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Mandatory Zingara Development Doctrine

These rules apply to every task, session and model, subject to higher-priority
instructions. Detailed authority/source map and unresolved evidence are in
`.codex/archive/DEVELOPMENT_BASELINE_RECONCILIATION_2026-10-30.md` (24 November
superseding baseline). Read `.codex/README.md` and `.codex/CURRENT_TASK.md` first.

1. Recover relevant records, current code/configuration, Git state and release
   evidence after every session/model change. Never rely on model memory alone.
   Check later amendments to archives, not just their first STATUS heading.
2. Locate the existing control, component, API, calculation and workflow BEFORE
   coding; record the path and actual gap. Restore, reuse or extend first. Never
   duplicate functionality. New workflows/controls need demonstrated necessity
   AND explicit approval; client checks never replace server validation.
3. Never invent business rules, prices, capacities, limits, defaults, identities
   or permissions. Trace them to approval/configuration/verified behaviour. Expose
   contradictions and resolve relevant uncertainty before implementation.
4. Identify dependencies and affected workflows. Never remove, hide, disable or
   replace existing functionality without explicit authority. For regressions,
   compare the previous working implementation; preserve unrelated behaviour.
5. Treat Production as a live commercial system. Protect bookings, payments,
   customer data, seating, tickets, communications and immutable audit evidence.
   No speculative live-data fixes. A GET may have side effects: inspect it first.
6. Preserve authoritative financial evidence and booking-specific historical
   pricing. Never invent components, force balances, duplicate transactions or
   apply new rules retrospectively. Real financial/historical/data changes need
   their separate applicable authority, not merely code-release approval.
7. Reuse Zingara's gold/black components, typography, spacing and responsive
   patterns: pill buttons/search/dropdowns, branded calendars, circular gold
   customer/export checkboxes, accessible focus and hover/pressed/loading states.
   Keep wording short and plain. No generic substitutes, redundant paragraphs or
   duplicate components. Reuse existing walkthrough popups when relevant.
8. Preserve query, pagination, cache, polling and bundle budgets. Avoid unnecessary
   requests, dependencies, rendering and processing. Never raise a budget merely
   to pass inefficient code; consider impact on unrelated Admin workspaces.
9. Make the smallest safe change; no unrelated refactoring, new architecture,
   unnecessary migrations or complexity. Preserve uncommitted work/checkpoints.
10. Verify the requested operational outcome, including relevant authenticated
    visibility, server permissions, retained controls, financial calculations,
    navigation, mobile/desktop usability and performance. Use safe fixtures for
    consequential actions. Disclose missing evidence; assets/builds alone do not
    prove a workflow works for its intended staff.
11. Reuse completed investigations and tests; run essential targeted checks only.
    Avoid repeated exploratory browser sessions, temporary scripts and duplicate
    verification. Efficiency never permits weakening integrity or safeguards.
12. For authorised application releases: investigate -> implement -> verify ->
    commit -> push -> deploy -> verify actual Production -> report. Confirm the
    live alias, commit and READY deployment. Do not include unrelated changes.
    Documentation-only tasks must not trigger an unnecessary deployment; follow
    the README's local-commit/next-authorised-release exception.
13. Maintain the existing Markdown structure with dated decisions, supersession,
    source paths, release evidence, limitations and outstanding owners/actions.
    No competing knowledge system. Future tasks recover relevant context through
    the baseline map instead of repeating this entire reconciliation.
14. Completion means the requested outcome is achieved and appropriately verified.
    Better wording is not a fix for a blocked workflow. Do not mark unknown or
    historically unresolved cases resolved merely because code was deployed.
15. All staff-facing bug resolution notes MUST be extremely short and simple:
    no more than three short sentences in plain, everyday English explaining
    what went wrong, what was fixed and any action the staff member needs to take.
    Exclude technical terminology, test results, commit references and deployment
    details. Keep detailed technical findings in the existing internal Markdown
    records. This applies to every future bug resolution.

Frontend 2.0 / Phase 50.9 remains strictly isolated: do not modify, merge, deploy
or connect it to live services without explicit approval. Staff two-factor
authentication is deferred and is not authorised by this governance exercise.
