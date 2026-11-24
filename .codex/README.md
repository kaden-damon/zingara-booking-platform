# Codex Task Instructions

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
