-- Минимальная эмуляция схемы storage Supabase для проверки миграции 0002 вне Supabase.
create schema if not exists storage;
create table if not exists storage.buckets (id text primary key, name text not null, public boolean default false, file_size_limit bigint);
create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets (id),
  name text not null,
  owner uuid default auth.uid()
);
alter table storage.objects enable row level security;
create or replace function storage.foldername(name text) returns text[] language sql immutable as $$
  select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1]
$$;
grant usage on schema storage to anon, authenticated, service_role;
grant select, insert, update, delete on storage.objects, storage.buckets to authenticated;
