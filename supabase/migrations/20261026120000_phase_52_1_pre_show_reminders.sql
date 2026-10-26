begin;

create unique index if not exists communications_show_reminder_once_uidx
  on public.communications (booking_id, type, channel)
  where type = 'show_reminder'
    and channel = 'email'
    and status in ('sending', 'sent', 'suppressed');

update public.workflow_configurations
set enabled = true,
    timing_offset_days = 1,
    activated_at = now(),
    body = $body$Dear {{customerName}},

The curtain is almost ready to rise — your Zingara experience is just around the corner.

We look forward to welcoming you to {{showName}}.

Your booking details

Booking reference: {{bookingRef}}
Performance date: {{showDate}}
City and venue: {{location}}
Guests: {{guest_count}}
Seating zone: {{seatingZone}}
Grounds Open: {{groundsOpen}}
Guest Seating: {{guestSeating}}
Show Starts: {{showStarts}}

Everything you need for the evening is available on your digital ticket:

{{ticketUrl}}

Please note:

Beverages are charged separately.

A 12.5% gratuity will be applied to beverages and the dinner portion of your tickets for bookings of 6 or more.

We can't wait to welcome you into the world of Zingara.

The Zingara Team$body$,
    updated_at = now()
where workflow_key = 'pre_show_reminder';

do $$
begin
  if not exists (
    select 1
    from public.workflow_configurations
    where workflow_key = 'pre_show_reminder'
      and enabled = true
      and timing_offset_days = 1
      and activated_at is not null
      and body like '%Grounds Open: {{groundsOpen}}%'
      and body like '%Guest Seating: {{guestSeating}}%'
      and body like '%Show Starts: {{showStarts}}%'
  ) then
    raise exception 'Phase 52.1 reminder configuration was not activated safely.';
  end if;
end
$$;

comment on index public.communications_show_reminder_once_uidx is
  'Prevents concurrent or retried pre-show reminder workers from sending more than one reminder per booking.';

commit;
