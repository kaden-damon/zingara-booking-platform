-- Bind every Dineplan source identity to one booking before the legacy importer
-- can update customer or booking state. Conflicts become operational review
-- actions and leave all business records unchanged.

create table if not exists public.dineplan_import_identity_bindings (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references public.bookings(id) on delete restrict,
  booking_reference_at_binding text not null,
  source_reference text not null unique,
  source_reference_fingerprint text not null unique check (source_reference_fingerprint ~ '^[a-f0-9]{64}$'),
  source_identity_fingerprint text not null check (source_identity_fingerprint ~ '^[a-f0-9]{64}$'),
  customer_id_at_binding uuid not null references public.customers(id) on delete restrict,
  show_id_at_binding uuid not null references public.shows(id) on delete restrict,
  first_bound_by uuid references public.staff_profiles(id) on delete restrict,
  first_bound_at timestamptz not null default now(),
  last_verified_by uuid references public.staff_profiles(id) on delete restrict,
  last_verified_at timestamptz not null default now()
);

alter table public.dineplan_import_identity_bindings enable row level security;
revoke all on public.dineplan_import_identity_bindings from public, anon, authenticated;
grant select, insert, update on public.dineplan_import_identity_bindings to service_role;

comment on table public.dineplan_import_identity_bindings is
  'Private one-to-one Dineplan source-reference and identity-fingerprint bindings that prevent cross-booking import updates.';

-- Seed bindings from the booking reference and the current reviewed identity.
-- Future source rows must agree with both values; disagreement is review-only.
with legacy_identity as (
  select
    booking.*,
    customer.first_name,
    customer.surname,
    upper(regexp_replace(
      coalesce(
        nullif(substring(booking.notes from 'Legacy Dineplan ref: ([A-Za-z0-9]+)'), ''),
        substring(booking.booking_reference from 4)
      ),
      '[^A-Za-z0-9]', '', 'g'
    )) as normalized_source_reference,
    coalesce(
      nullif(
        substring(booking.notes from '^__zingara_booking_meta__:(.*)$')::jsonb #>> '{customer,name}',
        ''
      ),
      trim(concat_ws(' ', customer.first_name, customer.surname))
    ) as source_customer_name
  from public.bookings booking
  join public.customers customer on customer.id = booking.customer_id
  where booking.booking_reference ~ '^DP-[A-Za-z0-9-]+$'
    and (
      booking.booking_origin = 'data_import'
      or booking.notes like '__zingara_booking_meta__:%Legacy Dineplan ref:%'
    )
), safe_legacy_identity as (
  select *
  from legacy_identity
  where normalized_source_reference <> ''
)
insert into public.dineplan_import_identity_bindings (
  booking_id,
  booking_reference_at_binding,
  source_reference,
  source_reference_fingerprint,
  source_identity_fingerprint,
  customer_id_at_binding,
  show_id_at_binding
)
select
  legacy.id,
  legacy.booking_reference,
  legacy.normalized_source_reference,
  encode(digest(
    'dineplan|' || legacy.normalized_source_reference,
    'sha256'
  ), 'hex'),
  encode(digest(
    concat_ws('|',
      'dineplan',
      legacy.normalized_source_reference,
      lower(regexp_replace(legacy.source_customer_name, '[^A-Za-z0-9]', '', 'g')),
      legacy.show_id::text
    ),
    'sha256'
  ), 'hex'),
  legacy.customer_id,
  legacy.show_id
from safe_legacy_identity legacy
on conflict do nothing;

do $$
begin
  if to_regprocedure('public.execute_data_portability_import_unchecked(text,text,jsonb,text,uuid,timestamptz)') is null
     and to_regprocedure('public.execute_data_portability_import(text,text,jsonb,text,uuid,timestamptz)') is not null then
    alter function public.execute_data_portability_import(text, text, jsonb, text, uuid, timestamptz)
      rename to execute_data_portability_import_unchecked;
  end if;
end;
$$;

