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
