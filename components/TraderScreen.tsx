import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { supabase } from '../lib/supabase';
import type { TraderGame } from '../hooks/useCapabilities';
import type { Game, Polygon, Project } from '../lib/database.types';
import { formatDateTime } from '../lib/format';
import { EmptyState } from './EmptyState';
import { ListRow } from './ListRow';
import { ScreenHeader } from './ScreenHeader';
import { Segmented } from './Segmented';
import { TasksSection } from './TasksSection';
import { TraderDesk } from './TraderDesk';
import { colors, font, radii, spacing } from '../lib/theme';

type GameWithRelations = Game & { project: Project | null; polygon: Polygon | null };
type View_ = 'desk' | 'tasks';

type Props = {
  traderGames: TraderGame[];
  activeProjectId: string | null;
};

export function TraderScreen({ traderGames, activeProjectId }: Props) {
  const [loading, setLoading] = useState(true);
  const [games, setGames] = useState<GameWithRelations[]>([]);
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);
  const [view, setView] = useState<View_>('desk');

  const load = useCallback(async () => {
    setLoading(true);
    const gameIds = traderGames.map((g) => g.gameId);
    if (gameIds.length === 0) {
      setGames([]);
      setLoading(false);
      return;
    }
    const { data } = await supabase
      .from('games')
      .select('*, project:projects(*), polygon:polygons(*)')
      .in('id', gameIds)
      .eq('status', 'published')
      .order('created_at', { ascending: false });
    const rows = ((data as GameWithRelations[]) ?? []).filter((g) => g.project_id === activeProjectId);
    setGames(rows);
    // A trader is usually on exactly one game: skip the list and open the
    // counter straight away.
    setSelectedGameId((prev) => (prev && rows.some((g) => g.id === prev) ? prev : rows.length === 1 ? rows[0].id : null));
    setLoading(false);
  }, [traderGames, activeProjectId]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  const game = games.find((g) => g.id === selectedGameId);

  if (game) {
    const sideIds = traderGames.find((g) => g.gameId === game.id)?.sideIds ?? [];
    const economyProjectId = game.project?.economy_enabled ? game.project_id : null;
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.gameContent} keyboardShouldPersistTaps="handled">
        <ScreenHeader
          title={game.name}
          backLabel={games.length > 1 ? 'Игры' : undefined}
          onBack={games.length > 1 ? () => setSelectedGameId(null) : undefined}
        />
        <View style={styles.inset}>
          <Segmented
            items={[
              { key: 'desk', label: 'Касса' },
              { key: 'tasks', label: 'Задания' },
            ]}
            value={view}
            onChange={setView}
          />
          {view === 'desk' ? (
            <TraderDesk
              gameId={game.id}
              projectId={economyProjectId}
              sideIds={sideIds}
              revivalEnabled={game.revival_enabled}
            />
          ) : (
            <TasksSection gameId={game.id} traderSideIds={sideIds} />
          )}
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.listContent}>
      <Text style={styles.title}>Торговля</Text>
      {games.length === 0 ? (
        <EmptyState
          icon="storefront-outline"
          title={traderGames.length === 0 ? 'Вы пока не торговец' : 'В этом проекте нет ваших игр'}
          message={
            traderGames.length === 0
              ? 'Организатор назначает торговцев в карточке игры. После назначения здесь откроется касса.'
              : 'Переключите проект в плашке сверху — ваши игры могут быть в другом.'
          }
        />
      ) : (
        <View style={styles.group}>
          {games.map((g, i) => (
            <ListRow
              key={g.id}
              title={g.name}
              subtitle={g.starts_at ? formatDateTime(g.starts_at) : (g.project?.name ?? null)}
              divider={i < games.length - 1}
              onPress={() => setSelectedGameId(g.id)}
            />
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
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
  },
  gameContent: {
    paddingTop: spacing.sm,
    paddingBottom: spacing.xxxl,
  },
  inset: {
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  listContent: {
    padding: spacing.lg,
    paddingBottom: spacing.xxxl,
    gap: spacing.md,
  },
  title: {
    fontFamily: font.heading,
    fontSize: 26,
    lineHeight: 32,
    color: colors.text,
  },
  group: {
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.md + 2,
  },
});
