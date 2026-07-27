import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { supabase } from '../lib/supabase';
import type { GameSide } from '../lib/database.types';
import { Avatar } from './Avatar';

type ParticipantEntry = { full_name: string; avatar_url: string | null; status: 'pending' | 'confirmed' };
type TeamWithRoster = {
  team_id: string;
  team_name: string;
  participants: ParticipantEntry[];
};

export function SideCommanderScreen({ sides }: { sides: GameSide[] }) {
  const [activeSide, setActiveSide] = useState<GameSide>(sides[0]);
  const [gameLabel, setGameLabel] = useState('');
  const [teams, setTeams] = useState<TeamWithRoster[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (side: GameSide) => {
    setLoading(true);
    setError(null);

    const [gameRes, teamSidesRes, participantsRes] = await Promise.all([
      supabase
        .from('games')
        .select('*, project:projects(name), polygon:polygons(name)')
        .eq('id', side.game_id)
        .single(),
      supabase.from('game_team_sides').select('team_id, side_id, team:teams(id, name)').eq('game_id', side.game_id),
      supabase
        .from('game_participants')
        .select('team_id, side_id, status, profile:profiles(full_name, avatar_url)')
        .eq('game_id', side.game_id),
    ]);

    if (gameRes.error) setError(gameRes.error.message);
    const game: any = gameRes.data;
    setGameLabel(game ? `${game.project?.name ?? ''} · ${game.name} · ${game.polygon?.name ?? '—'}` : '');

    const teamSideMap = new Map<string, string>();
    const teamNameMap = new Map<string, string>();
    for (const row of (teamSidesRes.data as any[]) ?? []) {
      teamSideMap.set(row.team_id, row.side_id);
      teamNameMap.set(row.team_id, row.team?.name ?? '');
    }

    const byTeam = new Map<string, ParticipantEntry[]>();
    for (const row of (participantsRes.data as any[]) ?? []) {
      const effectiveSideId = row.side_id ?? teamSideMap.get(row.team_id) ?? null;
      if (effectiveSideId !== side.id) continue;
      const entry: ParticipantEntry = {
        full_name: row.profile?.full_name || '(без имени)',
        avatar_url: row.profile?.avatar_url ?? null,
        status: row.status,
      };
      if (!byTeam.has(row.team_id)) byTeam.set(row.team_id, []);
      byTeam.get(row.team_id)!.push(entry);
    }

    const withRosters: TeamWithRoster[] = Array.from(byTeam.entries()).map(([teamId, participants]) => ({
      team_id: teamId,
      team_name: teamNameMap.get(teamId) ?? '',
      participants,
    }));

    setTeams(withRosters);
    setLoading(false);
  }, []);

  useEffect(() => {
    load(activeSide);
  }, [activeSide, load]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Моя сторона</Text>

      {sides.length > 1 ? (
        <View style={styles.chips}>
          {sides.map((side) => (
            <Pressable
              key={side.id}
              style={[styles.chip, activeSide.id === side.id && styles.chipSelected]}
              onPress={() => setActiveSide(side)}
            >
              <Text style={activeSide.id === side.id ? styles.chipTextSelected : styles.chipText}>
                {side.name}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : (
        <Text style={styles.subtitle}>{activeSide.name}</Text>
      )}

      <Text style={styles.subtitle}>{gameLabel}</Text>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {loading ? (
        <ActivityIndicator style={{ marginTop: 20 }} />
      ) : teams.length === 0 ? (
        <Text style={styles.label}>Пока ни одна команда не выбрала эту сторону</Text>
      ) : (
        teams.map((team) => (
          <View key={team.team_id} style={styles.card}>
            <Text style={styles.cardTitle}>{team.team_name}</Text>
            {team.participants.length === 0 ? (
              <Text style={styles.label}>Состав ещё не зарегистрирован</Text>
            ) : (
              team.participants.map((p, idx) => (
                <View key={idx} style={styles.participantRow}>
                  <Avatar uri={p.avatar_url} name={p.full_name} size={26} />
                  <Text style={styles.participant}>
                    {p.full_name} {p.status === 'pending' ? '· на подтверждении' : ''}
                  </Text>
                </View>
              ))
            )}
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    marginTop: 16,
    marginBottom: 8,
  },
  card: {
    borderWidth: 1,
    borderColor: '#eee',
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 6,
  },
  participantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 2,
  },
  participant: {
    fontSize: 14,
    color: '#333',
  },
  label: {
    fontSize: 13,
    color: '#666',
    marginTop: 4,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  chip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#ccc',
  },
  chipSelected: {
    backgroundColor: '#111',
    borderColor: '#111',
  },
  chipText: {
    color: '#111',
    fontSize: 13,
  },
  chipTextSelected: {
    color: '#fff',
    fontSize: 13,
  },
  error: {
    color: '#c00',
    marginBottom: 12,
  },
});
