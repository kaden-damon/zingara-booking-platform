# Intelligent Quick Bug Reporter

STATUS: DEPLOYED - PRODUCTION UI VERIFIED; LIVE EMAIL SEND PENDING EXPLICIT QA ACTION

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
- Authenticated Production desktop verification confirmed the floating button,
  compact panel, Capture/Attach/Send controls and close behaviour without
  navigating away from the active Admin workspace or losing its state.
- Responsive constraints, touch-safe controls, viewport clamping and reduced
  motion were covered by implementation inspection and targeted tests. A
  separate authenticated mobile hardware session was not available.
- A live QA submission has not been made: doing so would intentionally create a
  Production Issue Register and Communications record and send an email to
  Kaden. The provider path, idempotency and delivery-state handling are covered
  by targeted verification, but actual receipt remains pending that explicit QA
  action.

## Release

- Application commit: `daa5620e` (`feat: add intelligent admin issue reporter`).
- Production deployment: `dpl_4q8EWDbXHDxmqH3CMMnfcAHwUDR5`, Ready and aliased
  to `book.zingara.co.za` at 19:35:11 SAST.
- No migration was required.
- Business-data delta: zero. No issue, attachment, communication, booking,
  seating, payment, ticket or financial record was created or changed during
  verification.
- Rollback: revert `daa5620e` and redeploy. No database rollback is required.

## Remaining Verification

- Submit one clearly labelled QA report from Kaden's authenticated Production
  session, confirm the Issue Register and Communications records, and confirm
  delivery to `kaden@kaden.co.za`. This is the only outstanding release check.
