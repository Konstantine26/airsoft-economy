import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import type { Game, GameParticipantStatus, Polygon, Project, Team, TeamMember } from '../lib/database.types';
import { Card } from './Card';
import { GameCardScreen } from './GameCardScreen';
import { colors, font, radii, spacing } from '../lib/theme';

type Props = {
  ownMembership: (TeamMember & { team: Team }) | null;
  activeProjectId: string | null;
  onOpenGame: (game: { id: string; project_id: string }) => void;
};

type GameState = 'upcoming' | 'past' | 'pending' | 'available';

type GameRow = Game & { project: Project | null; polygon: Polygon | null; state: GameState };

const STATE_LABEL: Record<GameState, string> = {
  upcoming: 'Предстоит',
  past: 'Прошла',
  pending: 'На рассмотрении',
  available: 'Доступна для записи',
};

const STATE_ORDER: Record<GameState, number> = {
  upcoming: 0,
  pending: 1,
  available: 2,
  past: 3,
};

export function PlayerGamesScreen({ ownMembership, activeProjectId, onOpenGame }: Props) {
  const { profile } = useAuth();
  const [games, setGames] = useState<GameRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [openGameId, setOpenGameId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!profile) {
      setGames([]);
      return;
    }
    const [statusRes, gamesRes] = await Promise.all([
      supabase.from('game_participants').select('game_id, status').eq('profile_id', profile.id),
      supabase.from('games').select('*, project:projects(*), polygon:polygons(*)').order('starts_at', { ascending: true }),
    ]);

    const statusMap = new Map<string, GameParticipantStatus>();
    for (const row of statusRes.data ?? []) {
      statusMap.set(row.game_id, row.status);
    }

    const now = Date.now();
    const rows: GameRow[] = [];
    for (const game of (gamesRes.data as any[]) ?? []) {
      if (game.project_id !== activeProjectId) continue;
      const ended = !!game.ends_at && new Date(game.ends_at).getTime() <= now;
      const status = statusMap.get(game.id);
      let state: GameState;
      if (status === 'confirmed') {
        state = ended ? 'past' : 'upcoming';
      } else if (status === 'pending') {
        state = 'pending';
      } else if (!ended) {
        state = 'available';
      } else {
        continue;
      }
      rows.push({ ...game, state });
    }
    rows.sort((a, b) => STATE_ORDER[a.state] - STATE_ORDER[b.state] || (a.starts_at ?? '').localeCompare(b.starts_at ?? ''));
    setGames(rows);
  }, [profile, activeProjectId]);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const openGame = (game: GameRow) => {
    onOpenGame({ id: game.id, project_id: game.project_id });
    setOpenGameId(game.id);
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (openGameId) {
    return <GameCardScreen gameId={openGameId} ownMembership={ownMembership} onClose={() => setOpenGameId(null)} />;
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} colors={[colors.accent]} />}
    >
      <Text style={styles.title}>Игры</Text>

      {games.length === 0 ? (
        <Text style={styles.label}>Игр пока нет</Text>
      ) : (
        <View style={styles.list}>
          {games.map((game) => (
            <Pressable key={game.id} onPress={() => openGame(game)}>
              <Card style={styles.gameCard}>
                <View style={styles.gameCardHeader}>
                  <Text style={styles.cardTitle}>{game.name}</Text>
                  <Text style={[styles.stateBadge, STATE_BADGE_STYLE[game.state]]}>{STATE_LABEL[game.state]}</Text>
                </View>
                <Text style={styles.label}>
                  {game.project?.name ?? '—'} · {game.polygon?.name ?? '—'}
                </Text>
                {game.starts_at ? <Text style={styles.label}>{new Date(game.starts_at).toLocaleString()}</Text> : null}
              </Card>
            </Pressable>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: 40,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
  },
  title: {
    fontFamily: font.heading,
    fontSize: 19,
    color: colors.text,
    marginBottom: spacing.md,
  },
  list: {
    gap: 10,
  },
  gameCard: {
    gap: 4,
  },
  gameCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
  },
  cardTitle: {
    fontFamily: font.bodyBold,
    fontSize: 14,
    color: colors.text,
    flex: 1,
  },
  label: {
    fontFamily: font.body,
    fontSize: 12,
    color: colors.textMuted,
  },
  stateBadge: {
    fontFamily: font.bodySemiBold,
    fontSize: 10.5,
    borderRadius: radii.pill,
    paddingHorizontal: 9,
    paddingVertical: 3,
    overflow: 'hidden',
  },
  stateUpcoming: {
    color: colors.success,
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: colors.accentSoftBorder,
  },
  statePast: {
    color: colors.textDim,
    backgroundColor: colors.white10,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  statePending: {
    color: colors.accent,
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: colors.accentSoftBorder,
  },
  stateAvailable: {
    color: colors.textMuted,
    backgroundColor: colors.white10,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
});

const STATE_BADGE_STYLE: Record<GameState, object> = {
  upcoming: styles.stateUpcoming,
  past: styles.statePast,
  pending: styles.statePending,
  available: styles.stateAvailable,
};
