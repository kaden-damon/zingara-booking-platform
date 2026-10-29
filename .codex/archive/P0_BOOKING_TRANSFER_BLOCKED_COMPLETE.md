# P0 - Booking Transfer Blocked - Complete

Completed 29 October 2026.

Production commit `3644d0cbfd5add2588f02247c1aee42ba04bc189` corrected the
shared internal booking-transfer eligibility rule so SOLD OUT performances can
be considered without reopening public sales. ACTIVE and SOLD OUT destinations
now proceed to the existing authoritative atomic capacity and seating checks;
CLOSED, inactive, cancelled and archived performances remain ineligible.

The incident booking was `ZNG-XVFB2G`, a 10-guest Golden Circle Corporate
complimentary booking for Kerry. It remains confirmed on JHB 4 November 2026
at table 406. The JHB 12 November temporary table `Kerry` remains available and
unassigned. The requested move remains legitimately blocked because the
destination Golden Circle has six authorised seats remaining, not the ten
required.

The shared status defect affected potential internal transfers to 29 current
or future SOLD OUT performances across both venues. Twenty-seven have room in
at least one operational zone and 24 have temporary tables. No additional
failed booking references could be proven because the former early rejection
did not create audit events.

Focused tests, TypeScript, diff checking and the Production webpack build
passed. The Production database function and authenticated Admin state were
verified after deployment. No business data was changed.

Deployment `dpl_2bEDR9NVjUWYE5EeapwAaMKxL9Hw` is READY at
`https://book.zingara.co.za`. Rollback point:
`eacf32f5305bc58ba965b84a949e1b9016dd40be`.
