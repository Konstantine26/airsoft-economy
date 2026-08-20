-- Airsoft Economy: richer game creation form (cover photo, price, rules, draft/publish)
-- Run after supabase/034_game_announcements.sql.
--
-- The create-game screen is being redesigned around a reference layout the user liked:
-- a cover photo, a paid/free toggle with a price, a separate rules text block, and two
-- save actions ("Сохранить" as a draft vs "Опубликовать"). None of that has a home in
-- the games table yet, so this adds the columns plus a new storage bucket for the cover
-- image (mirrors the game-attachments bucket from 010_game_details.sql: organizers of
-- the game's project can write, everyone can read).
--
-- `status` defaults to 'published' so every existing game stays visible everywhere
-- exactly as before -- only newly created drafts start out hidden from participants.

alter table games add column if not exists cover_url text;
alter table games add column if not exists is_paid boolean not null default false;
alter table games add column if not exists price numeric;
alter table games add column if not exists rules text;
alter table games add column if not exists status text not null default 'published'
  check (status in ('draft', 'published'));

insert into storage.buckets (id, name, public) values ('game-covers', 'game-covers', true)
on conflict (id) do nothing;

create policy "read game-covers files" on storage.objects for select
  using (bucket_id = 'game-covers');

create policy "organizers upload game-covers files" on storage.objects for insert to authenticated
  with check (bucket_id = 'game-covers' and is_game_organizer((storage.foldername(name))[1]::uuid));

create policy "organizers update game-covers files" on storage.objects for update to authenticated
  using (bucket_id = 'game-covers' and is_game_organizer((storage.foldername(name))[1]::uuid));

create policy "organizers delete game-covers files" on storage.objects for delete to authenticated
  using (bucket_id = 'game-covers' and is_game_organizer((storage.foldername(name))[1]::uuid));
