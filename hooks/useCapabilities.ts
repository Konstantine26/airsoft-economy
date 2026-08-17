import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import type { Team, GameSide, TeamMember } from '../lib/database.types';

export type TraderGame = { gameId: string; sideIds: string[]; projectId: string | null };
export type CommandedSide = GameSide & { project_id: string | null };

export type Capabilities = {
  loading: boolean;
  commandedTeams: Team[];
  commandedSides: CommandedSide[];
  ownMembership: (TeamMember & { team: Team }) | null;
  organizerProjectIds: string[];
  organizerGameIds: string[];
  isOrganizer: boolean;
  traderGames: TraderGame[];
  isTrader: boolean;
  refresh: () => Promise<void>;
};

export function useCapabilities(): Capabilities {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [commandedTeams, setCommandedTeams] = useState<Team[]>([]);
  const [commandedSides, setCommandedSides] = useState<CommandedSide[]>([]);
  const [ownMembership, setOwnMembership] = useState<(TeamMember & { team: Team }) | null>(null);
  const [organizerProjectIds, setOrganizerProjectIds] = useState<string[]>([]);
  const [organizerGameIds, setOrganizerGameIds] = useState<string[]>([]);
  const [traderGames, setTraderGames] = useState<TraderGame[]>([]);

  const load = useCallback(async () => {
    if (!profile) {
      setCommandedTeams([]);
      setCommandedSides([]);
      setOwnMembership(null);
      setOrganizerProjectIds([]);
      setOrganizerGameIds([]);
      setTraderGames([]);
      setLoading(false);
      return;
    }

    const [teamsRes, sidesRes, membershipRes, projectOrgRes, gameOrgRes, traderRes] = await Promise.all([
      supabase.from('teams').select('*').eq('commander_id', profile.id),
      supabase.from('game_sides').select('*, game:games(project_id)').eq('commander_id', profile.id),
      supabase
        .from('team_members')
        .select('*, team:teams(*)')
        .eq('profile_id', profile.id)
        .maybeSingle(),
      supabase.from('project_organizers').select('project_id').eq('profile_id', profile.id),
      supabase.from('game_organizers').select('game_id').eq('profile_id', profile.id),
      supabase
        .from('game_traders')
        .select('game_id, sides:game_trader_sides(side_id), game:games(project_id)')
        .eq('profile_id', profile.id),
    ]);

    setCommandedTeams(teamsRes.data ?? []);
    setCommandedSides(
      ((sidesRes.data as any[]) ?? []).map((row) => ({
        id: row.id,
        game_id: row.game_id,
        name: row.name,
        commander_id: row.commander_id,
        project_id: row.game?.project_id ?? null,
      }))
    );
    setOwnMembership((membershipRes.data as (TeamMember & { team: Team }) | null) ?? null);
    setOrganizerProjectIds((projectOrgRes.data ?? []).map((r) => r.project_id));
    setOrganizerGameIds((gameOrgRes.data ?? []).map((r) => r.game_id));
    setTraderGames(
      ((traderRes.data as any[]) ?? []).map((row) => ({
        gameId: row.game_id,
        sideIds: (row.sides ?? []).map((s: any) => s.side_id),
        projectId: row.game?.project_id ?? null,
      }))
    );
    setLoading(false);
  }, [profile]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  return {
    loading,
    commandedTeams,
    commandedSides,
    ownMembership,
    organizerProjectIds,
    organizerGameIds,
    isOrganizer: organizerProjectIds.length > 0 || organizerGameIds.length > 0,
    traderGames,
    isTrader: traderGames.length > 0,
    refresh: load,
  };
}
