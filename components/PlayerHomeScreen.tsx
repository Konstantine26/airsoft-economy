import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import type { Game, Project, Team, TeamMember } from '../lib/database.types';
import { Card } from './Card';
import { Button } from './Button';
import { GameCardScreen } from './GameCardScreen';
import { colors, font, spacing } from '../lib/theme';

type Props = {
  ownMembership: (TeamMember & { team: Team }) | null;
  onGoToGames: () => void;
  onOpenGame: (game: { id: string; project_id: string }) => void;
};

type ConfirmedGame = Game & { project: Project | null };

export function PlayerHomeScreen({ ownMembership, onGoToGames, onOpenGame }: Props) {
  const { profile } = useAuth();
  const [nextGame, setNextGame] = useState<ConfirmedGame | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [openGameId, setOpenGameId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!profile) {
      setNextGame(null);
      return;
    }
    const { data } = await supabase
      .from('game_participants')
      .select('game:games(*, project:projects(*))')
      .eq('profile_id', profile.id)
      .eq('status', 'confirmed');
    const now = Date.now();
    const games = ((data ?? []) as any[])
      .map((row) => row.game as ConfirmedGame | null)
      .filter((g): g is ConfirmedGame => !!g && (!g.ends_at || new Date(g.ends_at).getTime() > now))
      .sort((a, b) => (a.starts_at ?? '').localeCompare(b.starts_at ?? ''));
    setNextGame(games[0] ?? null);
  }, [profile]);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (openGameId) {
    return (
      <GameCardScreen
        gameId={openGameId}
        ownMembership={ownMembership}
        onClose={() => setOpenGameId(null)}
        showRegistration={false}
      />
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} colors={[colors.accent]} />}
    >
      <Text style={styles.title}>Главная</Text>

      {nextGame ? (
        <Card style={styles.nextGameCard}>
          <Text style={styles.label}>Ближайшая игра</Text>
          <Text style={styles.cardTitle}>{nextGame.name}</Text>
          <Text style={styles.meta}>{nextGame.project?.name ?? '—'}</Text>
          {nextGame.starts_at ? <Text style={styles.meta}>{new Date(nextGame.starts_at).toLocaleString()}</Text> : null}
          <Button
            title="Открыть игру"
            onPress={() => {
              onOpenGame({ id: nextGame.id, project_id: nextGame.project_id });
              setOpenGameId(nextGame.id);
            }}
            style={styles.goButton}
          />
          <Button title="Все игры" variant="secondary" onPress={onGoToGames} style={styles.goButton} />
        </Card>
      ) : (
        <Card style={styles.nextGameCard}>
          <Text style={styles.label}>Нет предстоящих игр</Text>
          <Button title="Все игры" variant="secondary" onPress={onGoToGames} style={styles.goButton} />
        </Card>
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
  nextGameCard: {
    gap: 4,
  },
  label: {
    fontFamily: font.body,
    fontSize: 12,
    color: colors.textMuted,
  },
  cardTitle: {
    fontFamily: font.bodyBold,
    fontSize: 16,
    color: colors.text,
    marginTop: 2,
  },
  meta: {
    fontFamily: font.body,
    fontSize: 12.5,
    color: colors.textMuted,
  },
  goButton: {
    marginTop: spacing.md,
  },
});
