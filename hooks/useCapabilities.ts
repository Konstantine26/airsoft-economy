import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import type { Team, GameSide, TeamMember } from '../lib/database.types';

export type Capabilities = {
  loading: boolean;
  commandedTeams: Team[];
  commandedSides: GameSide[];
  ownMembership: (TeamMember & { team: Team }) | null;
  organizerProjectIds: string[];
  organizerGameIds: string[];
  isOrganizer: boolean;
  refresh: () => Promise<void>;
};

export function useCapabilities(): Capabilities {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [commandedTeams, setCommandedTeams] = useState<Team[]>([]);
  const [commandedSides, setCommandedSides] = useState<GameSide[]>([]);
  const [ownMembership, setOwnMembership] = useState<(TeamMember & { team: Team }) | null>(null);
  const [organizerProjectIds, setOrganizerProjectIds] = useState<string[]>([]);
  const [organizerGameIds, setOrganizerGameIds] = useState<string[]>([]);

  const load = useCallback(async () => {
    if (!profile) {
      setCommandedTeams([]);
      setCommandedSides([]);
      setOwnMembership(null);
      setOrganizerProjectIds([]);
      setOrganizerGameIds([]);
      setLoading(false);
      return;
    }

    const [teamsRes, sidesRes, membershipRes, projectOrgRes, gameOrgRes] = await Promise.all([
      supabase.from('teams').select('*').eq('commander_id', profile.id),
      supabase.from('game_sides').select('*').eq('commander_id', profile.id),
      supabase
        .from('team_members')
        .select('*, team:teams(*)')
        .eq('profile_id', profile.id)
        .maybeSingle(),
      supabase.from('project_organizers').select('project_id').eq('profile_id', profile.id),
      supabase.from('game_organizers').select('game_id').eq('profile_id', profile.id),
    ]);

    setCommandedTeams(teamsRes.data ?? []);
    setCommandedSides(sidesRes.data ?? []);
    setOwnMembership((membershipRes.data as (TeamMember & { team: Team }) | null) ?? null);
    setOrganizerProjectIds((projectOrgRes.data ?? []).map((r) => r.project_id));
    setOrganizerGameIds((gameOrgRes.data ?? []).map((r) => r.game_id));
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
    refresh: load,
  };
}
