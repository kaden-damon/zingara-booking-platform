# Zingara to Xero foundation

## Authority boundary

- Zingara owns enquiries, Companies and contacts, operational quotes and acceptance evidence, bookings, guest entitlement, verified PayFast/manual payment evidence, tickets, shows, capacity, tables and Floor.
- Xero owns accounting contacts, issued invoice numbers and statuses, credit notes, accounting payment allocations, tax and ledger state.
- A local invoice draft is never presented as an issued Xero invoice. Invoice approval or a payment link never changes Zingara's paid state.

## Disconnected release

This release starts in `Not Connected` with synchronisation paused. It creates no Xero contact, quote, invoice, payment or credit note. The outbox is durable and paused by default; unknown account and tax mappings fail closed.

The operational quote editor supports independently priced lines, four-decimal unit prices, line reordering, customer and internal notes, a separate validity date and an immutable version table. Custom service lines do not create guests, tickets or capacity.

## Supported official API model

- OAuth 2.0 authorisation code flow with offline access is required for a durable server integration.
- An authorised user may expose multiple tenant connections. Accounts must explicitly select the approved organisation; the first tenant is never selected automatically.
- Accounting API resources used after activation: Contacts, Quotes, Invoices, Payments, Credit Notes, Accounts, Tax Rates and Tracking Categories.
- Mutation requests use a stable `Idempotency-Key`, while Zingara's durable outbox supplies longer-lived local duplicate protection and dependency ordering.
- Xero webhooks are verified using the raw body and HMAC-SHA256 signature. Webhook work is acknowledged quickly and processed asynchronously. Payments require bounded reconciliation because Payment is not among the documented accounting webhook event categories.

## Activation sequence

1. Register the Zingara app in Xero and add the exact Production and non-Production redirect URIs.
2. Add the client ID, client secret and a dedicated token-encryption key through secure deployment secrets.
3. An authorised Accounts user connects and explicitly chooses the approved tenant.
4. Keep sync paused and discover accounts, tax rates, tracking and branding read-only.
5. Accounts approves each mapping and the policies listed below.
6. Complete a contact, quote and invoice round trip in an authorised Xero demo organisation.
7. Enable Production sync only under a separate explicit authorisation.

## Accounts decisions still required

- approved Xero organisation and authorised Accounts user;
- invoice branding theme, numbering and contact account-number ownership;
- revenue, Booking Fee, gratuity, surcharge/add-on, discount, deposit, payment and credit-note accounts;
- Xero tax code and VAT treatment for every line category;
- tracking categories/options and venue mapping;
- payment allocation, overpayment and unapplied-funds policy;
- credit note, reversal, refund and void policy;
- quote validity, booking hold, payment terms and approved customer wording;
- resolution of the conflicting refund and automatic-release wording in the supplied examples.

No disputed example wording is encoded as universal policy.

## Phase 49.1 completion matrix

Verified against the repository and official Xero documentation on 11 October 2026.

