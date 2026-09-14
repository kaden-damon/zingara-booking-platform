-- Phase 41.2K: transactional Corporate import identity without mutating
-- historical duplicate records.

alter table public.corporate_requests
  add column if not exists import_fingerprint text,
  add column if not exists import_source_checksum text,
  add column if not exists import_source_file text,
  add column if not exists import_source_row integer;

with parsed as (
  select
    request.id,
    case
      when request.notes like '__zingara_corporate_request_meta__:%'
      then substring(
        request.notes from length('__zingara_corporate_request_meta__:') + 1
      )::jsonb
    end as request_meta
  from public.corporate_requests request
), imported as (
  select
    parsed.id,
    case
      when parsed.request_meta ->> 'notes' like '__zingara_corporate_enquiry_import__:%'
      then substring(
        parsed.request_meta ->> 'notes'
        from length('__zingara_corporate_enquiry_import__:') + 1
      )::jsonb
    end as import_meta
  from parsed
), ranked as (
  select
    imported.id,
    imported.import_meta,
    row_number() over (
      partition by imported.import_meta ->> 'fingerprint'
      order by request.created_at, request.id
    ) as identity_rank
  from imported
  join public.corporate_requests request on request.id = imported.id
  where nullif(imported.import_meta ->> 'fingerprint', '') is not null
)
update public.corporate_requests request
set
  import_fingerprint = case
    when ranked.identity_rank = 1 then ranked.import_meta ->> 'fingerprint'
    else null
  end,
  import_source_checksum = nullif(ranked.import_meta ->> 'sourceChecksum', ''),
  import_source_file = nullif(ranked.import_meta ->> 'sourceFile', ''),
  import_source_row = case
    when ranked.import_meta ->> 'sourceRow' ~ '^\d+$'
    then (ranked.import_meta ->> 'sourceRow')::integer
    else null
  end
from ranked
where request.id = ranked.id;

create unique index if not exists corporate_requests_import_fingerprint_unique_idx
  on public.corporate_requests (import_fingerprint)
  where import_fingerprint is not null;

create index if not exists corporate_requests_import_source_idx
  on public.corporate_requests (
    import_source_checksum,
    import_source_file,
    import_source_row
  )
  where import_source_checksum is not null;

comment on column public.corporate_requests.import_fingerprint is
  'Canonical idempotency identity for imported Corporate enquiries. Historical duplicate residues remain unmodified and have a null guard identity.';
