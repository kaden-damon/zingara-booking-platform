# Intelligent Quick Bug Reporter

STATUS: COMPLETE - DEPLOYED AND VERIFIED IN PRODUCTION

DATE: 5 NOVEMBER 2026

## Implementation

- Added a small draggable Zingara issue button throughout authenticated Admin.
  Its position is viewport-bounded, stored per staff member and usable with
  mouse, touch and keyboard. Error animation is brief and respects reduced
  motion.
- Reused the existing Bug & Issue Register, private attachment storage,
  Communications records, staff permissions and Microsoft 365 delivery path.
  No parallel reporting or notification system was introduced.
- The reporter listens only to structured failures already returned by Admin
  API operations. It performs no polling, request interception, background
  screenshots or continuous monitoring.
- Safe context includes the attempted action, sanitised error, booking and
  performance identifiers where available, guest-count changes, staff identity,
  SAST timestamp, page, browser, viewport, deployment and request correlation
  identifiers. Credentials, payment details and unrelated customer data are
  excluded.
- The compact panel is lazy-loaded only when opened. Staff may edit the
  description, capture a browser-approved screenshot, attach existing supported
  image/video files and preview or remove attachments. Reports are never sent
  automatically.
- The final UI uses the existing rounded Admin surfaces, pill-shaped controls,
  gold accents and the clean uppercase sans-serif typography used by Management
  Controls. The reporter introduces no separate design convention.
- Quick-report notifications are queued after the issue response, protected by
  an idempotent delivery claim and recorded in Communications with sent/failed
  state. The branded email includes secure attachment links, a direct Admin
  issue link and a copy-ready technical report.

## Verification

- Focused issue-capture and attachment tests passed: 12/12.
- TypeScript, changed-file ESLint, whitespace validation and the Next.js Webpack
  Production build passed.
- The default local Turbopack build remains blocked by the environment's
  compiler-port restriction. Vercel's clean Production build passed.
- The existing Admin performance-budget script does not understand the Next 16
  client-reference manifest. A direct clean baseline comparison measured the
  Admin closed-state page chunk at 757,460 bytes before and 760,471 bytes after:
  +3,011 bytes (approximately 0.4%). The panel remains in a separate lazy chunk.
- Authenticated Production desktop and 420px compact-width verification
  confirmed the floating button, rounded panel, clean sans-serif title,
  Capture/Attach/Send controls and close behaviour without navigating away from
  the active Admin workspace or losing its state. Touch-safe controls,
  viewport clamping and reduced motion remain intact. Real iPhone Safari and
  Android Chrome hardware were not available for this verification.
- Exactly one authorised `Production QA - Test Issue` was submitted:
  `BUG-000030` (`c211fc84-16cf-492f-86a6-f907a12c17ad`) at 19:45:54 SAST.
  It retained safe Admin, browser, viewport, deployment and SAST context and one
  ready private PNG attachment without booking, payment or customer data.
- The issue appeared first in the existing Issue Register. Its branded
  notification was recorded as sent in Communications at 19:46:11 SAST and was
  received and visually verified in `kaden@kaden.co.za`, including the Zingara
  template, technical context, Codex-ready report, attachment and direct issue
  link. The idempotency claim shows one attempt and no error.
- `BUG-000030` was marked Completed / Fixed after verification with a release-QA
  resolution note. No second issue or notification was created.

## Release

- Application commits:
  - `daa5620e` (`feat: add intelligent admin issue reporter`).
  - `fc0b873e` (`style: align quick issue reporter with admin UI`).
  - `0fa1525d` (`style: refine quick reporter typography`).
  - `c9d7e168` (`fix: enforce quick reporter sans heading`).
- Final Production deployment: `dpl_J7v8gZnXDLNAkHjVJjMKiJnr3qAy`, Ready and
  aliased to `book.zingara.co.za` at 19:54:35 SAST.
- No migration was required.
- Business-data delta is limited to completed QA issue `BUG-000030`, its one
  private attachment, one Communications record, one idempotency delivery record
  and the issue completion audit. No booking, seating, payment, ticket or
  financial record changed.
- Rollback: revert `c9d7e168`, `0fa1525d`, `fc0b873e` and `daa5620e`, then
  redeploy. No database rollback is required. Retain `BUG-000030` as immutable
  release evidence.
