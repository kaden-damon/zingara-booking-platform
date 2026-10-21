-- Phase 50.10: private booking-platform feedback and approval-only campaign controls.

create table if not exists public.platform_feedback_campaigns (
  id uuid primary key default gen_random_uuid(),
  campaign_key text not null unique,
  status text not null default 'awaiting_approval'
    check (status in ('awaiting_approval','approved','sending','completed','cancelled')),
  automation_enabled boolean not null default false,
  email_subject text not null default 'A little something from behind the curtain… ✨'
    check (length(trim(email_subject)) between 1 and 200),
  email_heading text not null default 'A LITTLE NOTE FROM THE ZINGARA FAMILY'
    check (length(trim(email_heading)) between 1 and 200),
  email_body text not null default E'Dearest {{first_name}},\n\nEvery extraordinary Zingara experience begins long before the curtain rises. It begins with a little anticipation, a touch of excitement and, of course, securing your place at our table.\n\nAnd that''s where we''d love your thoughts.\n\nWe''ve been adding a little more magic behind the scenes, and we''d love to know how you found booking your tickets with us.\n\nWas it all smooth sailing? Was everything easy to find? Or is there a little something we could do to make the experience even more wonderful?\n\nYour thoughts help us make the magic happen, even before the show begins.\n\nIt''ll only take a moment, we promise.\n\n{{feedback_url}}\n\nWith love, laughter & a little Zingara magic,\n\nThe Zingara Family'
    check (length(trim(email_body)) between 1 and 5000),
  email_cta text not null default 'SHARE YOUR THOUGHTS ✨'
    check (length(trim(email_cta)) between 1 and 80),
  approved_at timestamptz,
  approved_by uuid references public.staff_profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.platform_feedback_campaigns (campaign_key,status)
values ('booking-experience-2026-10','awaiting_approval')
on conflict (campaign_key) do nothing;

create table if not exists public.platform_feedback_invitations (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.platform_feedback_campaigns(id) on delete restrict,
  booking_id uuid not null references public.bookings(id) on delete restrict,
  customer_id uuid not null references public.customers(id) on delete restrict,
  show_id uuid not null references public.shows(id) on delete restrict,
  venue text not null check (venue in ('cape-town','johannesburg')),
  recipient_email text not null check (recipient_email=lower(trim(recipient_email))),
  first_name text,
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  token_envelope jsonb not null check (jsonb_typeof(token_envelope)='object'),
  device_category text check (device_category in ('mobile','tablet','desktop')),
  status text not null default 'active'
    check (status in ('active','submitted','expired','revoked')),
  expires_at timestamptz not null,
  sent_at timestamptz,
  submitted_at timestamptz,
  last_accessed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign_id,booking_id),
  unique (campaign_id,recipient_email)
);

create table if not exists public.platform_feedback_submissions (
  id uuid primary key default gen_random_uuid(),
  invitation_id uuid not null unique references public.platform_feedback_invitations(id) on delete restrict,
  booking_id uuid not null unique references public.bookings(id) on delete restrict,
  customer_id uuid not null references public.customers(id) on delete restrict,
  show_id uuid not null references public.shows(id) on delete restrict,
  venue text not null check (venue in ('cape-town','johannesburg')),
  rating smallint not null check (rating between 1 and 5),
  comment text check (
    comment is null or (
      length(trim(comment)) between 1 and 2000
      and comment !~ '<\s*/?\s*[a-zA-Z][^>]*>'
      and comment !~ '[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]'
    )
  ),
  contact_requested boolean not null default false,
  device_category text check (device_category in ('mobile','tablet','desktop')),
  contacted_at timestamptz,
  contacted_by uuid references public.staff_profiles(id) on delete restrict,
  contact_method text check (contact_method in ('manual_follow_up','zingara_email')),
  replied_at timestamptz,
  replied_by_name text,
  status text not null default 'submitted' check (status in ('submitted','resolved')),
  revision integer not null default 1 check (revision > 0),
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (not contact_requested or rating <= 3)
);

create table if not exists public.platform_feedback_events (
  id uuid primary key default gen_random_uuid(),
  feedback_id uuid not null references public.platform_feedback_submissions(id) on delete restrict,
  event_type text not null check (event_type in ('submitted','contacted','contact_undone','replied','resolved','reopened')),
  actor_staff_profile_id uuid references public.staff_profiles(id) on delete restrict,
  occurred_at timestamptz not null default now(),
  note text,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata)='object')
);

