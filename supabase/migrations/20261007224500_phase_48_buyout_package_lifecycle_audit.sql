begin;

alter table public.corporate_buyout_packages
  add column if not exists active_from timestamptz,
  add column if not exists active_until timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'corporate_buyout_packages_active_window_check'
      and conrelid = 'public.corporate_buyout_packages'::regclass
  ) then
    alter table public.corporate_buyout_packages
      add constraint corporate_buyout_packages_active_window_check
      check (active_until is null or active_from is null or active_until > active_from);
  end if;
end;
$$;

create or replace function public.audit_corporate_buyout_package_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.audit_events (
    action, actor_staff_profile_id, after_values, before_values, changed_fields,
    entity_id, entity_reference, entity_type, outcome, reason, source_area
  ) values (
    case when tg_op = 'INSERT'
      then 'corporate.buyout.package.created'
      else 'corporate.buyout.package.updated'
    end,
    new.updated_by_staff_profile_id,
    to_jsonb(new) - array['created_by_staff_profile_id','updated_by_staff_profile_id'],
    case when tg_op = 'INSERT'
      then '{}'::jsonb
      else to_jsonb(old) - array['created_by_staff_profile_id','updated_by_staff_profile_id']
    end,
    array[
      'version','currency','base_amount','gratuity_amount','vat_amount','total_amount',
      'included_guest_count','maximum_guest_count','additional_guest_rate',
      'quote_validity_hours','date_hold_hours','payment_due_hours',
      'inclusions','exclusions','active','active_from','active_until'
    ],
    new.id::text, new.code || ':v' || new.version::text,
    'corporate_buyout_package', 'success',
    case when tg_op = 'INSERT'
      then 'Full Show Buyout package version created.'
      else 'Full Show Buyout package version changed.'
    end,
    'Corporate Buyout Settings'
  );
  return new;
end;
$$;

drop trigger if exists corporate_buyout_packages_audit_changes
  on public.corporate_buyout_packages;
create trigger corporate_buyout_packages_audit_changes
  after insert or update on public.corporate_buyout_packages
  for each row execute function public.audit_corporate_buyout_package_changes();

insert into public.audit_events (
  action, after_values, before_values, changed_fields,
  entity_id, entity_reference, entity_type, outcome, reason, source_area
)
select
  'corporate.buyout.package.installed',
  to_jsonb(package_row) - array['created_by_staff_profile_id','updated_by_staff_profile_id'],
  '{}'::jsonb,
  array[
    'version','currency','base_amount','gratuity_amount','vat_amount','total_amount',
    'included_guest_count','maximum_guest_count','additional_guest_rate',
    'quote_validity_hours','date_hold_hours','payment_due_hours',
    'inclusions','exclusions','active','active_from','active_until'
  ],
  package_row.id::text,
  package_row.code || ':v' || package_row.version::text,
  'corporate_buyout_package',
  'success',
  'Initial Full Show Buyout package version installed. Disputed terms remain unset.',
  'Phase 48.0 Migration'
from public.corporate_buyout_packages package_row
where not exists (
  select 1
  from public.audit_events audit
  where audit.action = 'corporate.buyout.package.installed'
    and audit.entity_id = package_row.id::text
);

revoke all on function public.audit_corporate_buyout_package_changes()
  from public, anon, authenticated;

commit;
