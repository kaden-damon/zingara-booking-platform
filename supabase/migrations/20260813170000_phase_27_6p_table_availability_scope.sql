do $$
begin
  if not exists (
    select 1
      from pg_type
     where typname = 'table_availability_scope'
  ) then
    create type public.table_availability_scope as enum (
      'public',
      'operational'
    );
  end if;
end
$$;

alter table public.show_tables
  add column if not exists availability_scope public.table_availability_scope not null default 'public';

create index if not exists show_tables_public_availability_idx
  on public.show_tables (show_id, section, status, availability_scope)
  where booking_id is null;

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
  v_table_id uuid;
  v_overflow_table_id uuid;
  v_booking_id uuid;
  v_is_dineplan boolean;
  v_is_unallocated boolean;
  v_overflow_table_code text;
  v_overflow_capacity integer;
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
        'payments', coalesce(jsonb_agg(distinct to_jsonb(p)) filter (where p.id is not null), '[]'::jsonb),
        'show_tables', coalesce(jsonb_agg(distinct to_jsonb(st)) filter (where st.id is not null), '[]'::jsonb)
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
    left join public.show_tables st
      on st.booking_id = b.id
      or (
        st.show_id::text = source.row_json #>> '{values,resolved_show_id}'
        and st.table_code = source.row_json #>> '{values,resolved_table_number}'
      )
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
    v_booking_id := null;
    v_table_id := null;
    v_overflow_table_id := null;
    v_is_dineplan := lower(coalesce(v_values ->> 'source_format', '')) = 'dineplan legacy export';
    v_is_unallocated := lower(coalesce(v_values ->> 'floor_assignment_required', '')) = 'yes';

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

        if not v_is_unallocated then
          v_table_id := nullif(v_values ->> 'resolved_table_id', '')::uuid;
          v_overflow_table_code := nullif(trim(v_values ->> 'resolved_table_number'), '');
          v_overflow_capacity := greatest(coalesce(nullif(v_values ->> 'proposed_overflow_capacity', '')::integer, nullif(v_values ->> 'number_of_guests', '')::integer, 1), 1);

          if v_is_dineplan and lower(coalesce(v_values ->> 'proposed_overflow_table', '')) = 'yes' then
            if v_overflow_table_code is null then
              raise exception 'Overflow table code is required for booking %.', v_reference;
            end if;

            insert into public.show_tables (
              show_id,
              table_code,
              section,
              capacity,
              status,
              is_override,
              override_notes,
              availability_scope
            )
            values (
              v_show_id,
              v_overflow_table_code,
              coalesce(nullif(trim(v_values ->> 'resolved_zone_id'), ''), nullif(trim(v_values ->> 'seating_zone'), ''), 'Unassigned'),
              v_overflow_capacity,
              'available',
              true,
              'Created by Dineplan legacy import overflow for ' || v_reference,
              'operational'
            )
            on conflict (show_id, table_code) do update
              set capacity = excluded.capacity,
                  section = excluded.section,
                  is_override = true,
                  override_notes = excluded.override_notes,
                  availability_scope = 'operational',
                  updated_at = now()
              where public.show_tables.booking_id is null
                 or public.show_tables.booking_id = v_existing_booking_id
            returning id into v_overflow_table_id;

            if v_overflow_table_id is null then
              raise exception 'Overflow table % could not be claimed for booking %.', v_overflow_table_code, v_reference;
            end if;

            v_table_id := v_overflow_table_id;
          end if;

          if v_table_id is null then
            raise exception 'Resolved table is required for booking %.', v_reference;
          end if;

          perform 1
            from public.show_tables
           where id = v_table_id
             and show_id = v_show_id
             and booking_id is null
             and status = 'available'
           for update;

          if not found then
            raise exception 'Resolved table is no longer available for booking %.', v_reference;
          end if;
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
          v_table_id,
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
        )
        returning id into v_booking_id;

        if v_table_id is not null then
          update public.show_tables
             set booking_id = v_booking_id,
                 status = 'booked',
                 updated_at = now()
           where id = v_table_id
             and booking_id is null
             and status = 'available';

          if not found then
            raise exception 'Table claim failed after booking insert for %.', v_reference;
          end if;
        end if;

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
    jsonb_build_object(
      'created', v_created,
      'updated', v_updated,
      'skipped', v_skipped,
      'failed', v_failed
    ),
    'success'
  );

  return jsonb_build_object(
    'importId', v_import_id,
    'restorePointId', v_restore_point_id,
    'dataset', p_dataset,
    'created', v_created,
    'updated', v_updated,
    'skipped', v_skipped,
    'failed', v_failed,
    'validRows', v_valid_rows,
    'totalRows', jsonb_array_length(p_rows),
    'durationMs', greatest(0, floor(extract(epoch from (v_completed_at - v_started_at)) * 1000)::integer),
    'completedAt', v_completed_at,
    'resultLog', v_result_log
  );