create table if not exists public.platform_feedback_replies (
  id uuid primary key default gen_random_uuid(),
  feedback_id uuid not null references public.platform_feedback_submissions(id) on delete restrict,
  idempotency_key uuid not null,
  actor_staff_profile_id uuid not null references public.staff_profiles(id) on delete restrict,
  actor_name text not null,
  actor_email text not null,
  recipient_email text not null,
  message text not null check (length(trim(message)) between 1 and 4000),
  status text not null default 'processing' check (status in ('processing','sent','failed')),
  attempt_count integer not null default 1 check (attempt_count > 0),
  last_error text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (feedback_id,idempotency_key)
);

create table if not exists public.platform_feedback_approval_links (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.platform_feedback_campaigns(id) on delete restrict,
  staff_profile_id uuid not null references public.staff_profiles(id) on delete restrict,
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  token_envelope jsonb not null check (jsonb_typeof(token_envelope)='object'),
  expires_at timestamptz not null,
  last_accessed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (campaign_id,staff_profile_id)
);

create table if not exists public.platform_feedback_approval_deliveries (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.platform_feedback_campaigns(id) on delete restrict,
  staff_profile_id uuid not null references public.staff_profiles(id) on delete restrict,
  idempotency_key uuid not null,
  recipient_email text not null,
  status text not null default 'processing' check (status in ('processing','accepted','failed')),
  attempt_count integer not null default 1 check (attempt_count > 0),
  last_error text,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign_id,staff_profile_id,idempotency_key)
);

create index if not exists platform_feedback_invitations_status_idx
  on public.platform_feedback_invitations (campaign_id,status,created_at);
create index if not exists platform_feedback_submissions_queue_idx
  on public.platform_feedback_submissions (status,submitted_at desc,id desc);
create index if not exists platform_feedback_submissions_venue_idx
  on public.platform_feedback_submissions (venue,submitted_at desc,id desc);
create index if not exists platform_feedback_events_feedback_idx
  on public.platform_feedback_events (feedback_id,occurred_at desc);
create index if not exists platform_feedback_replies_feedback_idx
  on public.platform_feedback_replies (feedback_id,sent_at desc) where status='sent';

alter table public.platform_feedback_campaigns enable row level security;
alter table public.platform_feedback_invitations enable row level security;
alter table public.platform_feedback_submissions enable row level security;
alter table public.platform_feedback_events enable row level security;
alter table public.platform_feedback_replies enable row level security;
alter table public.platform_feedback_approval_links enable row level security;
alter table public.platform_feedback_approval_deliveries enable row level security;

revoke all on public.platform_feedback_campaigns, public.platform_feedback_invitations,
  public.platform_feedback_submissions, public.platform_feedback_events,
  public.platform_feedback_replies, public.platform_feedback_approval_links,
  public.platform_feedback_approval_deliveries from public,anon,authenticated;
grant select,insert,update on public.platform_feedback_campaigns,
  public.platform_feedback_invitations,public.platform_feedback_submissions,
  public.platform_feedback_events,public.platform_feedback_replies,
  public.platform_feedback_approval_links,public.platform_feedback_approval_deliveries to service_role;

