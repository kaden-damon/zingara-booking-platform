begin;

create table if not exists public.data_portability_import_runs (
  id uuid primary key default gen_random_uuid(),
  dataset text not null check (dataset in ('bookings', 'customers')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  initiated_by uuid references public.staff_profiles(id) on delete set null,
  original_file_name text not null,
  total_rows integer not null default 0,
  valid_rows integer not null default 0,
  created_count integer not null default 0,
  updated_count integer not null default 0,
  skipped_count integer not null default 0,
  failed_count integer not null default 0,
  final_status text not null default 'pending' check (final_status in ('pending', 'success', 'failed', 'rolled_back')),
  duration_ms integer not null default 0,
  restore_point_id uuid,
  preview_hash text not null,
  error_summary text,
  result_log jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.data_portability_restore_points (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null references public.data_portability_import_runs(id) on delete cascade,
  dataset text not null check (dataset in ('bookings', 'customers')),
  created_by uuid references public.staff_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  affected_bookings jsonb not null default '[]'::jsonb,
  affected_customers jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  restored_at timestamptz,
  restored_by uuid references public.staff_profiles(id) on delete set null,
  restore_count integer not null default 0
);

alter table public.data_portability_import_runs
  drop constraint if exists data_portability_import_runs_restore_point_id_fkey;

alter table public.data_portability_import_runs
  add constraint data_portability_import_runs_restore_point_id_fkey
  foreign key (restore_point_id)
  references public.data_portability_restore_points(id)
  on delete set null;

create table if not exists public.data_portability_audit_events (
  id uuid primary key default gen_random_uuid(),
  import_id uuid references public.data_portability_import_runs(id) on delete cascade,
  restore_point_id uuid references public.data_portability_restore_points(id) on delete set null,
  staff_profile_id uuid references public.staff_profiles(id) on delete set null,
  event_type text not null check (event_type in ('import_started', 'import_completed', 'import_failed', 'import_rolled_back', 'restore_executed')),
  dataset text not null check (dataset in ('bookings', 'customers')),
  counts jsonb not null default '{}'::jsonb,
  outcome text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists data_portability_import_runs_dataset_idx on public.data_portability_import_runs(dataset);
create index if not exists data_portability_import_runs_started_at_idx on public.data_portability_import_runs(started_at desc);
create index if not exists data_portability_import_runs_initiated_by_idx on public.data_portability_import_runs(initiated_by);
create index if not exists data_portability_restore_points_import_id_idx on public.data_portability_restore_points(import_id);
create index if not exists data_portability_audit_events_import_id_idx on public.data_portability_audit_events(import_id);
create index if not exists data_portability_audit_events_created_at_idx on public.data_portability_audit_events(created_at desc);

revoke all on table public.data_portability_import_runs from anon, authenticated;
revoke all on table public.data_portability_restore_points from anon, authenticated;
revoke all on table public.data_portability_audit_events from anon, authenticated;

grant select, insert, update, delete on table public.data_portability_import_runs to service_role;
grant select, insert, update, delete on table public.data_portability_restore_points to service_role;
grant select, insert, update, delete on table public.data_portability_audit_events to service_role;

alter table public.data_portability_import_runs enable row level security;
alter table public.data_portability_restore_points enable row level security;
alter table public.data_portability_audit_events enable row level security;

create or replace function public.execute_data_portability_import(
  p_dataset text,
  p_file_name text,
  p_rows jsonb,
  p_preview_hash text,
  p_staff_profile_id uuid,
  p_started_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_import_id uuid;
  v_restore_point_id uuid;
  v_started_at timestamptz := coalesce(p_started_at, now());
  v_completed_at timestamptz;
  v_row jsonb;
  v_values jsonb;
  v_action text;
  v_valid boolean;
  v_created integer := 0;
  v_updated integer := 0;
  v_skipped integer := 0;
  v_failed integer := 0;
  v_valid_rows integer := 0;
  v_reference text;
  v_customer_id uuid;
  v_existing_booking_id uuid;
  v_show_id uuid;
  v_existing_customer_id uuid;
  v_email text;
  v_mobile text;
  v_name text;
  v_first_name text;
  v_customer_created boolean := false;
  v_surname text;
  v_result_log jsonb := '[]'::jsonb;
begin
  if p_dataset not in ('bookings', 'customers') then
    raise exception 'Unsupported import dataset: %', p_dataset;
  end if;

  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'Import rows must be a JSON array.';
  end if;

  insert into public.data_portability_import_runs (
    dataset,
    started_at,
    initiated_by,
    original_file_name,
    total_rows,
    preview_hash,
    final_status
  )
  values (
    p_dataset,
    v_started_at,
    p_staff_profile_id,
    coalesce(nullif(p_file_name, ''), 'import-file'),
    jsonb_array_length(p_rows),
    p_preview_hash,
    'pending'
  )
  returning id into v_import_id;

  insert into public.data_portability_audit_events (
    import_id,
    staff_profile_id,
    event_type,
    dataset,
    counts,
    outcome
  )
  values (
    v_import_id,
    p_staff_profile_id,
    'import_started',
    p_dataset,
    jsonb_build_object('rows', jsonb_array_length(p_rows)),
    'pending'
  );

  if p_dataset = 'bookings' then
    insert into public.data_portability_restore_points (
      import_id,
      dataset,
      created_by,
      affected_bookings,
      affected_customers,
      metadata
    )
    select
      v_import_id,
      p_dataset,
      p_staff_profile_id,
      coalesce(jsonb_agg(distinct to_jsonb(b)) filter (where b.id is not null), '[]'::jsonb),
      coalesce(jsonb_agg(distinct to_jsonb(c)) filter (where c.id is not null), '[]'::jsonb),
      jsonb_build_object(
        'tickets', coalesce(jsonb_agg(distinct to_jsonb(t)) filter (where t.id is not null), '[]'::jsonb),
        'payments', coalesce(jsonb_agg(distinct to_jsonb(p)) filter (where p.id is not null), '[]'::jsonb)
      )
    from jsonb_array_elements(p_rows) as source(row_json)
    left join public.bookings b
      on b.booking_reference = source.row_json #>> '{values,booking_reference}'
    left join public.customers c
      on c.id = b.customer_id
      or lower(c.email) = lower(source.row_json #>> '{values,customer_email}')
    left join public.tickets t
      on t.booking_id = b.id
    left join public.payments p
      on p.booking_id = b.id
    returning id into v_restore_point_id;
  else
    insert into public.data_portability_restore_points (
      import_id,
      dataset,
      created_by,
      affected_customers,
      metadata
    )
    select
      v_import_id,
      p_dataset,
      p_staff_profile_id,
      coalesce(jsonb_agg(distinct to_jsonb(c)) filter (where c.id is not null), '[]'::jsonb),
      jsonb_build_object('source', 'customers import')
    from jsonb_array_elements(p_rows) as source(row_json)
    left join public.customers c
      on lower(c.email) = lower(source.row_json #>> '{values,email}')
    returning id into v_restore_point_id;
  end if;

  if v_restore_point_id is null then
    raise exception 'Restore point could not be created.';
  end if;

  update public.data_portability_import_runs
  set restore_point_id = v_restore_point_id
  where id = v_import_id;

  for v_row in select * from jsonb_array_elements(p_rows)
  loop
    v_values := v_row -> 'values';
    v_action := coalesce(v_row ->> 'action', 'Skip');
    v_valid := coalesce((v_row ->> 'valid')::boolean, false);

    if not v_valid or v_action = 'Skip' then
      v_skipped := v_skipped + 1;
      v_result_log := v_result_log || jsonb_build_array(jsonb_build_object(
        'row', v_row ->> 'rowNumber',
        'action', 'Skip',
        'status', 'Skipped',
        'message', 'Skipped by validation or preview rule.',
        'reference', coalesce(v_values ->> 'booking_reference', v_values ->> 'email', v_values ->> 'phone', ''),
        'customer', coalesce(v_values ->> 'customer_name', ''),
        'warnings', coalesce(v_row -> 'warnings', '[]'::jsonb),
        'errors', coalesce(v_row -> 'errors', '[]'::jsonb)
      ));
      continue;
    end if;

    v_valid_rows := v_valid_rows + 1;
    v_customer_id := null;
    v_customer_created := false;

    if p_dataset = 'bookings' then
      v_reference := nullif(trim(v_values ->> 'booking_reference'), '');

      if v_reference is null then
        raise exception 'Booking reference is required.';
      end if;

      select id into v_show_id
      from public.shows
      where id::text = nullif(v_values ->> 'resolved_show_id', '')
      limit 1;

      if v_show_id is null then
        raise exception 'Resolved show is required for booking %.', v_reference;
      end if;

      select id into v_existing_booking_id
      from public.bookings
      where booking_reference = v_reference
      limit 1;

      v_email := lower(nullif(trim(coalesce(v_values ->> 'customer_email', '')), ''));
      v_mobile := nullif(trim(coalesce(v_values ->> 'customer_phone', '')), '');
      v_name := nullif(trim(coalesce(v_values ->> 'customer_name', '')), '');
      v_first_name := coalesce(split_part(v_name, ' ', 1), v_name, 'Imported');
      v_surname := nullif(trim(substr(v_name, length(v_first_name) + 2)), '');

      if v_existing_booking_id is not null then
        select customer_id into v_customer_id
        from public.bookings
        where id = v_existing_booking_id;

        update public.customers
        set
          first_name = coalesce(v_first_name, first_name),
          surname = coalesce(v_surname, surname),
          email = coalesce(v_email, email),
          mobile = coalesce(v_mobile, mobile),
          relationship_notes = coalesce(nullif(v_values ->> 'guest_notes', ''), relationship_notes),
          updated_at = now()
        where id = v_customer_id;

        update public.bookings
        set
          guest_count = greatest(coalesce(nullif(v_values ->> 'number_of_guests', '')::integer, guest_count), 1),
          booking_status = coalesce(nullif(v_values ->> 'resolved_booking_status', '')::booking_status, booking_status),
          section = coalesce(nullif(v_values ->> 'seating_zone', ''), section),
          notes = coalesce(nullif(v_values ->> 'serialized_booking', ''), notes),
          updated_at = now()
        where id = v_existing_booking_id;

        v_updated := v_updated + 1;
      else
        if v_action <> 'Create' then
          raise exception 'Booking % does not exist for update.', v_reference;
        end if;

        select id into v_existing_customer_id
        from public.customers
        where v_email is not null and lower(email) = v_email
        limit 1;

        if v_existing_customer_id is null then
          insert into public.customers (
            first_name,
            surname,
            email,
            mobile,
            preferences,
            relationship_notes
          )
          values (
            coalesce(v_first_name, 'Imported'),
            v_surname,
            v_email,
            v_mobile,
            jsonb_build_object('customerKey', coalesce(v_email, regexp_replace(coalesce(v_mobile, ''), '\D', '', 'g'), lower(coalesce(v_name, v_reference)))),
            nullif(v_values ->> 'guest_notes', '')
          )
          returning id into v_customer_id;
          v_customer_created := true;
        else
          v_customer_id := v_existing_customer_id;
        end if;

        insert into public.bookings (
          customer_id,
          show_id,
          table_id,
          booking_reference,
          booking_source,
          guest_count,
          booking_status,
          payment_status,
          section,
          service_fee,
          subtotal_amount,
          discount_amount,
          addons_total,
          total_amount,
          amount_paid,
          balance_outstanding,
          notes,
          created_at,
          updated_at
        )
        values (
          v_customer_id,
          v_show_id,
          nullif(v_values ->> 'resolved_table_id', '')::uuid,
          v_reference,
          coalesce(nullif(v_values ->> 'resolved_booking_source', ''), 'admin'),
          greatest(coalesce(nullif(v_values ->> 'number_of_guests', '')::integer, 1), 1),
          coalesce(nullif(v_values ->> 'resolved_booking_status', '')::booking_status, 'pending_payment'),
          coalesce(nullif(v_values ->> 'resolved_payment_status', '')::payment_status, 'pending_payment'),
          nullif(v_values ->> 'seating_zone', ''),
          0,
          coalesce(nullif(v_values ->> 'booking_total', '')::numeric, 0),
          0,
          0,
          coalesce(nullif(v_values ->> 'booking_total', '')::numeric, 0),
          coalesce(nullif(v_values ->> 'amount_paid', '')::numeric, 0),
          coalesce(nullif(v_values ->> 'balance_due', '')::numeric, 0),
          nullif(v_values ->> 'serialized_booking', ''),
          coalesce(nullif(v_values ->> 'booking_date', '')::timestamptz, now()),
          now()
        );

        v_created := v_created + 1;
      end if;
    else
      v_email := lower(nullif(trim(coalesce(v_values ->> 'email', '')), ''));
      v_mobile := nullif(trim(coalesce(v_values ->> 'phone', '')), '');
      v_name := nullif(trim(coalesce(v_values ->> 'customer_name', '')), '');
      v_first_name := coalesce(split_part(v_name, ' ', 1), v_name, 'Imported');
      v_surname := nullif(trim(substr(v_name, length(v_first_name) + 2)), '');

      select id into v_existing_customer_id
      from public.customers
      where v_email is not null and lower(email) = v_email
      limit 1;

      if v_existing_customer_id is not null then
        v_customer_id := v_existing_customer_id;

        update public.customers
        set
          first_name = coalesce(v_first_name, first_name),
          surname = coalesce(v_surname, surname),
          mobile = coalesce(v_mobile, mobile),
          relationship_notes = coalesce(nullif(v_values ->> 'guest_notes', ''), relationship_notes),
          preferences = coalesce(preferences, '{}'::jsonb) || jsonb_build_object(
            'marketingPreference',
            coalesce(nullif(v_values ->> 'marketing_preference', ''), preferences ->> 'marketingPreference')
          ),
          updated_at = now()
        where id = v_existing_customer_id;

        v_updated := v_updated + 1;
      else
        insert into public.customers (
          first_name,
          surname,
          email,
          mobile,
          preferences,
          relationship_notes
        )
        values (
          coalesce(v_first_name, 'Imported'),
          v_surname,
          v_email,
          v_mobile,
          jsonb_build_object(
            'customerKey',
            coalesce(v_email, regexp_replace(coalesce(v_mobile, ''), '\D', '', 'g'), lower(coalesce(v_name, 'imported-customer'))),
            'marketingPreference',
            nullif(v_values ->> 'marketing_preference', '')
          ),
          nullif(v_values ->> 'guest_notes', '')
        )
        returning id into v_customer_id;
        v_customer_created := true;

        v_created := v_created + 1;
      end if;
    end if;

    v_result_log := v_result_log || jsonb_build_array(jsonb_build_object(
      'row', v_row ->> 'rowNumber',
      'action', v_action,
      'status', 'Success',
      'message', v_action || ' completed.',
      'reference', coalesce(v_reference, v_email, v_mobile, ''),
      'customer', coalesce(v_name, ''),
      'customerId', v_customer_id,
      'customerCreated', v_customer_created,
      'warnings', coalesce(v_row -> 'warnings', '[]'::jsonb),
      'errors', '[]'::jsonb
    ));
  end loop;

  v_completed_at := now();

  update public.data_portability_import_runs
  set
    completed_at = v_completed_at,
    valid_rows = v_valid_rows,
    created_count = v_created,
    updated_count = v_updated,
    skipped_count = v_skipped,
    failed_count = v_failed,
    final_status = 'success',
    duration_ms = greatest(0, floor(extract(epoch from (v_completed_at - v_started_at)) * 1000)::integer),
    result_log = v_result_log
  where id = v_import_id;

  insert into public.data_portability_audit_events (
    import_id,
    restore_point_id,
    staff_profile_id,
    event_type,
    dataset,
    counts,
    outcome
  )
  values (
    v_import_id,
    v_restore_point_id,
    p_staff_profile_id,
    'import_completed',
    p_dataset,
    jsonb_build_object('created', v_created, 'updated', v_updated, 'skipped', v_skipped, 'failed', v_failed),
    'success'
  );

  return jsonb_build_object(
    'id', v_import_id,
    'restorePointId', v_restore_point_id,
    'dataset', p_dataset,
    'startedAt', v_started_at,
    'completedAt', v_completed_at,
    'records', jsonb_array_length(p_rows),
    'validRows', v_valid_rows,
    'created', v_created,
    'updated', v_updated,
    'skipped', v_skipped,
    'failed', v_failed,
    'status', 'success',
    'durationMs', greatest(0, floor(extract(epoch from (v_completed_at - v_started_at)) * 1000)::integer),
    'resultLog', v_result_log
  );
exception
  when others then
    raise;
end;
$$;

create or replace function public.restore_data_portability_import(
  p_import_id uuid,
  p_staff_profile_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_restore public.data_portability_restore_points%rowtype;
  v_booking jsonb;
  v_customer jsonb;
  v_run public.data_portability_import_runs%rowtype;
  v_log jsonb;
  v_restored_bookings integer := 0;
  v_restored_customers integer := 0;
begin
  select *
  into v_run
  from public.data_portability_import_runs
  where id = p_import_id
  for update;

  if v_run.id is null then
    raise exception 'Import run % could not be found.', p_import_id;
  end if;

  select *
  into v_restore
  from public.data_portability_restore_points
  where import_id = p_import_id
  for update;

  if v_restore.id is null then
    raise exception 'Restore point not found for import %. ', p_import_id;
  end if;

  if v_restore.restore_count > 0 then
    raise exception 'This import has already been restored once.';
  end if;

  if v_run.dataset = 'bookings' then
    for v_log in select * from jsonb_array_elements(v_run.result_log)
    loop
      if v_log ->> 'action' = 'Create' and v_log ->> 'status' = 'Success' then
        delete from public.bookings
        where booking_reference = v_log ->> 'reference';

        if coalesce((v_log ->> 'customerCreated')::boolean, false)
          and nullif(v_log ->> 'customerId', '') is not null then
          delete from public.customers c
          where c.id = (v_log ->> 'customerId')::uuid
            and not exists (
              select 1
              from public.bookings b
              where b.customer_id = c.id
            );
        end if;
      end if;
    end loop;
  else
    for v_log in select * from jsonb_array_elements(v_run.result_log)
    loop
      if v_log ->> 'action' = 'Create' and v_log ->> 'status' = 'Success' then
        delete from public.customers c
        where lower(c.email) = lower(v_log ->> 'reference')
          and not exists (
            select 1
            from public.bookings b
            where b.customer_id = c.id
          );
      end if;
    end loop;
  end if;

  for v_customer in select * from jsonb_array_elements(v_restore.affected_customers)
  loop
    update public.customers
    set
      first_name = v_customer ->> 'first_name',
      surname = v_customer ->> 'surname',
      email = v_customer ->> 'email',
      mobile = v_customer ->> 'mobile',
      vip_status = v_customer ->> 'vip_status',
      preferences = coalesce(v_customer -> 'preferences', '{}'::jsonb),
      relationship_notes = v_customer ->> 'relationship_notes',
      dietary_requirements = v_customer ->> 'dietary_requirements',
      updated_at = coalesce((v_customer ->> 'updated_at')::timestamptz, now())
    where id = (v_customer ->> 'id')::uuid;
    v_restored_customers := v_restored_customers + 1;
  end loop;

  for v_booking in select * from jsonb_array_elements(v_restore.affected_bookings)
  loop
    update public.bookings
    set
      customer_id = (v_booking ->> 'customer_id')::uuid,
      show_id = (v_booking ->> 'show_id')::uuid,
      table_id = nullif(v_booking ->> 'table_id', '')::uuid,
      corporate_request_id = nullif(v_booking ->> 'corporate_request_id', '')::uuid,
      booking_reference = v_booking ->> 'booking_reference',
      booking_source = v_booking ->> 'booking_source',
      company_name = v_booking ->> 'company_name',
      guest_count = (v_booking ->> 'guest_count')::integer,
      booking_status = (v_booking ->> 'booking_status')::booking_status,
      payment_status = (v_booking ->> 'payment_status')::payment_status,
      section = v_booking ->> 'section',
      service_fee = (v_booking ->> 'service_fee')::numeric,
      subtotal_amount = (v_booking ->> 'subtotal_amount')::numeric,
      discount_amount = (v_booking ->> 'discount_amount')::numeric,
      addons_total = (v_booking ->> 'addons_total')::numeric,
      total_amount = (v_booking ->> 'total_amount')::numeric,
      amount_paid = (v_booking ->> 'amount_paid')::numeric,
      balance_outstanding = (v_booking ->> 'balance_outstanding')::numeric,
      notes = v_booking ->> 'notes',
      dietary_requirements = v_booking ->> 'dietary_requirements',
      updated_at = coalesce((v_booking ->> 'updated_at')::timestamptz, now())
    where id = (v_booking ->> 'id')::uuid;
    v_restored_bookings := v_restored_bookings + 1;
  end loop;

  update public.data_portability_restore_points
  set
    restored_at = now(),
    restored_by = p_staff_profile_id,
    restore_count = restore_count + 1
  where id = v_restore.id;

  update public.data_portability_import_runs
  set final_status = 'rolled_back'
  where id = p_import_id;

  insert into public.data_portability_audit_events (
    import_id,
    restore_point_id,
    staff_profile_id,
    event_type,
    dataset,
    counts,
    outcome
  )
  values (
    p_import_id,
    v_restore.id,
    p_staff_profile_id,
    'restore_executed',
    v_restore.dataset,
    jsonb_build_object('bookings', v_restored_bookings, 'customers', v_restored_customers),
    'rolled_back'
  );

  return jsonb_build_object(
    'importId', p_import_id,
    'restorePointId', v_restore.id,
    'bookings', v_restored_bookings,
    'customers', v_restored_customers,
    'status', 'rolled_back'
  );
end;
$$;

revoke all on function public.execute_data_portability_import(text, text, jsonb, text, uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.restore_data_portability_import(uuid, uuid) from public, anon, authenticated;

grant execute on function public.execute_data_portability_import(text, text, jsonb, text, uuid, timestamptz) to service_role;
grant execute on function public.restore_data_portability_import(uuid, uuid) to service_role;

commit;
