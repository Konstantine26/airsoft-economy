-- Airsoft Economy: polygons (training grounds) as a standalone directory
-- Run after supabase/005_personal_wallets.sql.
--
-- Polygons are created by admins only and picked from a list when a game
-- is created, replacing the old free-text games.polygon field.

create table if not exists polygons (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  country text,
  region text,
  city text,
  address text,
  type text not null check (type in ('built_up', 'forest', 'field', 'sqb', 'mixed')),
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

alter table polygons enable row level security;

-- Map files (images/documents) attached to a polygon. Actual bytes live in
-- the "polygon-maps" storage bucket; this row is the metadata + pointer.
create table if not exists polygon_maps (
  id uuid primary key default gen_random_uuid(),
  polygon_id uuid not null references polygons(id) on delete cascade,
  storage_path text not null,
  file_name text not null,
  content_type text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

alter table polygon_maps enable row level security;

create policy "read polygons" on polygons for select to authenticated using (true);
create policy "admins write polygons" on polygons for insert to authenticated
  with check (is_admin());
create policy "admins update polygons" on polygons for update to authenticated
  using (is_admin()) with check (is_admin());
create policy "admins delete polygons" on polygons for delete to authenticated
  using (is_admin());

create policy "read polygon_maps" on polygon_maps for select to authenticated using (true);
create policy "admins write polygon_maps" on polygon_maps for insert to authenticated
  with check (is_admin());
create policy "admins delete polygon_maps" on polygon_maps for delete to authenticated
  using (is_admin());

-- ============================================================
-- games: replace the free-text "polygon" column with a reference to the
-- new directory. Existing free-text values (if any) are turned into their
-- own polygon rows so no game loses its polygon during the migration.
-- ============================================================

alter table games add column if not exists polygon_id uuid references polygons(id);

insert into polygons (name, type)
select distinct g.polygon, 'mixed'
from games g
where g.polygon_id is null
  and not exists (select 1 from polygons p where p.name = g.polygon);

update games g
set polygon_id = p.id
from polygons p
where g.polygon_id is null and p.name = g.polygon;

alter table games alter column polygon_id set not null;
alter table games drop column if exists polygon;

-- ============================================================
-- Storage bucket for polygon map files (images/documents), public read.
-- ============================================================

insert into storage.buckets (id, name, public)
values ('polygon-maps', 'polygon-maps', true)
on conflict (id) do nothing;

create policy "read polygon-maps files" on storage.objects for select
  using (bucket_id = 'polygon-maps');

create policy "admins upload polygon-maps files" on storage.objects for insert to authenticated
  with check (bucket_id = 'polygon-maps' and is_admin());

create policy "admins delete polygon-maps files" on storage.objects for delete to authenticated
  using (bucket_id = 'polygon-maps' and is_admin());