revoke all on function public.execute_data_portability_import_unchecked(text, text, jsonb, text, uuid, timestamptz)
  from public, anon, authenticated, service_role;

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
  v_conflict record;
  v_created_action_id uuid;
  v_result jsonb;
  v_snapshot_id uuid;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'Import rows must be a JSON array.';
  end if;

  if not exists (
    select 1
      from public.staff_profiles staff
     where staff.id = p_staff_profile_id
       and staff.active
  ) then
    raise exception 'An active staff import actor is required.';
  end if;

  create temporary table if not exists pg_temp.dineplan_identity_conflicts (
    row_number integer,
    booking_id uuid,
    booking_reference text,
    show_id uuid,
    venue text,
    performance_date date,
    performance_time time,
    customer_name text,
    source_reference text,
    incoming_fingerprint text,
    bound_source_reference text,
    bound_fingerprint text,
    reason text
  ) on commit drop;
  truncate pg_temp.dineplan_identity_conflicts;

  if p_dataset = 'bookings' then
    insert into pg_temp.dineplan_identity_conflicts (
      row_number, booking_id, booking_reference, show_id, venue,
      performance_date, performance_time, customer_name, source_reference,
      incoming_fingerprint, bound_source_reference, bound_fingerprint, reason
    )
    with incoming as (
      select
        coalesce(nullif(source.row_data ->> 'rowNumber', '')::integer, source.ordinality::integer) as row_number,
        trim(source.row_data #>> '{values,booking_reference}') as booking_reference,
        upper(regexp_replace(
          coalesce(
            nullif(trim(source.row_data #>> '{values,source_booking_reference}'), ''),
            substring(trim(source.row_data #>> '{values,booking_reference}') from 4)
          ),
          '[^A-Za-z0-9]', '', 'g'
        )) as source_reference,
        trim(coalesce(source.row_data #>> '{values,customer_name}', '')) as customer_name,
        nullif(source.row_data #>> '{values,resolved_show_id}', '')::uuid as show_id,
        lower(coalesce(source.row_data #>> '{values,source_format}', '')) = 'dineplan legacy export' as is_dineplan,
        coalesce((source.row_data ->> 'valid')::boolean, false) as is_valid,
        coalesce(source.row_data ->> 'action', 'Skip') as import_action
      from jsonb_array_elements(p_rows) with ordinality source(row_data, ordinality)
    ), normalized as (
      select incoming.*,
        encode(digest('dineplan|' || incoming.source_reference, 'sha256'), 'hex') as source_reference_fingerprint,
        encode(digest(
          concat_ws('|',
            'dineplan', incoming.source_reference,
            lower(regexp_replace(incoming.customer_name, '[^A-Za-z0-9]', '', 'g')),
            coalesce(incoming.show_id::text, '')
          ),
          'sha256'
        ), 'hex') as source_identity_fingerprint
      from incoming
      where incoming.is_dineplan
        and incoming.is_valid
        and incoming.import_action <> 'Skip'
    )
    select
      normalized.row_number,
      coalesce(existing_booking.id, source_binding.booking_id),
      coalesce(existing_booking.booking_reference, source_booking.booking_reference, normalized.booking_reference),
      coalesce(existing_booking.show_id, source_booking.show_id, normalized.show_id),
      coalesce(existing_show.venue, source_show.venue, 'johannesburg'),
      coalesce(existing_show.date, source_show.date, current_date),
      coalesce(existing_show.time, source_show.time),
      normalized.customer_name,
      normalized.source_reference,
      normalized.source_identity_fingerprint,
      coalesce(booking_binding.source_reference, source_binding.source_reference),
      coalesce(booking_binding.source_identity_fingerprint, source_binding.source_identity_fingerprint),
      case
        when normalized.source_reference = '' then 'The Dineplan source reference is missing.'
        when source_binding.booking_id is not null
             and existing_booking.id is distinct from source_binding.booking_id
          then 'This Dineplan source reference is already bound to another booking.'
        when booking_binding.booking_id is not null
             and booking_binding.source_reference <> normalized.source_reference
          then 'This booking is already bound to a different Dineplan source reference.'
        when booking_binding.booking_id is not null
             and booking_binding.source_reference_fingerprint <> normalized.source_reference_fingerprint
          then 'The Dineplan source-reference fingerprint does not match this booking.'
        when booking_binding.booking_id is not null
             and booking_binding.source_identity_fingerprint <> normalized.source_identity_fingerprint
          then 'The Dineplan customer/show identity does not match the binding for this booking.'
        when existing_booking.id is not null
             and booking_binding.booking_id is null
             and existing_booking.booking_reference <> 'DP-' || normalized.source_reference
          then 'The existing booking reference does not match the Dineplan source reference.'
        else null
      end as reason
    from normalized
    left join public.bookings existing_booking
      on existing_booking.booking_reference = normalized.booking_reference
    left join public.dineplan_import_identity_bindings booking_binding
      on booking_binding.booking_id = existing_booking.id
    left join public.dineplan_import_identity_bindings source_binding
      on source_binding.source_reference = normalized.source_reference
    left join public.bookings source_booking
      on source_booking.id = source_binding.booking_id
    left join public.shows existing_show
      on existing_show.id = existing_booking.show_id
    left join public.shows source_show
      on source_show.id = source_booking.show_id
    where normalized.source_reference = ''
       or (source_binding.booking_id is not null and existing_booking.id is distinct from source_binding.booking_id)
       or (booking_binding.booking_id is not null and booking_binding.source_reference <> normalized.source_reference)
       or (booking_binding.booking_id is not null and booking_binding.source_reference_fingerprint <> normalized.source_reference_fingerprint)
       or (booking_binding.booking_id is not null and booking_binding.source_identity_fingerprint <> normalized.source_identity_fingerprint)
       or (
         existing_booking.id is not null
         and booking_binding.booking_id is null
         and existing_booking.booking_reference <> 'DP-' || normalized.source_reference
       );
  end if;

  if exists (select 1 from pg_temp.dineplan_identity_conflicts) then
    insert into public.dineplan_reconciliation_snapshots (
      checksum, original_filename, mime_type, file_size, uploaded_by,
      reservation_count, covers, normalized_reservations, reconciliation_results,
      status, compared_at, compared_by
    )
    values (
      encode(digest('import-identity-conflict|' || coalesce(p_preview_hash, '') || '|' || clock_timestamp()::text, 'sha256'), 'hex'),
      coalesce(nullif(p_file_name, ''), 'dineplan-import'),
      'application/json',
      greatest(1, octet_length(p_rows::text)),
      p_staff_profile_id,
      jsonb_array_length(p_rows),
      0,
      p_rows,
      jsonb_build_object('blocked', true, 'reason', 'Dineplan source identity conflict'),
      'reconciled',
      now(),
      p_staff_profile_id
    )
    returning id into v_snapshot_id;

    for v_conflict in select * from pg_temp.dineplan_identity_conflicts order by row_number
    loop
      v_created_action_id := null;

      insert into public.dineplan_reconciliation_actions (
        action_key, latest_snapshot_id, source_result_key, show_id, booking_id,
        booking_kind, booking_reference, guest_label, venue, performance_date,
        performance_time, zone, pax, classification, severity, action_kind,
        manual_action, dineplan_state, zingara_state, capacity_impact,
        material_fingerprint, status, source_generated_at
      )
      select
        encode(digest(concat_ws('|', 'dineplan-import-identity', v_conflict.source_reference, coalesce(v_conflict.booking_id::text, 'unbound')), 'sha256'), 'hex'),
        v_snapshot_id,
        'import-identity:' || v_conflict.row_number,
        v_conflict.show_id,
        v_conflict.booking_id,
        case when booking.corporate_request_id is null then 'standard' else 'corporate' end,
        v_conflict.booking_reference,
        coalesce(nullif(v_conflict.customer_name, ''), 'Dineplan import identity conflict'),
        case when v_conflict.venue in ('cape-town', 'johannesburg') then v_conflict.venue else 'johannesburg' end,
        v_conflict.performance_date,
        v_conflict.performance_time,
        booking.section,
        greatest(coalesce(booking.guest_count, 0), 0),
        'review',
        'critical',
        'review_booking',
        'Verify the original Dineplan source identity before importing this booking.',
        format('Source %s was blocked: %s', coalesce(v_conflict.source_reference, 'missing'), v_conflict.reason),
        format('Booking %s remains unchanged.', coalesce(v_conflict.booking_reference, 'not linked')),
        0,
        encode(digest(concat_ws('|', v_conflict.reason, v_conflict.incoming_fingerprint, v_conflict.bound_fingerprint), 'sha256'), 'hex'),
        'unacknowledged',
        now()
      from public.bookings booking
      where booking.id = v_conflict.booking_id
      on conflict (action_key) do update set
        latest_snapshot_id = excluded.latest_snapshot_id,
        source_result_key = excluded.source_result_key,
        guest_label = excluded.guest_label,
        dineplan_state = excluded.dineplan_state,
        zingara_state = excluded.zingara_state,
        material_fingerprint = excluded.material_fingerprint,
        status = 'unacknowledged',
        last_detected_at = now(),
        updated_at = now()
      returning id into v_created_action_id;

      if v_created_action_id is not null then
        insert into public.dineplan_reconciliation_action_events (
          action_id, snapshot_id, event_type, actor_staff_profile_id, metadata
        )
        values (
          v_created_action_id,
          v_snapshot_id,
          'materially_changed',
          p_staff_profile_id,
          jsonb_build_object('reason', v_conflict.reason, 'sourceReference', v_conflict.source_reference)
        );
      end if;

      insert into public.audit_events (
        actor_staff_profile_id, actor_name, actor_role, actor_location_scope,
        action, entity_type, entity_reference, entity_id, entity_location,
        outcome, source_area, reason, before_values, after_values, changed_fields
      )
      select
        staff.id, staff.full_name, role.name, staff.venue_scope,
        'dineplan.import-identity-conflict', 'booking',
        coalesce(v_conflict.booking_reference, v_conflict.source_reference),
        v_conflict.booking_id::text, v_conflict.venue,
        'blocked', 'Dineplan Import', v_conflict.reason,
        jsonb_build_object(
          'boundSourceReference', v_conflict.bound_source_reference,
          'boundFingerprint', v_conflict.bound_fingerprint
        ),
        jsonb_build_object(
          'incomingSourceReference', v_conflict.source_reference,
          'incomingFingerprint', v_conflict.incoming_fingerprint,
          'snapshotId', v_snapshot_id
        ),
        array[]::text[]
      from public.staff_profiles staff
      left join public.roles role on role.id = staff.role_id
      where staff.id = p_staff_profile_id;
    end loop;

    return jsonb_build_object(
      'blocked', true,
      'dataset', p_dataset,
      'created', 0,
      'updated', 0,
      'skipped', jsonb_array_length(p_rows) - (select count(*) from pg_temp.dineplan_identity_conflicts),
      'failed', (select count(*) from pg_temp.dineplan_identity_conflicts),
      'validRows', jsonb_array_length(p_rows),
      'totalRows', jsonb_array_length(p_rows),
      'completedAt', now(),
      'resultLog', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'row', row_number,
          'action', 'Skip',
          'status', 'Failed',
          'message', 'Identity conflict blocked. Review the Dineplan reconciliation action.',
          'reference', booking_reference,
          'customer', customer_name,
          'warnings', '[]'::jsonb,
          'errors', jsonb_build_array(reason)
        ) order by row_number), '[]'::jsonb)
        from pg_temp.dineplan_identity_conflicts
      )
    );
  end if;

  v_result := public.execute_data_portability_import_unchecked(
    p_dataset,
    p_file_name,
    p_rows,
    p_preview_hash,
    p_staff_profile_id,
    p_started_at
  );

  if p_dataset = 'bookings' then
    insert into public.dineplan_import_identity_bindings (
      booking_id, booking_reference_at_binding, source_reference,
      source_reference_fingerprint, source_identity_fingerprint,
      customer_id_at_binding, show_id_at_binding,
      first_bound_by, last_verified_by, last_verified_at
    )
    select
      booking.id,
      booking.booking_reference,
      incoming.source_reference,
      incoming.source_reference_fingerprint,
      incoming.source_identity_fingerprint,
      booking.customer_id,
      booking.show_id,
      p_staff_profile_id,
      p_staff_profile_id,
      now()
    from (
      select distinct
        trim(source.row_data #>> '{values,booking_reference}') as booking_reference,
        upper(regexp_replace(
          coalesce(
            nullif(trim(source.row_data #>> '{values,source_booking_reference}'), ''),
            substring(trim(source.row_data #>> '{values,booking_reference}') from 4)
          ), '[^A-Za-z0-9]', '', 'g'
        )) as source_reference,
        encode(digest(
          'dineplan|' || upper(regexp_replace(
            coalesce(
              nullif(trim(source.row_data #>> '{values,source_booking_reference}'), ''),
              substring(trim(source.row_data #>> '{values,booking_reference}') from 4)
            ), '[^A-Za-z0-9]', '', 'g'
          )), 'sha256'
        ), 'hex') as source_reference_fingerprint,
        encode(digest(
          concat_ws('|',
            'dineplan',
            upper(regexp_replace(
              coalesce(
                nullif(trim(source.row_data #>> '{values,source_booking_reference}'), ''),
                substring(trim(source.row_data #>> '{values,booking_reference}') from 4)
              ), '[^A-Za-z0-9]', '', 'g'
            )),
            lower(regexp_replace(trim(coalesce(source.row_data #>> '{values,customer_name}', '')), '[^A-Za-z0-9]', '', 'g')),
            coalesce(source.row_data #>> '{values,resolved_show_id}', '')
          ), 'sha256'
        ), 'hex') as source_identity_fingerprint
      from jsonb_array_elements(p_rows) source(row_data)
      where lower(coalesce(source.row_data #>> '{values,source_format}', '')) = 'dineplan legacy export'
        and coalesce((source.row_data ->> 'valid')::boolean, false)
        and coalesce(source.row_data ->> 'action', 'Skip') <> 'Skip'
    ) incoming
    join public.bookings booking on booking.booking_reference = incoming.booking_reference
    on conflict (booking_id) do update set
      last_verified_by = excluded.last_verified_by,
      last_verified_at = excluded.last_verified_at;
  end if;

  return v_result;
end;
$$;

revoke all on function public.execute_data_portability_import(text, text, jsonb, text, uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function public.execute_data_portability_import(text, text, jsonb, text, uuid, timestamptz)
  to service_role;

