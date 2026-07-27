-- Airsoft Economy: player avatars
-- Run after supabase/008_project_scoped_economy.sql.
--
-- Adds a round avatar for each participant. The actual image bytes live in
-- the public "avatars" storage bucket under "<user id>/avatar.jpg"; the
-- profiles.avatar_url column stores the resolved public URL.

alter table profiles add column if not exists avatar_url text;

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

create policy "read avatars files" on storage.objects for select
  using (bucket_id = 'avatars');

create policy "users upload own avatar" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "users update own avatar" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "users delete own avatar" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
