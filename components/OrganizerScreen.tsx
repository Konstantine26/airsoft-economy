import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import type { Game, Polygon, Project } from '../lib/database.types';
import { Card } from './Card';
import { Button } from './Button';
import { GameManageScreen } from './GameManageScreen';
import { CreateGameWizard } from './CreateGameWizard';
import { colors, font, spacing } from '../lib/theme';

type GameWithRelations = Game & { project: Project | null; polygon: Polygon | null };
type GameStats = { sideCount: number; participantCount: number; pendingCount: number; confirmedCount: number };
export type OrganizerView = 'overview' | 'games';

function gameStatusLabel(game: GameWithRelations): string {
  const now = Date.now();
  if (!game.starts_at) return 'Дата не назначена';
  const starts = new Date(game.starts_at).getTime();
  if (game.ends_at && new Date(game.ends_at).getTime() < now) return 'Завершена';
  if (starts > now) return 'Ожидается';
  return 'Идёт';
}

type Props = {
  view: OrganizerView;
};

export function OrganizerScreen({ view }: Props) {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [allGames, setAllGames] = useState<GameWithRelations[]>([]);
  const [statsByGame, setStatsByGame] = useState<Record<string, GameStats>>({});
  const [organizerProjects, setOrganizerProjects] = useState<Project[]>([]);

  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);
  const [creatingGame, setCreatingGame] = useState(false);

  const fetchGames = useCallback(async () => {
    if (!profile) return;
    setError(null);

    let gameIds: string[] | null = null;
    if (!isAdmin) {
      const [projectOrgRes, gameOrgRes] = await Promise.all([
        supabase.from('project_organizers').select('project_id').eq('profile_id', profile.id),
        supabase.from('game_organizers').select('game_id').eq('profile_id', profile.id),
      ]);
      const projectIds = (projectOrgRes.data ?? []).map((r) => r.project_id);
      const directGameIds = (gameOrgRes.data ?? []).map((r) => r.game_id);

      let gamesFromProjects: string[] = [];
      if (projectIds.length > 0) {
        const { data } = await supabase.from('games').select('id').in('project_id', projectIds);
        gamesFromProjects = (data ?? []).map((g) => g.id);
      }
      gameIds = Array.from(new Set([...gamesFromProjects, ...directGameIds]));
    }

    if (gameIds !== null && gameIds.length === 0) {
      setAllGames([]);
      setStatsByGame({});
      return;
    }

    let query = supabase
      .from('games')
      .select('*, project:projects(*), polygon:polygons(*)')
      .order('starts_at', { ascending: true, nullsFirst: false });
    if (gameIds !== null) query = query.in('id', gameIds);

    const { data, error: gamesError } = await query;
    if (gamesError) setError(gamesError.message);
    const rows = (data as GameWithRelations[]) ?? [];
    setAllGames(rows);

    if (rows.length === 0) {
      setStatsByGame({});
      return;
    }

    const ids = rows.map((g) => g.id);
    const [sidesRes, participantsRes] = await Promise.all([
      supabase.from('game_sides').select('game_id').in('game_id', ids),
      supabase.from('game_participants').select('game_id, status').in('game_id', ids),
    ]);
    const stats: Record<string, GameStats> = {};
    for (const id of ids) stats[id] = { sideCount: 0, participantCount: 0, pendingCount: 0, confirmedCount: 0 };
    for (const row of sidesRes.data ?? []) {
      stats[row.game_id].sideCount += 1;
    }
    for (const row of participantsRes.data ?? []) {
      stats[row.game_id].participantCount += 1;
      if (row.status === 'pending') stats[row.game_id].pendingCount += 1;
      if (row.status === 'confirmed') stats[row.game_id].confirmedCount += 1;
    }
    setStatsByGame(stats);
  }, [profile, isAdmin]);

  const fetchOrganizerProjects = useCallback(async () => {
    if (!profile) return;
    const { data: rows } = await supabase.from('project_organizers').select('project_id').eq('profile_id', profile.id);
    const ids = (rows ?? []).map((r) => r.project_id);
    if (ids.length === 0) {
      setOrganizerProjects([]);
      return;
    }
    const { data: projectRows } = await supabase
      .from('projects')
      .select('*')
      .in('id', ids)
      .order('name', { ascending: true });
    setOrganizerProjects(projectRows ?? []);
  }, [profile]);

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchGames(), fetchOrganizerProjects()]).finally(() => setLoading(false));
  }, [fetchGames, fetchOrganizerProjects]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([fetchGames(), fetchOrganizerProjects()]);
    setRefreshing(false);
  }, [fetchGames, fetchOrganizerProjects]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (selectedGameId) {
    return (
      <GameManageScreen
        gameId={selectedGameId}
        onBack={() => {
          setSelectedGameId(null);
          fetchGames();
        }}
        onDeleted={() => {
          setSelectedGameId(null);
          fetchGames();
          fetchOrganizerProjects();
        }}
      />
    );
  }

  if (creatingGame) {
    return (
      <CreateGameWizard
        projects={organizerProjects}
        onCancel={() => setCreatingGame(false)}
        onDone={(gameId) => {
          setCreatingGame(false);
          fetchGames();
          setSelectedGameId(gameId);
        }}
      />
    );
  }

  const now = Date.now();
  const upcomingGames = allGames.filter((g) => !g.ends_at || new Date(g.ends_at).getTime() > now).slice(0, 3);
  const nearestGame = upcomingGames[0] ?? allGames[0] ?? null;
  const totalPending = Object.values(statsByGame).reduce((sum, s) => sum + s.pendingCount, 0);
  const totalConfirmed = Object.values(statsByGame).reduce((sum, s) => sum + s.confirmedCount, 0);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} colors={[colors.accent]} />}
    >
      <Text style={styles.title}>Организатор</Text>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {view === 'overview' ? (
        <>
          <View style={styles.statsRow}>
            <Card style={styles.statCard}>
              <Text style={styles.statValue}>{totalPending}</Text>
              <Text style={styles.statLabel}>Заявок на рассмотрении</Text>
            </Card>
            <Card style={styles.statCard}>
              <Text style={styles.statValue}>{totalConfirmed}</Text>
              <Text style={styles.statLabel}>Подтверждено участников</Text>
            </Card>
          </View>

          <View style={styles.quickActions}>
            <Button
              title="Создать игру"
              onPress={() => setCreatingGame(true)}
              disabled={organizerProjects.length === 0}
              style={styles.flexButton}
            />
            {nearestGame ? (
              <Button title="Текущая игра" variant="secondary" onPress={() => setSelectedGameId(nearestGame.id)} style={styles.flexButton} />
            ) : null}
          </View>
          {organizerProjects.length === 0 ? (
            <Text style={styles.hint}>
              Чтобы создавать игры, сначала станьте организатором проекта — попросите админа назначить вас во
              вкладке проекта.
            </Text>
          ) : null}

          <Text style={styles.sectionTitle}>Ближайшие игры</Text>
          {upcomingGames.length === 0 ? (
            <Text style={styles.label}>Ближайших игр нет</Text>
          ) : (
            <View style={styles.cardsList}>
              {upcomingGames.map((game) => (
                <GameRow key={game.id} game={game} stats={statsByGame[game.id]} onPress={() => setSelectedGameId(game.id)} />
              ))}
            </View>
          )}
        </>
      ) : (
        <>
          <Button
            title="Создать игру"
            onPress={() => setCreatingGame(true)}
            disabled={organizerProjects.length === 0}
            style={styles.createGameButton}
          />
          {allGames.length === 0 ? (
            <Text style={styles.label}>Игр пока нет</Text>
          ) : (
            <View style={styles.cardsList}>
              {allGames.map((game) => (
                <GameRow key={game.id} game={game} stats={statsByGame[game.id]} onPress={() => setSelectedGameId(game.id)} />
              ))}
            </View>
          )}
        </>
      )}
    </ScrollView>
  );
}

