# Phase 58.1 - Credit Notes & Refund Reconciliation

STATUS: IN PROGRESS

DATE: 29 OCTOBER 2026

## Goal

Extend the existing booking financial documents and controlled Xero
architecture with permissioned, durable credit-note drafts for invoiced
bookings and read-only refund reconciliation evidence.

## Activation Boundary

- Draft preparation and review may be deployed for Tristan Chetty and Rachelle
  Smuts.
- Live Xero credit-note posting remains disabled pending explicit accounting,
  VAT and Xero workflow approval.
- Credit-note creation never initiates a PayFast or bank refund.
- No Production credit note, refund, payment allocation or customer
  communication may be created during QA.

## Safety

- Preserve original invoice identity and approved venue mappings.
- Block credits above the remaining invoiced value.
- Preserve refund/payment records and expose reconciliation status without
  inferring Xero evidence.
- Preserve unrelated working-tree files and all existing business data.

PHASE 58.1 IMPLEMENTATION IN PROGRESS.
