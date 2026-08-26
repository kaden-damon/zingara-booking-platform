create or replace function public.unmerge_show_tables_atomic(
  p_show_id uuid,
  p_merged_table_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member_count integer;
  v_owned_member_ids uuid[];
  v_preserved_member_ids uuid[];
  v_merged_table public.show_tables%rowtype;
begin
  select *
    into v_merged_table
    from public.show_tables
   where id = p_merged_table_id
   for update;

  if v_merged_table.id is null
     or v_merged_table.show_id <> p_show_id
     or v_merged_table.is_physical
     or cardinality(coalesce(v_merged_table.merged_from, '{}'::uuid[])) < 2 then
    raise exception 'MERGED_TABLE_NOT_FOUND';
  end if;

  if v_merged_table.booking_id is not null
     or exists (
       select 1
         from public.bookings b
        where b.table_id = v_merged_table.id
     ) then
    raise exception 'MERGED_TABLE_HAS_BOOKING';
  end if;

  perform 1
    from public.show_tables st
   where st.id = any(v_merged_table.merged_from)
   order by st.id
   for update;

  select count(*)::integer
    into v_member_count
    from public.show_tables st
   where st.id = any(v_merged_table.merged_from)
     and st.show_id = p_show_id
     and st.section = v_merged_table.section
     and st.is_physical;

  if v_member_count <> cardinality(v_merged_table.merged_from) then
    raise exception 'MERGED_MEMBER_STATE_INVALID';
  end if;

  if exists (
    select 1
      from public.show_tables st
     where st.id = any(v_merged_table.merged_from)
       and (
         st.booking_id is not null
         or exists (
           select 1
             from public.bookings b
            where b.table_id = st.id
         )
       )
  ) then
    raise exception 'MERGED_MEMBER_HAS_BOOKING';
  end if;

  if exists (
    select 1
      from public.show_tables st
      left join public.show_tables owner
        on owner.id = st.merged_parent_id
     where st.id = any(v_merged_table.merged_from)
       and st.merged_parent_id is distinct from v_merged_table.id
       and (
         st.merged_parent_id is null
         or owner.id is null
         or owner.show_id <> p_show_id
         or owner.section <> v_merged_table.section
         or owner.is_physical
         or not (st.id = any(coalesce(owner.merged_from, '{}'::uuid[])))
       )
  ) then
    raise exception 'MERGED_MEMBER_STATE_INVALID';
  end if;

  select coalesce(array_agg(st.id order by st.id), '{}'::uuid[])
    into v_owned_member_ids
    from public.show_tables st
   where st.id = any(v_merged_table.merged_from)
     and st.merged_parent_id = v_merged_table.id;

  select coalesce(array_agg(st.id order by st.id), '{}'::uuid[])
    into v_preserved_member_ids
    from public.show_tables st
   where st.id = any(v_merged_table.merged_from)
     and st.merged_parent_id is distinct from v_merged_table.id;

  delete from public.show_tables
   where id = v_merged_table.id;

  update public.show_tables
     set merged_parent_id = null,
         status = case
           when capacity_configured then 'available'::public.table_status
           else 'disabled'::public.table_status
         end,
         updated_at = now()
   where id = any(v_owned_member_ids);

  return jsonb_build_object(
    'member_table_ids', to_jsonb(v_owned_member_ids),
    'preserved_member_table_ids', to_jsonb(v_preserved_member_ids),
    'removed_merged_table_code', v_merged_table.table_code,
    'removed_merged_table_id', v_merged_table.id
  );
end
$$;

revoke all on function public.unmerge_show_tables_atomic(uuid, uuid) from public;
revoke all on function public.unmerge_show_tables_atomic(uuid, uuid) from anon;
revoke all on function public.unmerge_show_tables_atomic(uuid, uuid) from authenticated;
grant execute on function public.unmerge_show_tables_atomic(uuid, uuid) to service_role;