function GameRow({ game, stats, onPress }: { game: GameWithRelations; stats?: GameStats; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`Открыть игру ${game.name}`}>
      <Card>
        <View style={styles.gameRowTop}>
          <Text style={styles.cardTitle}>{game.name}</Text>
          <Text style={styles.gameStatus}>{gameStatusLabel(game)}</Text>
        </View>
        <Text style={styles.label}>
          {game.project?.name ?? ''} · {game.polygon?.name ?? '—'}
        </Text>
        {game.starts_at ? <Text style={styles.label}>{new Date(game.starts_at).toLocaleString()}</Text> : null}
        <Text style={styles.label}>
          Сторон: {stats?.sideCount ?? 0} · Участников: {stats?.participantCount ?? 0}
        </Text>
      </Card>
    </Pressable>
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
    marginBottom: spacing.sm + 2,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: spacing.md,
  },
  statCard: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  statValue: {
    fontFamily: font.heading,
    fontSize: 28,
    color: colors.text,
  },
  statLabel: {
    fontFamily: font.body,
    fontSize: 11.5,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: 2,
  },
  quickActions: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: spacing.sm,
  },
  flexButton: {
    flex: 1,
  },
  createGameButton: {
    marginBottom: spacing.md,
  },
  hint: {
    fontFamily: font.body,
    fontSize: 12.5,
    color: colors.textDim,
    marginBottom: spacing.md,
  },
  sectionTitle: {
    fontFamily: font.heading,
    fontSize: 16,
    color: colors.text,
    marginTop: spacing.lg,
    marginBottom: spacing.sm + 2,
  },
  cardsList: {
    gap: 10,
  },
  gameRowTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardTitle: {
    fontFamily: font.bodyBold,
    fontSize: 14,
    color: colors.text,
    flex: 1,
  },
  gameStatus: {
    fontFamily: font.bodySemiBold,
    fontSize: 11,
    color: colors.accent,
  },
  label: {
    fontFamily: font.body,
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 4,
  },
  error: {
    fontFamily: font.body,
    color: colors.danger,
    marginBottom: spacing.md,
  },
});
