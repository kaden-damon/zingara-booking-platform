-- Phase 50.10 refinement: actionable private booking-experience taxonomy.

alter table public.platform_feedback_submissions
  add column if not exists show_date_ease smallint check (show_date_ease between 1 and 5),
  add column if not exists seating_ease smallint check (seating_ease between 1 and 5),
  add column if not exists checkout_ease smallint check (checkout_ease between 1 and 5),
  add column if not exists payment_confidence text
    check (payment_confidence in ('yes','mostly','no')),
  add column if not exists booking_device text
    check (booking_device in ('mobile','computer','tablet','cant_remember'));

create index if not exists platform_feedback_submissions_taxonomy_idx
  on public.platform_feedback_submissions
  (venue,booking_device,payment_confidence,submitted_at desc);

create or replace function public.submit_platform_feedback(
  p_token_hash text,
  p_rating integer,
  p_show_date_ease integer,
  p_seating_ease integer,
  p_checkout_ease integer,
  p_comment text,
  p_payment_confidence text,
  p_booking_device text,
  p_contact_requested boolean
)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_invitation public.platform_feedback_invitations%rowtype;
  v_existing public.platform_feedback_submissions%rowtype;
  v_feedback public.platform_feedback_submissions%rowtype;
  v_now timestamptz := now();
  v_comment text := nullif(trim(coalesce(p_comment,'')),'');
  v_contact boolean := coalesce(p_contact_requested,false) and p_rating <= 3;
begin
  if p_rating is null or p_rating not between 1 and 5 then
    raise exception 'PLATFORM_FEEDBACK_RATING_REQUIRED';
  end if;
  if p_show_date_ease is null or p_show_date_ease not between 1 and 5
    or p_seating_ease is null or p_seating_ease not between 1 and 5
    or p_checkout_ease is null or p_checkout_ease not between 1 and 5 then
    raise exception 'PLATFORM_FEEDBACK_STRUCTURED_ANSWERS_REQUIRED';
  end if;
  if p_payment_confidence is null
    or p_payment_confidence not in ('yes','mostly','no') then
    raise exception 'PLATFORM_FEEDBACK_PAYMENT_CONFIDENCE_REQUIRED';
  end if;
  if p_booking_device is null
    or p_booking_device not in ('mobile','computer','tablet','cant_remember') then
    raise exception 'PLATFORM_FEEDBACK_BOOKING_DEVICE_REQUIRED';
  end if;
  if v_comment is not null and (
    length(v_comment)>2000 or v_comment ~ '<\s*/?\s*[a-zA-Z][^>]*>'
    or v_comment ~ '[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]'
  ) then raise exception 'PLATFORM_FEEDBACK_COMMENT_INVALID'; end if;

  select * into v_invitation from public.platform_feedback_invitations
  where token_hash=p_token_hash for update;
  if not found or v_invitation.status='revoked' then
    raise exception 'PLATFORM_FEEDBACK_LINK_INVALID';
  end if;
  if v_invitation.expires_at<=v_now or v_invitation.status='expired' then
    update public.platform_feedback_invitations
    set status='expired',updated_at=v_now
    where id=v_invitation.id and status<>'submitted';
    raise exception 'PLATFORM_FEEDBACK_LINK_EXPIRED';
  end if;

  select * into v_existing from public.platform_feedback_submissions
  where invitation_id=v_invitation.id;
  if found then
    if v_existing.rating=p_rating
      and v_existing.show_date_ease=p_show_date_ease
      and v_existing.seating_ease=p_seating_ease
      and v_existing.checkout_ease=p_checkout_ease
      and v_existing.comment is not distinct from v_comment
      and v_existing.payment_confidence=p_payment_confidence
      and v_existing.booking_device=p_booking_device
      and v_existing.contact_requested=v_contact then
      return jsonb_build_object('id',v_existing.id,'idempotent',true);
    end if;
    raise exception 'PLATFORM_FEEDBACK_ALREADY_SUBMITTED';
  end if;

  insert into public.platform_feedback_submissions (
    invitation_id,booking_id,customer_id,show_id,venue,rating,
    show_date_ease,seating_ease,checkout_ease,comment,payment_confidence,
    booking_device,contact_requested
  ) values (
    v_invitation.id,v_invitation.booking_id,v_invitation.customer_id,
    v_invitation.show_id,v_invitation.venue,p_rating,p_show_date_ease,
    p_seating_ease,p_checkout_ease,v_comment,p_payment_confidence,
    p_booking_device,v_contact
  ) returning * into v_feedback;

  update public.platform_feedback_invitations
  set status='submitted',submitted_at=v_now,updated_at=v_now
  where id=v_invitation.id;
  insert into public.platform_feedback_events(feedback_id,event_type,metadata)
  values(v_feedback.id,'submitted',jsonb_build_object(
    'rating',p_rating,
    'show_date_ease',p_show_date_ease,
    'seating_ease',p_seating_ease,
    'checkout_ease',p_checkout_ease,
    'payment_confidence',p_payment_confidence,
    'booking_device',p_booking_device,
    'contact_requested',v_contact
  ));
  return jsonb_build_object('id',v_feedback.id,'idempotent',false);
end $$;

revoke all on function public.submit_platform_feedback(
  text,integer,integer,integer,integer,text,text,text,boolean
) from public,anon,authenticated;
grant execute on function public.submit_platform_feedback(
  text,integer,integer,integer,integer,text,text,text,boolean
) to service_role;

comment on table public.platform_feedback_submissions is
  'Private booking-platform feedback with booking-experience taxonomy. Never eligible for public Reviews API, Wix, featuring, moderation publishing, or public review averages.';

update public.platform_feedback_campaigns
set
  email_subject='A little favour from Zingara ✨',
  email_heading='WE''D LOVE YOUR THOUGHTS',
  email_body=E'Dearest {{first_name}},\n\nA little magic happens long before the curtain rises, and we''d love to know how you found booking your Zingara experience.\n\nWas it effortless, or could we have made things a little easier?\n\nYour thoughts will help us make every Zingara experience even more wonderful.\n\n{{feedback_url}}\n\nWith love,\n\nThe Zingara Family',
  email_cta='SHARE YOUR THOUGHTS',
  updated_at=now()
where campaign_key='booking-experience-2026-10'
  and email_subject='A little something from behind the curtain… ✨'
  and email_heading='A LITTLE NOTE FROM THE ZINGARA FAMILY'
  and email_cta='SHARE YOUR THOUGHTS ✨'
  and email_body=E'Dearest {{first_name}},\n\nEvery extraordinary Zingara experience begins long before the curtain rises. It begins with a little anticipation, a touch of excitement and, of course, securing your place at our table.\n\nAnd that''s where we''d love your thoughts.\n\nWe''ve been adding a little more magic behind the scenes, and we''d love to know how you found booking your tickets with us.\n\nWas it all smooth sailing? Was everything easy to find? Or is there a little something we could do to make the experience even more wonderful?\n\nYour thoughts help us make the magic happen, even before the show begins.\n\nIt''ll only take a moment, we promise.\n\n{{feedback_url}}\n\nWith love, laughter & a little Zingara magic,\n\nThe Zingara Family';
