-- Airsoft Economy: team avatars
-- Run after supabase/014_optional_task_reward.sql.
--
-- Adds a round avatar for each team. The actual image bytes live in the
-- public "team-avatars" storage bucket under "<team id>/avatar.jpg"; the
-- teams.avatar_url column stores the resolved public URL.
--
-- The blanket "admins update teams" policy (007_scoped_roles.sql) does not
-- let a team's own commander touch their team row, so avatar changes go
-- through this narrow RPC instead of loosening that policy (which would
-- also let a commander rename their team or reassign the commander seat).

alter table teams add column if not exists avatar_url text;

create or replace function public.set_team_avatar(p_team_id uuid, p_avatar_url text)
returns teams
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row teams;
begin
  if not public.is_team_commander(p_team_id) then
    raise exception 'only the team commander can change its avatar';
  end if;

  update teams set avatar_url = p_avatar_url where id = p_team_id returning * into v_row;
  return v_row;
end;
$$;

grant execute on function public.set_team_avatar(uuid, text) to authenticated;

insert into storage.buckets (id, name, public)
values ('team-avatars', 'team-avatars', true)
on conflict (id) do nothing;

create policy "read team-avatars files" on storage.objects for select
  using (bucket_id = 'team-avatars');

create policy "commanders upload team avatar" on storage.objects for insert to authenticated
  with check (bucket_id = 'team-avatars' and is_team_commander((storage.foldername(name))[1]::uuid));

create policy "commanders update team avatar" on storage.objects for update to authenticated
  using (bucket_id = 'team-avatars' and is_team_commander((storage.foldername(name))[1]::uuid))
  with check (bucket_id = 'team-avatars' and is_team_commander((storage.foldername(name))[1]::uuid));

create policy "commanders delete team avatar" on storage.objects for delete to authenticated
  using (bucket_id = 'team-avatars' and is_team_commander((storage.foldername(name))[1]::uuid));