| Requirement | Implementation | State without credentials | Verification |
| --- | --- | --- | --- |
| Local quotes, arbitrary lines, four-decimal rates, VAT modes and immutable versions | Existing atomic document functions, editor, calculations and PDF | Implemented | Foundation calculation/version/PDF tests |
| Quote acceptance and exact-version invoice conversion | Atomic database functions with optimistic version checks and one-invoice constraint | Implemented | Duplicate conversion and stale-version tests |
| OAuth start/callback | Server-only authorisation-code flow, state hash, single-use state, PKCE, exact redirect and encrypted verifier | Implemented, fail-closed | Mock OAuth contract tests |
| Tenant discovery and selection | Connections endpoint stores candidates; Accounts explicitly selects one | Implemented, no automatic selection | Mock tenant tests and server permission gates |
| Token security and refresh | AES-256-GCM token vault, rotating refresh token and optimistic token revision | Implemented | Vault, expiry and rotation tests |
| Connection lifecycle | Connect, select, pause, reconnect and revoke/disconnect controls | Implemented; not configured in Production | Route and disconnected-state checks |
| Read-only discovery | Organisation, active accounts, tax rates, tracking categories and branding | Implemented; requires connection | Same executable adapter and mock transport |
| Stable contacts | ContactNumber lookup, conflict block and idempotent create | Implemented | Adapter/mock end-to-end tests |
| Quotes and invoices | Executable Accounting API create/update/read/list adapters | Implemented but outbound disabled | Adapter/mock end-to-end tests |
| Payments and credit notes | Executable allocation and draft credit-note adapters; verified-payment evidence allowlist | Implemented but outbound disabled | Successful/failed evidence tests |
| Outbox worker | Bounded claim/lease, per-tenant gate, idempotency, retries, rate-limit delay, terminal review, audited staff retry and version-aware completion | Implemented; no Production schedule activated | Worker crash/retry/pause tests and bounded attention API |
| Webhooks | Raw-body HMAC, durable receipt before acknowledgement, dedupe, bounded processing and sequence guard | Implemented; no Production webhook secret | Signature/replay/order tests |
| Scheduled reconciliation | Bounded invoice reads using `If-Modified-Since`; payment and credit-note read adapters for scheduled reconciliation because Xero has no Payment webhook | Implemented; activation disabled | Reconciliation tests |
| Accounts mappings | Ten required categories, explicit Accounts approval, activation blocked until all are approved | Implemented | Mapping completeness tests |
| Accounting workspace | Bounded ten-row document list, filters, details, booking financial comparison, connection/mapping panel, sync attention/retry and reconciliation status | Implemented | API/UI tests and responsive QA |
| Venue scope and permissions | Every local document/list action uses staff venue scope; connection is Settings-only; reconciliation is Accounts/Settings | Implemented | Existing access tests plus route inspection |
| Live Xero interoperability | Requires credentials, approved organisation/mappings and demo-organisation round trip | Blocked by design | Mock contracts do not certify live operation |

## Executable contract inventory

- Identity: `https://identity.xero.com/connect/authorize`, `/connect/token`, `/connect/revocation`.
- Tenant connections: `GET https://api.xero.com/connections` with explicit organisation selection.
- Accounting API base: `https://api.xero.com/api.xro/2.0`.
- Read: Organisation, Accounts, TaxRates, TrackingCategories, BrandingThemes, Contacts, Invoices, Payments and CreditNotes.
- Write: Contacts, Quotes, Invoices, Payments and CreditNotes. Mutations include a stable `Idempotency-Key` and `Xero-Tenant-Id`.
- Reconciliation reads are paged and bounded. Modified-since reads use the documented `If-Modified-Since` header.
- Webhook categories accepted by the current Xero contract are Contact, Invoice, Credit Note, Overpayment and Prepayment. Payments are reconciled through bounded reads, not an invented webhook event.

Official references:

- https://developer.xero.com/documentation/guides/oauth2/overview
- https://developer.xero.com/documentation/guides/oauth2/token-types/
- https://developer.xero.com/documentation/guides/oauth2/tenants/
- https://developer.xero.com/documentation/guides/webhooks/overview
- https://developer.xero.com/documentation/best-practices/api-call-efficiencies/rate-limits/
- https://developer.xero.com/documentation/guides/idempotent-requests/idempotency/
- https://developer.xero.com/documentation/api/accounting/contacts
- https://developer.xero.com/documentation/api/accounting/quotes
- https://developer.xero.com/documentation/api/accounting/invoices
- https://developer.xero.com/documentation/api/accounting/payments
- https://developer.xero.com/documentation/api/accounting/creditnotes
- https://developer.xero.com/documentation/api/accounting/trackingcategories
- https://developer.xero.com/documentation/api/accounting/organisation

## Fail-closed Production state

`XERO_LIVE_SYNC_AUTHORISED` is a separate release gate. Missing credentials prevent OAuth start. Missing tenant selection prevents discovery and queue preparation. Missing mapping approval blocks the affected document. Paused or disconnected tenants cannot be claimed by the worker. Reconciliation and outbound execution return a plain-language paused response unless the separate activation flag is explicitly enabled.

No scheduler is activated by this release. Once Wagheeda supplies credentials and Accounts approves the organisation and mappings, an authorised deployment may invoke the existing bounded worker and reconciliation endpoints from the approved scheduler. That activation requires a separate Production authorisation and an Xero demo-organisation round trip first.
