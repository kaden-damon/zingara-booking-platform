alter table public.review_invitations
  add column if not exists revision integer not null default 1 check (revision > 0);

drop index if exists review_invitations_manual_email_identity_idx;
create unique index review_invitations_manual_email_identity_idx
  on public.review_invitations (booking_id, normalized_email)
  where invitation_type = 'manual_email'
    and normalized_email is not null
    and status in ('active', 'submitted');

alter table public.review_invitation_events
  drop constraint if exists review_invitation_events_event_type_check,
  add constraint review_invitation_events_event_type_check
    check (
      event_type in (
        'created',
        'email_sent',
        'email_failed',
        'link_copied',
        'manual_review_invitation_revoked'
      )
    );

create or replace function public.revoke_manual_review_invitation_atomic(
  p_invitation_id uuid,
  p_booking_id uuid,
  p_expected_revision integer,
  p_actor_staff_profile_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invitation public.review_invitations%rowtype;
  v_now timestamptz := now();
begin
  select * into v_invitation
    from public.review_invitations
   where id = p_invitation_id
     and booking_id = p_booking_id
   for update;

  if not found
     or v_invitation.invitation_type not in ('manual_email', 'manual_link') then
    raise exception 'REVIEW_INVITATION_NOT_FOUND';
  end if;

  if v_invitation.status = 'submitted' or v_invitation.submitted_at is not null then
    raise exception 'REVIEW_INVITATION_ALREADY_SUBMITTED';
  end if;

  if v_invitation.status = 'revoked' then
    return jsonb_build_object(
      'id', v_invitation.id,
      'revision', v_invitation.revision,
      'status', v_invitation.status,
      'idempotent', true
    );
  end if;

  if p_expected_revision is null or v_invitation.revision <> p_expected_revision then
    raise exception 'REVIEW_INVITATION_STALE_REVISION';
  end if;

  update public.review_invitations
     set status = 'revoked',
         revoked_at = v_now,
         updated_at = v_now,
         revision = revision + 1
   where id = v_invitation.id
   returning * into v_invitation;

  insert into public.review_invitation_events (
    invitation_id,
    event_type,
    actor_staff_profile_id,
    metadata
  ) values (
    v_invitation.id,
    'manual_review_invitation_revoked',
    p_actor_staff_profile_id,
    jsonb_build_object(
      'booking_id', v_invitation.booking_id,
      'invitation_type', v_invitation.invitation_type,
      'source', 'Booking Details'
    )
  );

  return jsonb_build_object(
    'id', v_invitation.id,
    'revision', v_invitation.revision,
    'status', v_invitation.status,
    'idempotent', false
  );
end;
$$;

revoke all on function public.revoke_manual_review_invitation_atomic(uuid, uuid, integer, uuid)
  from public, anon, authenticated;
grant execute on function public.revoke_manual_review_invitation_atomic(uuid, uuid, integer, uuid)
  to service_role;

comment on function public.revoke_manual_review_invitation_atomic(uuid, uuid, integer, uuid) is
  'Atomically revokes an unused manual review invitation while preserving its row, token evidence, and immutable lifecycle history.';
