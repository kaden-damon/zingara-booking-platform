alter table public.show_edit_locks
  add column if not exists lock_purpose text not null default 'show-edit';

alter table public.show_edit_locks
  drop constraint if exists show_edit_locks_lock_purpose_check;

alter table public.show_edit_locks
  add constraint show_edit_locks_lock_purpose_check
  check (lock_purpose in ('show-edit', 'booking-creation'));

comment on column public.show_edit_locks.lock_purpose is
  'Purpose of the exclusive staff show lock. Public booking concurrency is not governed by this lock.';
