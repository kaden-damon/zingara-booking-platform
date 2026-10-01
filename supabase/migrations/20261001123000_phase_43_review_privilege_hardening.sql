revoke all on public.review_invitations from service_role;
revoke all on public.guest_reviews from service_role;
revoke all on public.guest_review_events from service_role;

grant select, insert, update on public.review_invitations to service_role;
grant select, insert, update on public.guest_reviews to service_role;
grant select, insert on public.guest_review_events to service_role;
