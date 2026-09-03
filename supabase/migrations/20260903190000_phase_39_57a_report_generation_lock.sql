create table if not exists public.report_generation_locks (
  lock_key text primary key check (lock_key = 'analytics-heavy-report'),
  lock_token uuid not null default gen_random_uuid(),
  staff_profile_id uuid not null references public.staff_profiles(id) on delete cascade,
  actor_name text,
  report_type text not null,
  report_scope jsonb not null default '{}'::jsonb check (jsonb_typeof(report_scope) = 'object'),
  acquired_at timestamptz not null default now(),
  expires_at timestamptz not null
);

alter table public.report_generation_locks enable row level security;
revoke all on public.report_generation_locks from public, anon, authenticated;
grant select, insert, update, delete on public.report_generation_locks to service_role;

create or replace function public.acquire_report_generation_lock(
  p_staff_profile_id uuid,
  p_actor_name text,
  p_report_type text,
  p_report_scope jsonb,
  p_timeout_seconds integer default 300
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing public.report_generation_locks%rowtype;
  v_token uuid := gen_random_uuid();
  v_now timestamptz := now();
  v_stale_recovered boolean := false;
begin
  if p_staff_profile_id is null then
    raise exception 'A staff profile is required';
  end if;

  if nullif(trim(p_report_type), '') is null then
    raise exception 'A report type is required';
  end if;

  if p_report_scope is null or jsonb_typeof(p_report_scope) <> 'object' then
    raise exception 'Report scope must be an object';
  end if;

  perform pg_advisory_xact_lock(hashtext('analytics-heavy-report'));

  select * into v_existing
    from public.report_generation_locks
   where lock_key = 'analytics-heavy-report'
   for update;

  if found and v_existing.expires_at <= v_now then
    delete from public.report_generation_locks
     where lock_key = 'analytics-heavy-report';
    v_stale_recovered := true;
    v_existing := null;
  end if;

  if v_existing.lock_key is not null then
    return jsonb_build_object(
      'acquired', false,
      'ownerName', v_existing.actor_name,
      'reportType', v_existing.report_type,
      'acquiredAt', v_existing.acquired_at,
      'expiresAt', v_existing.expires_at,
      'staleRecovered', false
    );
  end if;

  insert into public.report_generation_locks (
    lock_key,
    lock_token,
    staff_profile_id,
    actor_name,
    report_type,
    report_scope,
    acquired_at,
    expires_at
  ) values (
    'analytics-heavy-report',
    v_token,
    p_staff_profile_id,
    nullif(trim(p_actor_name), ''),
    trim(p_report_type),
    p_report_scope,
    v_now,
    v_now + make_interval(secs => least(greatest(p_timeout_seconds, 60), 900))
  );

  return jsonb_build_object(
    'acquired', true,
    'token', v_token,
    'ownerName', nullif(trim(p_actor_name), ''),
    'reportType', trim(p_report_type),
    'acquiredAt', v_now,
    'expiresAt', v_now + make_interval(secs => least(greatest(p_timeout_seconds, 60), 900)),
    'staleRecovered', v_stale_recovered
  );
end;
$$;

create or replace function public.release_report_generation_lock(
  p_staff_profile_id uuid,
  p_lock_token uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted integer;
begin
  delete from public.report_generation_locks
   where lock_key = 'analytics-heavy-report'
     and staff_profile_id = p_staff_profile_id
     and lock_token = p_lock_token;

  get diagnostics v_deleted = row_count;
  return v_deleted = 1;
end;
$$;

revoke all on function public.acquire_report_generation_lock(uuid, text, text, jsonb, integer)
  from public, anon, authenticated;
grant execute on function public.acquire_report_generation_lock(uuid, text, text, jsonb, integer)
  to service_role;

revoke all on function public.release_report_generation_lock(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.release_report_generation_lock(uuid, uuid)
  to service_role;
