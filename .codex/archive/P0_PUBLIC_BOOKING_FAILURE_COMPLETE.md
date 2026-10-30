# P0 - Public Booking Failure

STATUS: COMPLETE - PRODUCTION VERIFIED

DATE: 30 OCTOBER 2026

## Result

The public booking system does not increase a selected party of four to six.
The exact party size is retained through show selection, seating and customer
details. Ordinary seating accepts one to six guests when capacity is available;
Private Booths retain their approved minimum of four guests.

The confirmed defect was misleading copy. The available option was described as
a "Private 6-seater booth", which could appear to require six tickets when it was
the only available zone. The description now states that Private Booth seating
is available from four guests and that the selected guest count is preserved.

No booking, pricing, capacity, payment, ticket or seating logic changed. No
Production business data was modified.

Production was verified at a 390 x 844 mobile viewport after deployment. The
corrected Booth guidance rendered and a four-person selection remained unchanged
through Guest Details. Application commit: `6c81f10f1b960de0d06a5a73fd7ccb15da434a68`.
