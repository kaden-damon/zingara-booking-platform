# P0 - Table Plan Export & Seating Classification Integrity

STATUS: COMPLETE - RELEASED AND VERIFIED IN PRODUCTION

DATE: 3 NOVEMBER 2026

## Authoritative Evidence

- Richard's approved master contains 74 permanent tables: booths 1-12 and
  14-24, Middle Ring 200-211 and 300-310, Golden Circle 400-406, 500-506 and
  600-609, and Royal Balcony 900, 901, 800 and 801.
- Production booking `ZNG-ZA8WQC` is Brenton Veeran, 10 guests, JHB 3 November
  2026 at 17:00. Its purchased/original zone is Middle Ring.
- Fatima created show-specific temporary table `408` in Middle Ring at
  10:27:39 SAST and assigned it at 10:29:48 SAST. This release preserves that
  audit history and operational record.
- Sixteen retained numbered temporary rows across four CPT/JHB performances
  have legacy number/section mismatches; 12 have assignments. They remain
  unchanged and visible for operational review.

## Root Causes

1. Commit `9b5a4b98` restored the 74 permanent master codes but deliberately
   left overrides on their saved show-specific section. It did not cover
   numbered temporary overrides such as `408`.
2. `create_temporary_floor_capacity_plan_atomic` selected the next number from
   every numeric table in the requested zone. Legacy layouts containing table
   `400` in Middle Ring therefore caused temporary plans to continue into the
   400 family.
3. Phase 64 commit `cebd7576` cleared `D79:K79` unconditionally. ExcelJS shared
   style references meant that when row 79 became a repeated header after
   dynamic insertion, yellow fills were removed from other headings too.

## Correction

- Exact numeric codes export according to approved families: booths 1-12/14-24,
  Middle Ring 200-399, Golden Circle 400-699 and Royal Balcony 800-999.
- `ORIGINAL ZONE` continues to show the authoritative purchased zone.
- Named temporary tables and merged codes retain their saved show-specific
  section.
- Future temporary plans allocate inside the selected zone family and fail
  atomically if the range is exhausted. The migration rewrites no rows.
- The row-79 workaround now clears only recognised red fills on cloned styles.

## Verification

- Focused tests: 16/16 passed.
- TypeScript, changed-file ESLint and whitespace validation: passed.
- Next.js Webpack Production build: passed.
- Supabase dry-run and Production migration: passed.
- Fresh authenticated JHB export
  `Zingara_Table_Plan_JHB_2026-11-03 (2).xlsx` places table `408` in
  `GOLD CIRCLE`, retains Brenton Veeran / `ZNG-ZA8WQC` / 10 guests and retains
  `Middle Ring` as the original zone. All nine repeated headings are yellow.
- Fresh authenticated CPT export
  `Zingara_Table_Plan_CPT_2026-11-03 (2).xlsx` retains complete headings,
  show-specific temporary rows, Notes and existing financial/dietary columns.
- Production confirms the migration and allocator ranges are active, while the
  reported booking and all 16 legacy rows remain unchanged.

## Release

- Application commit: `6af231b05347a55054352ff9397a234f51a449d4`.
- Migration: `20261103135000_p0_table_plan_seating_classification.sql`.
- Deployment: `dpl_3h1g2KJyEmpSRs5DjMe64vqX4r8D`.
- Deployment URL:
  `https://zingara-booking-platform-5fx9stsp9-kaden-damons-projects.vercel.app`.
- Production alias: `https://book.zingara.co.za`.
- Ready: `2026-11-03 13:54:10 SAST`.

## Rollback

Revert application commit `6af231b0`, then apply a forward migration restoring
the prior function body from
`20260910143000_phase_41_1x_a_incremental_temporary_capacity_recovery.sql`.
No business-data rollback is required.

## Business-Data Delta

Zero. No bookings, seating assignments, existing table records, capacities,
payments, VAT, tickets, customers, communications or financial records changed.
