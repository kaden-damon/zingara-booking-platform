begin;

update public.venue_settings
set settings = jsonb_set(
      settings,
      '{operationalSettings,customerExperienceTimes}',
      '{"cape-town":{"groundsOpen":"17:00","guestSeating":"18:30","showStarts":"19:30"},"johannesburg":{"groundsOpen":"17:00","guestSeating":"18:30","showStarts":"19:30"}}'::jsonb,
      true
    ),
    operational_config = jsonb_set(
      operational_config,
      '{operationalSettings,customerExperienceTimes}',
      '{"cape-town":{"groundsOpen":"17:00","guestSeating":"18:30","showStarts":"19:30"},"johannesburg":{"groundsOpen":"17:00","guestSeating":"18:30","showStarts":"19:30"}}'::jsonb,
      true
    ),
    updated_at = now()
where venue_key = 'zingara-cape-town';

do $$
begin
  if not exists (
    select 1
    from public.venue_settings
    where venue_key = 'zingara-cape-town'
      and settings #> '{operationalSettings,customerExperienceTimes}' =
        '{"cape-town":{"groundsOpen":"17:00","guestSeating":"18:30","showStarts":"19:30"},"johannesburg":{"groundsOpen":"17:00","guestSeating":"18:30","showStarts":"19:30"}}'::jsonb
      and operational_config #> '{operationalSettings,customerExperienceTimes}' =
        '{"cape-town":{"groundsOpen":"17:00","guestSeating":"18:30","showStarts":"19:30"},"johannesburg":{"groundsOpen":"17:00","guestSeating":"18:30","showStarts":"19:30"}}'::jsonb
  ) then
    raise exception 'Phase 48.2 venue event times were not persisted.';
  end if;
end
$$;

commit;
