<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Mandatory Zingara Development Doctrine

These rules apply to every task, session and model working in this repository,
subject to higher-priority instructions. Read `.codex/README.md`,
`.codex/CURRENT_TASK.md` and relevant archives before proceeding.

- Locate and understand the existing functionality, controls, APIs, calculations,
  components and business rules BEFORE coding. Record the existing path and gap.
- Reuse, restore or extend the existing workflow FIRST. Never introduce duplicate
  controls, APIs, calculations, components or business logic. Preserve necessary
  server-side validation; client checks are not an authoritative safeguard.
- Every UI change MUST reuse Zingara's existing design system and components:
  branded buttons, calendars/date ranges, gold checkboxes, hover/pressed/loading
  and keyboard-focus feedback, spacing and responsive layouts. Inspect existing
  examples first; extend a shared component only when necessary. Do not introduce
  generic browser styling or duplicate components when a Zingara equivalent exists.
- Customer/export checkboxes must be circular with gold selected states, retaining
  native checkbox semantics and keyboard/focus accessibility. Search fields and
  dropdowns use fully rounded pill styling. Keep UI wording minimal: omit redundant
  explanations and units, use concise status messages and compact single-line
  pagination without changing underlying data, financial meaning or safeguards.
- For a regression, compare the previous working version with the current one
  before designing a correction. Recover previous findings and release evidence.
- New workflows or controls require demonstrated necessity AND explicit user
  approval before implementation. Explain why the existing functionality cannot
  satisfy the requirement; do not substitute a new workflow for an unexamined one.
- Make the smallest safe change. Preserve platform performance, stability,
  permissions, financial safeguards, historical evidence and data integrity.
- Reuse previous verification evidence and run only essential targeted checks for
  the actual change. Do not repeat completed audits or extensive QA unnecessarily.
- Follow the existing release and documentation workflow. Real financial/data
  changes require their applicable separate authority. Frontend 2.0 / Phase 50.9
  remains isolated and must not be touched or released without explicit approval.
