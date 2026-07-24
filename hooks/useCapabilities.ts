import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import type { Team, GameSide, TeamMember } from '../lib/database.types';

export type Capabilities = {
  loading: boolean;
  commandedTeams: Team[];
  commandedSides: GameSide[];
  ownMembership: (TeamMember & { team: Team }) | null;
  refresh: () => Promise<void>;
};

export function useCapabilities(): Capabilities {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [commandedTeams, setCommandedTeams] = useState<Team[]>([]);
  const [commandedSides, setCommandedSides] = useState<GameSide[]>([]);
  const [ownMembership, setOwnMembership] = useState<(TeamMember & { team: Team }) | null>(null);

  const load = useCallback(async () => {
    if (!profile) {
      setCommandedTeams([]);
      setCommandedSides([]);
      setOwnMembership(null);
      setLoading(false);
      return;
    }

    const [teamsRes, sidesRes, membershipRes] = await Promise.all([
      supabase.from('teams').select('*').eq('commander_id', profile.id),
      supabase.from('game_sides').select('*').eq('commander_id', profile.id),
      supabase
        .from('team_members')
        .select('*, team:teams(*)')
        .eq('profile_id', profile.id)
        .maybeSingle(),
    ]);

    setCommandedTeams(teamsRes.data ?? []);
    setCommandedSides(sidesRes.data ?? []);
    setOwnMembership((membershipRes.data as (TeamMember & { team: Team }) | null) ?? null);
    setLoading(false);
  }, [profile]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  return { loading, commandedTeams, commandedSides, ownMembership, refresh: load };
}
