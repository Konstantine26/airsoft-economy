import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { supabase } from '../lib/supabase';
import type { TraderGame } from '../hooks/useCapabilities';
import type { Game, Polygon, Project } from '../lib/database.types';
import { Card } from './Card';
import { Button } from './Button';
import { TasksSection } from './TasksSection';
import { TraderChargeSection } from './TraderChargeSection';
import { RevivalModal } from './RevivalModal';
import { colors, font, spacing } from '../lib/theme';

type GameWithRelations = Game & { project: Project | null; polygon: Polygon | null };

type Props = {
  traderGames: TraderGame[];
  activeProjectId: string | null;
};

export function TraderScreen({ traderGames, activeProjectId }: Props) {
  const [loading, setLoading] = useState(true);
  const [games, setGames] = useState<GameWithRelations[]>([]);
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);
  const [revivalModalOpen, setRevivalModalOpen] = useState(false);

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

  if (selectedGameId) {
    const sideIds = traderGames.find((g) => g.gameId === selectedGameId)?.sideIds ?? [];
    const game = games.find((g) => g.id === selectedGameId);
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <Pressable onPress={() => setSelectedGameId(null)}>
          <Text style={styles.back}>‹ Игры</Text>
        </Pressable>
        <Text style={styles.title}>{game?.name}</Text>
        <TraderChargeSection gameId={selectedGameId} projectId={game?.project_id ?? null} sideIds={sideIds} />
        {game?.revival_enabled && game.project_id ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Воскрешение</Text>
            <Button title="Возродить участника" onPress={() => setRevivalModalOpen(true)} />
          </View>
        ) : null}
        <TasksSection gameId={selectedGameId} traderSideIds={sideIds} />
        {game?.revival_enabled && game.project_id ? (
          <RevivalModal
            visible={revivalModalOpen}
            projectId={game.project_id}
            gameId={selectedGameId}
            sideIds={sideIds}
            onClose={() => setRevivalModalOpen(false)}
            onSuccess={() => setRevivalModalOpen(false)}
          />
        ) : null}
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Торговец</Text>
      {games.length === 0 ? (
        <Text style={styles.label}>
          {traderGames.length === 0 ? 'Вы пока не назначены торговцем ни на одну игру' : 'Нет игр в этом проекте'}
        </Text>
      ) : (
        <View style={styles.cardsList}>
          {games.map((game) => (
            <Pressable key={game.id} onPress={() => setSelectedGameId(game.id)}>
              <Card>
                <Text style={styles.cardTitle}>{game.name}</Text>
                <Text style={styles.label}>{game.project?.name ?? ''}</Text>
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
  back: {
    fontFamily: font.body,
    color: colors.textMuted,
    marginBottom: spacing.sm,
  },
  title: {
    fontFamily: font.heading,
    fontSize: 19,
    color: colors.text,
    marginBottom: spacing.md,
  },
  cardsList: {
    gap: 10,
  },
  section: {
    marginTop: spacing.lg,
  },
  sectionTitle: {
    fontFamily: font.heading,
    fontSize: 16,
    color: colors.text,
    marginBottom: spacing.sm + 2,
  },
  cardTitle: {
    fontFamily: font.bodyBold,
    fontSize: 14,
    color: colors.text,
  },
  label: {
    fontFamily: font.body,
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 4,
  },
});
