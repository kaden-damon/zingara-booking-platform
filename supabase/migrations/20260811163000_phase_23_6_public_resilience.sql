create extension if not exists pgcrypto;

create table if not exists public.platform_rate_limits (
  id uuid primary key default gen_random_uuid(),
  scope text not null,
  key_hash text not null,
  window_start timestamptz not null,
  window_seconds integer not null,
  request_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (scope, key_hash, window_start)
);

create index if not exists platform_rate_limits_scope_window_idx
  on public.platform_rate_limits (scope, window_start desc);

create index if not exists platform_rate_limits_updated_at_idx
  on public.platform_rate_limits (updated_at);

alter table public.platform_rate_limits enable row level security;
revoke all on public.platform_rate_limits from anon, authenticated;
grant select, insert, update, delete on public.platform_rate_limits to service_role;

create or replace function public.check_platform_rate_limit(
  p_scope text,
  p_identity text,
  p_limit integer,
  p_window_seconds integer
)
returns table (
  allowed boolean,
  retry_after_seconds integer,
  current_count integer
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_now timestamptz := now();
  v_window_start timestamptz;
  v_key_hash text;
  v_count integer;
  v_retry_after integer;
begin
  if p_scope is null or length(trim(p_scope)) = 0 then
    raise exception 'Rate limit scope is required';
  end if;

  if p_identity is null or length(trim(p_identity)) = 0 then
    raise exception 'Rate limit identity is required';
  end if;

  if p_limit is null or p_limit < 1 then
    raise exception 'Rate limit must be positive';
  end if;

  if p_window_seconds is null or p_window_seconds < 1 then
    raise exception 'Rate limit window must be positive';
  end if;

  v_window_start :=
    to_timestamp(
      floor(extract(epoch from v_now) / p_window_seconds) * p_window_seconds
    );
  v_key_hash := encode(digest(convert_to(p_identity, 'UTF8'), 'sha256'), 'hex');

  insert into public.platform_rate_limits (
    scope,
    key_hash,
    window_start,
    window_seconds,
    request_count,
    updated_at
  )
  values (
    left(trim(p_scope), 80),
    v_key_hash,
    v_window_start,
    p_window_seconds,
    1,
    v_now
  )
  on conflict (scope, key_hash, window_start)
  do update set
    request_count = public.platform_rate_limits.request_count + 1,
    updated_at = v_now
  returning request_count into v_count;

  v_retry_after :=
    greatest(
      1,
      ceil(
        extract(
          epoch from (v_window_start + make_interval(secs => p_window_seconds) - v_now)
        )
      )::integer
    );

  return query
    select
      v_count <= p_limit,
      case when v_count <= p_limit then 0 else v_retry_after end,
      v_count;
end;
$$;

grant execute on function public.check_platform_rate_limit(text, text, integer, integer)
  to service_role;