exception
  when others then
    raise;
end;
$$;

grant execute on function public.execute_data_portability_import(text, text, jsonb, text, uuid, timestamptz) to service_role;


-- Keep public booking claims isolated to public-saleable inventory after the
-- availability_scope column exists. Operational overflow rows must never be
-- claimable by public checkout, even if a table code is known.
create or replace function public.reserve_public_booking_table(
  p_show_id uuid,
  p_booking_payload jsonb,
  p_payment_payload jsonb,
  p_table_claims jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking_id uuid;
  v_claim jsonb;
  v_claimed_table_ids uuid[] := '{}';
  v_claim_count integer := 0;
  v_conflicting_table public.show_tables%rowtype;
  v_existing_booking public.bookings%rowtype;
  v_payment_id uuid;
  v_primary_table public.show_tables%rowtype;
  v_promo public.promo_codes%rowtype;
  v_promo_code_id uuid;
  v_promo_redemption_count integer := 0;
  v_table public.show_tables%rowtype;
  v_table_code text;
begin
  if p_show_id is null then
    raise exception 'show_id is required';
  end if;

  if coalesce(jsonb_array_length(p_table_claims), 0) = 0 then
    raise exception 'at least one table claim is required';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_booking_payload ->> 'booking_reference'));

  select *
    into v_existing_booking
    from public.bookings
   where booking_reference = p_booking_payload ->> 'booking_reference'
   limit 1;

  if v_existing_booking.id is not null then
    select id
      into v_payment_id
      from public.payments
     where booking_id = v_existing_booking.id
     limit 1;

    return jsonb_build_object(
      'status', 'already_exists',
      'booking_id', v_existing_booking.id,
      'payment_id', v_payment_id,
      'table_id', v_existing_booking.table_id
    );
  end if;

  v_promo_code_id := nullif(p_booking_payload ->> 'promo_code_id', '')::uuid;

  if v_promo_code_id is not null then
    select *
      into v_promo
      from public.promo_codes
     where id = v_promo_code_id
     for update;

    if v_promo.id is null or not v_promo.active then
      raise exception 'promo code is no longer active';
    end if;

    if v_promo.valid_from is not null and v_promo.valid_from > now() then
      raise exception 'promo code is not active yet';
    end if;

    if v_promo.valid_until is not null and v_promo.valid_until < now() then
      raise exception 'promo code has expired';
    end if;

    if v_promo.location is not null and v_promo.location <> nullif(p_booking_payload ->> 'promo_location', '') then
      raise exception 'promo code is not available for this location';
    end if;

    if v_promo.show_id is not null and v_promo.show_id <> p_show_id then
      raise exception 'promo code is not available for this show';
    end if;

    select count(*)::integer
      into v_promo_redemption_count
      from public.promo_redemptions
     where promo_code_id = v_promo_code_id;

    if v_promo.usage_limit is not null and v_promo_redemption_count >= v_promo.usage_limit then
      raise exception 'promo code usage limit has been reached';
    end if;
  end if;

  for v_claim in
    select value
      from jsonb_array_elements(p_table_claims)
  loop
    v_table_code := nullif(trim(v_claim ->> 'table_code'), '');

    if v_table_code is null then
      raise exception 'table_code is required for every claim';
    end if;

    insert into public.show_tables (
      show_id,
      table_code,
      section,
      capacity,
      status,
      is_override,
      override_notes,
      availability_scope
    )
    values (
      p_show_id,
      v_table_code,
      coalesce(nullif(trim(v_claim ->> 'section'), ''), p_booking_payload ->> 'section', 'Unassigned'),
      greatest(coalesce((v_claim ->> 'capacity')::integer, (p_booking_payload ->> 'guest_count')::integer, 1), 1),
      'available',
      true,
      'Created by public booking reservation claim',
      'public'
    )
    on conflict (show_id, table_code) do nothing;
  end loop;

  for v_table in
    select st.*
      from public.show_tables st
      join jsonb_array_elements(p_table_claims) claim
        on st.table_code = claim.value ->> 'table_code'
     where st.show_id = p_show_id
       and coalesce(st.availability_scope, 'public') = 'public'
     order by st.table_code
     for update of st
  loop
    v_claim_count := v_claim_count + 1;

    if v_table.booking_id is not null or v_table.status <> 'available' then
      v_conflicting_table := v_table;
    end if;

    if v_primary_table.id is null then
      v_primary_table := v_table;
    end if;

    v_claimed_table_ids := array_append(v_claimed_table_ids, v_table.id);
  end loop;

  if v_claim_count <> jsonb_array_length(p_table_claims) then
    raise exception 'one or more table claims could not be resolved';
  end if;

  if v_conflicting_table.id is not null then
    return jsonb_build_object(
      'status', 'conflict',
      'table_id', v_conflicting_table.id,
      'table_code', v_conflicting_table.table_code
    );
  end if;

  insert into public.bookings (
    addons_total,
    amount_paid,
    balance_outstanding,
    booking_reference,
    booking_source,
    booking_status,
    company_name,
    customer_id,
    dietary_requirements,
    discount_amount,
    guest_count,
    notes,
    payment_status,
    section,
    service_fee,
    show_id,
    subtotal_amount,
    table_id,
    total_amount
  )
  values (
    coalesce((p_booking_payload ->> 'addons_total')::numeric, 0),
    coalesce((p_booking_payload ->> 'amount_paid')::numeric, 0),
    coalesce((p_booking_payload ->> 'balance_outstanding')::numeric, 0),
    p_booking_payload ->> 'booking_reference',
    coalesce(p_booking_payload ->> 'booking_source', 'online'),
    coalesce(p_booking_payload ->> 'booking_status', 'pending_payment')::public.booking_status,
    nullif(p_booking_payload ->> 'company_name', ''),
    (p_booking_payload ->> 'customer_id')::uuid,
    nullif(p_booking_payload ->> 'dietary_requirements', ''),
    coalesce((p_booking_payload ->> 'discount_amount')::numeric, 0),
    greatest((p_booking_payload ->> 'guest_count')::integer, 1),
    p_booking_payload ->> 'notes',
    coalesce(p_booking_payload ->> 'payment_status', 'pending_payment')::public.payment_status,
    nullif(p_booking_payload ->> 'section', ''),
    coalesce((p_booking_payload ->> 'service_fee')::numeric, 0),
    p_show_id,
    coalesce((p_booking_payload ->> 'subtotal_amount')::numeric, 0),
    v_primary_table.id,
    coalesce((p_booking_payload ->> 'total_amount')::numeric, 0)
  )
  returning id into v_booking_id;

  if v_promo_code_id is not null then
    insert into public.promo_redemptions (
      promo_code_id,
      booking_id,
      booking_reference,
      customer_id,
      show_id,
      discount_amount,
      subtotal_amount,
      location
    )
    values (
      v_promo_code_id,
      v_booking_id,
      p_booking_payload ->> 'booking_reference',
      (p_booking_payload ->> 'customer_id')::uuid,
      p_show_id,
      coalesce((p_booking_payload ->> 'discount_amount')::numeric, 0),
      coalesce((p_booking_payload ->> 'subtotal_amount')::numeric, 0),
      nullif(p_booking_payload ->> 'promo_location', '')
    );
  end if;

  update public.show_tables
     set booking_id = v_booking_id,
         status = 'booked',
         updated_at = now()
   where id = any(v_claimed_table_ids)
     and booking_id is null
     and status = 'available';

  if not found then
    raise exception 'table claim failed after booking insert';
  end if;

  insert into public.payments (
    amount,
    booking_id,
    method,
    notes,
    payment_status,
    payment_type,
    processed_at,
    reference
  )
  values (
    coalesce((p_payment_payload ->> 'amount')::numeric, 0),
    v_booking_id,
    nullif(p_payment_payload ->> 'method', ''),
    nullif(p_payment_payload ->> 'notes', ''),
    coalesce(p_payment_payload ->> 'payment_status', 'pending_payment')::public.payment_status,
    coalesce(p_payment_payload ->> 'payment_type', 'deposit')::public.payment_type,
    coalesce((p_payment_payload ->> 'processed_at')::timestamptz, now()),
    nullif(p_payment_payload ->> 'reference', '')
  )
  returning id into v_payment_id;

  return jsonb_build_object(
    'status', 'success',
    'booking_id', v_booking_id,
    'payment_id', v_payment_id,
    'table_id', v_primary_table.id,
    'claimed_table_ids', to_jsonb(v_claimed_table_ids)
  );
