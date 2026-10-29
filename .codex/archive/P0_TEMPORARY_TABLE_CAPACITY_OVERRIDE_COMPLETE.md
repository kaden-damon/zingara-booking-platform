# P0 - Temporary Table Capacity Override - Complete

Completed 29 October 2026.

The shared operational capacity snapshot counted temporary tables once but
did not include the uncovered portion of Phase 55 grandfathered commitments
in its starting baseline. Temporary seating was therefore consumed by existing
preserved guests before it could support a new internal booking or transfer.

Migration `20261029235961_p0_temporary_table_capacity_override.sql` now adds
only the grandfathered excess that was not already covered by temporary tables
or approved operational adjustments at Phase 55 activation. Current temporary
tables continue to count once. Merged-table representations remain excluded
from temporary capacity. Public sellable capacity remains permanent-master
capped.

For JHB 12 November Golden Circle, the permanent limit remains 120 and the
operational limit is now 136. Final Production entitlement was 122, so the
ten-guest `ZNG-XVFB2G` transfer is capacity-eligible. The booking was not moved
and the `Kerry` temporary table remains available and unassigned.

The shared correction applies to 41 current/future performances across both
venues, including 13 with current temporary tables. No business records were
modified.

Commit `45bda54`; Production deployment
`dpl_95gGBLL79vEadxvroeFiM2vJM1kd`; application rollback `18aec05`.
