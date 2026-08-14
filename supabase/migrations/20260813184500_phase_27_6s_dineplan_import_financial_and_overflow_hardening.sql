-- Phase 27.6S: keep Dineplan legacy imports on confirmed entitlement + manual floor assignment.
-- This additive migration hardens the import RPC so stale/manual payloads cannot
-- recreate operational overflow tables during Dineplan import execution.

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
  v_booking_id uuid;
  v_is_dineplan boolean;
  v_is_unallocated boolean;
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

        if v_is_dineplan and lower(coalesce(v_values ->> 'proposed_overflow_table', '')) = 'yes' then
          raise exception 'Automatic Dineplan overflow table creation is disabled. Booking % requires floor assignment.', v_reference;
        end if;

        if not v_is_unallocated then
          v_table_id := nullif(v_values ->> 'resolved_table_id', '')::uuid;

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