end;
$$;


revoke all on function public.reserve_public_booking_table(uuid, jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.reserve_public_booking_table(uuid, jsonb, jsonb, jsonb) to service_role;


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
  v_table jsonb;
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

        delete from public.show_tables st
        where st.availability_scope = 'operational'
          and st.is_override = true
          and st.override_notes = 'Created by Dineplan legacy import overflow for ' || (v_log ->> 'reference')
          and not exists (
            select 1
              from public.bookings b
             where b.table_id = st.id
                or b.id = st.booking_id
          );

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

  for v_table in select * from jsonb_array_elements(coalesce(v_restore.metadata -> 'show_tables', '[]'::jsonb))
  loop
    insert into public.show_tables (
      id,
      show_id,
      venue_table_id,
      table_code,
      section,
      capacity,
      status,
      booking_id,
      merged_parent_id,
      merged_from,
      override_notes,
      is_override,
      availability_scope,
      created_at,
      updated_at
    )
    values (
      (v_table ->> 'id')::uuid,
      (v_table ->> 'show_id')::uuid,
      nullif(v_table ->> 'venue_table_id', '')::uuid,
      v_table ->> 'table_code',
      v_table ->> 'section',
      (v_table ->> 'capacity')::integer,
      (v_table ->> 'status')::table_status,
      nullif(v_table ->> 'booking_id', '')::uuid,
      nullif(v_table ->> 'merged_parent_id', '')::uuid,
      coalesce(
        array(select jsonb_array_elements_text(coalesce(v_table -> 'merged_from', '[]'::jsonb))::uuid),
        '{}'::uuid[]
      ),
      v_table ->> 'override_notes',
      coalesce((v_table ->> 'is_override')::boolean, false),
      coalesce(nullif(v_table ->> 'availability_scope', '')::table_availability_scope, 'public'),
      coalesce((v_table ->> 'created_at')::timestamptz, now()),
      coalesce((v_table ->> 'updated_at')::timestamptz, now())
    )
    on conflict (show_id, table_code) do update
      set venue_table_id = excluded.venue_table_id,
          section = excluded.section,
          capacity = excluded.capacity,
          status = excluded.status,
          booking_id = excluded.booking_id,
          merged_parent_id = excluded.merged_parent_id,
          merged_from = excluded.merged_from,
          override_notes = excluded.override_notes,
          is_override = excluded.is_override,
          availability_scope = excluded.availability_scope,
          updated_at = excluded.updated_at;
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


revoke all on function public.restore_data_portability_import(uuid, uuid) from public, anon, authenticated;
grant execute on function public.restore_data_portability_import(uuid, uuid) to service_role;
