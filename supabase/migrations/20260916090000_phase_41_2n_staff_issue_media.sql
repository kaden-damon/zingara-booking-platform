create table if not exists public.staff_issue_attachments (
  id uuid primary key default gen_random_uuid(),
  issue_id uuid not null references public.staff_issue_reports(id) on delete cascade,
  uploader_staff_id uuid not null references public.staff_profiles(id) on delete restrict,
  original_filename text not null check (length(trim(original_filename)) > 0),
  mime_type text not null check (
    mime_type in (
      'image/jpeg',
      'image/png',
      'image/webp',
      'video/mp4',
      'video/quicktime'
    )
  ),
  file_size bigint not null check (file_size > 0 and file_size <= 26214400),
  storage_path text not null unique,
  status text not null default 'pending' check (status in ('pending', 'ready', 'failed')),
  upload_error text,
  created_at timestamptz not null default now(),
  ready_at timestamptz
);

create index if not exists staff_issue_attachments_issue_idx
  on public.staff_issue_attachments (issue_id, created_at asc);

alter table public.staff_issue_attachments enable row level security;

revoke all on public.staff_issue_attachments from anon, authenticated;
grant select, insert, update, delete on public.staff_issue_attachments to service_role;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'staff-issue-media',
  'staff-issue-media',
  false,
  26214400,
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'video/mp4',
    'video/quicktime'
  ]::text[]
)
on conflict (id) do update
set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
