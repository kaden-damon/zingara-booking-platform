begin;

create or replace function public.get_box_office_assignment_approval_status(
  p_show_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_available_seats integer := 0;
  v_available_units integer := 0;
  v_base jsonb;
  v_job public.automatic_table_assignment_resume_jobs%rowtype;
  v_layout_version_id uuid;
  v_waiting integer := 0;
  v_waiting_guests integer := 0;
begin
  v_base := public.get_automatic_table_assignment_status(p_show_id);

  select setting.approved_layout_version_id
    into v_layout_version_id
  from public.shows show_row
  join public.physical_seating_venue_settings setting
    on setting.venue = case
      when lower(trim(coalesce(show_row.venue, ''))) in
        ('cape-town', 'cape town') then 'cape-town'
      when lower(trim(coalesce(show_row.venue, ''))) in
        ('johannesburg', 'joburg') then 'johannesburg'
      else ''
    end
  where show_row.id = p_show_id;

  select count(*)::integer, coalesce(sum(table_row.capacity), 0)::integer
    into v_available_units, v_available_seats
  from public.show_tables table_row
  where table_row.show_id = p_show_id
    and table_row.booking_id is null
    and table_row.status::text = 'available'
    and table_row.merged_parent_id is null
    and public.resolve_hybrid_table_minimum_occupancy(
      table_row.id,
      v_layout_version_id
    ) is not null;

  select count(*)::integer, coalesce(sum(booking.guest_count), 0)::integer
    into v_waiting, v_waiting_guests
  from public.bookings booking
  where booking.show_id = p_show_id
    and booking.archived_at is null
    and booking.booking_status::text in (
      'new', 'pending_payment', 'confirmed', 'checked_in'
    )
    and booking.table_id is null
    and not exists (
      select 1
      from public.show_tables claimed
      where claimed.booking_id = booking.id
        and claimed.merged_parent_id is null
    )
    and not exists (
      select 1
      from public.corporate_buyouts buyout
      where buyout.booking_id = booking.id
        and buyout.state in (
          'provisional', 'awaiting_payment', 'fully_paid', 'confirmed'
        )
    );

  select * into v_job
  from public.automatic_table_assignment_resume_jobs job
  where job.show_id = p_show_id
  order by job.created_at desc
  limit 1;

  return v_base || jsonb_build_object(
    'hybridAssignmentEnabled', exists (
      select 1
      from public.physical_seating_reconciliation_queue queue
      where queue.show_id = p_show_id
        and queue.reason = 'PHASE_54_11_HYBRID_TABLE_ASSIGNMENT'
    ),
    'awaitingAssignmentCount', v_waiting,
    'awaitingAssignmentGuests', v_waiting_guests,
    'availableTableUnits', v_available_units,
    'availableSeatCapacity', v_available_seats,
    'resumeJob', case when v_job.id is null then null else jsonb_build_object(
      'id', v_job.id,
      'status', v_job.status,
      'totalBookings', v_job.total_bookings,
      'processedBookings', v_job.processed_bookings,
      'assignedBookings', v_job.assigned_bookings,
      'manualBookings', v_job.manual_bookings,
      'skippedBookings', v_job.skipped_bookings,
      'createdAt', v_job.created_at,
      'completedAt', v_job.completed_at,
      'lastError', v_job.last_error
    ) end
  );
end;
$$;

revoke all on function public.get_box_office_assignment_approval_status(uuid)
  from public, anon, authenticated;
grant execute on function public.get_box_office_assignment_approval_status(uuid)
  to service_role;

comment on function public.get_box_office_assignment_approval_status(uuid) is
  'Returns Box Office assignment facts for eligible table-assignment bookings; active Full Show Buyouts remain in manual floor planning.';

commit;
