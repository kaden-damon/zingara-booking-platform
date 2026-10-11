create or replace function public.retry_xero_sync_outbox_atomic(
  p_outbox_id uuid,
  p_next_status text,
  p_actor_auth_user_id uuid,
  p_actor_staff_profile_id uuid,
  p_actor_name text,
  p_actor_role text,
  p_actor_location_scope text[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.xero_sync_outbox%rowtype;
  v_now timestamptz := now();
begin
  if p_next_status not in ('paused', 'pending') then
    raise exception 'Invalid Xero retry status';
  end if;

  select * into v_item
    from public.xero_sync_outbox
   where id = p_outbox_id
   for update;

  if v_item.id is null then
    raise exception 'Xero sync item not found';
  end if;
  if v_item.status <> 'blocked' then
    raise exception 'Xero sync item is no longer waiting for review';
  end if;

  update public.xero_sync_outbox
     set status = p_next_status,
         last_error = null,
         next_attempt_at = null,
         lease_owner = null,
         lease_expires_at = null,
         updated_at = v_now
   where id = v_item.id;

  insert into public.audit_events (
    actor_auth_user_id, actor_staff_profile_id, actor_name, actor_role,
    actor_location_scope, action, entity_type, entity_reference, entity_id,
    outcome, source_area, reason, before_values, after_values, changed_fields
  ) values (
    p_actor_auth_user_id, p_actor_staff_profile_id, p_actor_name, p_actor_role,
    coalesce(p_actor_location_scope, '{}'::text[]), 'xero.sync-retry-requested',
    'xero_sync_outbox', v_item.id::text, v_item.id::text, 'success',
    'Xero integration', 'Accounts requested a safe retry.',
    jsonb_build_object('status', v_item.status, 'last_error', v_item.last_error),
    jsonb_build_object('status', p_next_status, 'last_error', null),
    array['status', 'last_error']
  );

  return jsonb_build_object('id', v_item.id, 'status', p_next_status);
end;
$$;

revoke all on function public.retry_xero_sync_outbox_atomic(uuid,text,uuid,uuid,text,text,text[]) from public, anon, authenticated;
grant execute on function public.retry_xero_sync_outbox_atomic(uuid,text,uuid,uuid,text,text,text[]) to service_role;

comment on function public.retry_xero_sync_outbox_atomic(uuid,text,uuid,uuid,text,text,text[]) is
  'Atomically requeues one blocked Xero sync item and records immutable staff audit evidence.';
