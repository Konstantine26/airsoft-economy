-- Airsoft Economy: full game cards (dates, scenario, stages, type, files)
-- Run after supabase/009_player_avatars.sql.
--
-- Adds everything the participant-facing game card needs: an end time,
-- a scenario description, an ordered list of stages, a game type that a
-- project can default new games to, and downloadable/viewable game
-- attachments (separate from the polygon's own reference maps). Also
-- opens self-registration: until now only a team's commander could
-- insert/delete game_participants rows; a plain member can now do the
-- same for their own profile.

alter table projects add column if not exists default_game_type text
  check (default_game_type in ('sunday', 'roleplay', 'tactical', 'marathon', 'night', 'tournament'));

alter table games add column if not exists ends_at timestamptz;
alter table games add column if not exists description text;
alter table games add column if not exists game_type text
  check (game_type in ('sunday', 'roleplay', 'tactical', 'marathon', 'night', 'tournament'));

-- ============================================================
-- Stages ("этапы") -- an ordered list of phases for the game's scenario.
-- ============================================================

create table if not exists game_stages (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references games(id) on delete cascade,
  position integer not null default 0,
  title text not null,
  description text,
  created_at timestamptz not null default now()
);

alter table game_stages enable row level security;

create policy "read game_stages" on game_stages for select to authenticated using (true);
create policy "organizers write game_stages" on game_stages for insert to authenticated
  with check (is_game_organizer(game_id));
create policy "organizers update game_stages" on game_stages for update to authenticated
  using (is_game_organizer(game_id)) with check (is_game_organizer(game_id));
create policy "organizers delete game_stages" on game_stages for delete to authenticated
  using (is_game_organizer(game_id));

-- ============================================================
-- Game attachments -- maps/briefings/rules attached to a specific game by
-- its organizers or admins. Distinct from polygon_maps (the polygon's own
-- reusable reference maps): these belong to one game.
-- ============================================================

create table if not exists game_attachments (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references games(id) on delete cascade,
  storage_path text not null,
  file_name text not null,
  content_type text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

alter table game_attachments enable row level security;

create policy "read game_attachments" on game_attachments for select to authenticated using (true);
create policy "organizers write game_attachments" on game_attachments for insert to authenticated
  with check (is_game_organizer(game_id));
create policy "organizers delete game_attachments" on game_attachments for delete to authenticated
  using (is_game_organizer(game_id));

insert into storage.buckets (id, name, public)
values ('game-attachments', 'game-attachments', true)
on conflict (id) do nothing;

create policy "read game-attachments files" on storage.objects for select
  using (bucket_id = 'game-attachments');

create policy "organizers upload game-attachments files" on storage.objects for insert to authenticated
  with check (bucket_id = 'game-attachments' and is_game_organizer((storage.foldername(name))[1]::uuid));

create policy "organizers delete game-attachments files" on storage.objects for delete to authenticated
  using (bucket_id = 'game-attachments' and is_game_organizer((storage.foldername(name))[1]::uuid));

-- ============================================================
-- Self-registration: a plain participant can now submit their own
-- application (previously only their team's commander could). The
-- check_game_participant trigger from 002/007 still enforces that the
-- profile is on the team's roster and that the team has already picked a
-- side for this game.
-- ============================================================

drop policy if exists "commander registers participants" on game_participants;
create policy "commander or self registers participant" on game_participants for insert to authenticated
  with check ((is_team_commander(team_id) or profile_id = auth.uid()) and (status is null or status = 'pending'));

drop policy if exists "commander unregisters participants" on game_participants;
create policy "commander or self unregisters participant" on game_participants for delete to authenticated
  using (is_team_commander(team_id) or is_game_organizer(game_id) or profile_id = auth.uid());