create or replace function public.submit_platform_feedback(
  p_token_hash text,
  p_rating integer,
  p_comment text,
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
  if v_comment is not null and (
    length(v_comment)>2000 or v_comment ~ '<\s*/?\s*[a-zA-Z][^>]*>'
    or v_comment ~ '[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]'
  ) then raise exception 'PLATFORM_FEEDBACK_COMMENT_INVALID'; end if;

  select * into v_invitation from public.platform_feedback_invitations
  where token_hash=p_token_hash for update;
  if not found or v_invitation.status='revoked' then raise exception 'PLATFORM_FEEDBACK_LINK_INVALID'; end if;
  if v_invitation.expires_at<=v_now or v_invitation.status='expired' then
    update public.platform_feedback_invitations set status='expired',updated_at=v_now
    where id=v_invitation.id and status<>'submitted';
    raise exception 'PLATFORM_FEEDBACK_LINK_EXPIRED';
  end if;
  select * into v_existing from public.platform_feedback_submissions
  where invitation_id=v_invitation.id;
  if found then
    if v_existing.rating=p_rating and v_existing.comment is not distinct from v_comment
      and v_existing.contact_requested=v_contact then
      return jsonb_build_object('id',v_existing.id,'idempotent',true);
    end if;
    raise exception 'PLATFORM_FEEDBACK_ALREADY_SUBMITTED';
  end if;

  insert into public.platform_feedback_submissions (
    invitation_id,booking_id,customer_id,show_id,venue,rating,comment,
    contact_requested,device_category
  ) values (
    v_invitation.id,v_invitation.booking_id,v_invitation.customer_id,
    v_invitation.show_id,v_invitation.venue,p_rating,v_comment,v_contact,
    v_invitation.device_category
  ) returning * into v_feedback;
  update public.platform_feedback_invitations
  set status='submitted',submitted_at=v_now,updated_at=v_now where id=v_invitation.id;
  insert into public.platform_feedback_events(feedback_id,event_type,metadata)
  values(v_feedback.id,'submitted',jsonb_build_object(
    'rating',p_rating,'contact_requested',v_contact,'device_category',v_invitation.device_category
  ));
  return jsonb_build_object('id',v_feedback.id,'idempotent',false);
end $$;

create or replace function public.claim_platform_feedback_reply(
  p_feedback_id uuid,p_idempotency_key uuid,p_actor_staff_profile_id uuid,
  p_actor_name text,p_actor_email text,p_recipient_email text,p_message text
)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid;
begin
  insert into public.platform_feedback_replies(
    feedback_id,idempotency_key,actor_staff_profile_id,actor_name,actor_email,
    recipient_email,message,status
  ) values (
    p_feedback_id,p_idempotency_key,p_actor_staff_profile_id,trim(p_actor_name),
    lower(trim(p_actor_email)),lower(trim(p_recipient_email)),trim(p_message),'processing'
  )
  on conflict(feedback_id,idempotency_key) do update
  set status='processing',attempt_count=platform_feedback_replies.attempt_count+1,
    last_error=null,updated_at=now()
  where platform_feedback_replies.status='failed'
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.complete_platform_feedback_reply(
  p_reply_id uuid,p_status text,p_error text default null
)
returns void language plpgsql security definer set search_path=public as $$
declare v_feedback_id uuid; v_actor uuid; v_actor_name text;
begin
  if p_status not in ('sent','failed') then raise exception 'PLATFORM_FEEDBACK_REPLY_STATUS_INVALID'; end if;
  update public.platform_feedback_replies
  set status=p_status,sent_at=case when p_status='sent' then now() else null end,
    last_error=case when p_status='failed' then left(p_error,1000) else null end,
    updated_at=now()
  where id=p_reply_id and status='processing'
  returning feedback_id,actor_staff_profile_id,actor_name into v_feedback_id,v_actor,v_actor_name;
  if p_status='sent' and v_feedback_id is not null then
    update public.platform_feedback_submissions
    set replied_at=now(),replied_by_name=v_actor_name,contacted_at=coalesce(contacted_at,now()),
      contacted_by=coalesce(contacted_by,v_actor),contact_method=coalesce(contact_method,'zingara_email'),
      revision=revision+1,updated_at=now()
    where id=v_feedback_id;
    insert into public.platform_feedback_events(feedback_id,event_type,actor_staff_profile_id)
    values(v_feedback_id,'replied',v_actor);
  end if;
end $$;

revoke all on function public.submit_platform_feedback(text,integer,text,boolean) from public,anon,authenticated;
revoke all on function public.claim_platform_feedback_reply(uuid,uuid,uuid,text,text,text,text) from public,anon,authenticated;
revoke all on function public.complete_platform_feedback_reply(uuid,text,text) from public,anon,authenticated;
grant execute on function public.submit_platform_feedback(text,integer,text,boolean) to service_role;
grant execute on function public.claim_platform_feedback_reply(uuid,uuid,uuid,text,text,text,text) to service_role;
grant execute on function public.complete_platform_feedback_reply(uuid,text,text) to service_role;

comment on table public.platform_feedback_submissions is
  'Private booking-platform feedback. Never eligible for public Reviews API, Wix, featuring, moderation publishing, or public review averages.';
comment on table public.platform_feedback_campaigns is
  'Booking feedback campaign approval boundary. The seeded campaign remains awaiting_approval until separately authorised.';
