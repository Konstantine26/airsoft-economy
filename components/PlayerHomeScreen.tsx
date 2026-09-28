import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import type { Game, Polygon, Project, Team, TeamMember } from '../lib/database.types';
import { Button } from './Button';
import { EmptyState } from './EmptyState';
import { GameCardScreen } from './GameCardScreen';
import { StatusPill } from './StatusPill';
import { GAME_TYPE_LABEL } from '../lib/gameTypes';
import { formatDateRange, formatRelative } from '../lib/format';
import { colors, font, radii, spacing } from '../lib/theme';

type Props = {
  ownMembership: (TeamMember & { team: Team }) | null;
  activeProjectId: string | null;
  onStartGame: (game: { id: string; project_id: string }) => void;
  onGoToGames: () => void;
  onOpenGame: (game: { id: string; project_id: string }) => void;
};

type ConfirmedGame = Game & { project: Project | null; polygon: Pick<Polygon, 'name' | 'city'> | null };

export function PlayerHomeScreen({ ownMembership, activeProjectId, onStartGame, onGoToGames, onOpenGame }: Props) {
  const { profile } = useAuth();
  const [nextGame, setNextGame] = useState<ConfirmedGame | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [openGameId, setOpenGameId] = useState<string | null>(null);
  const [, setTick] = useState(0);

  const load = useCallback(async () => {
    if (!profile) {
      setNextGame(null);
      return;
    }
    const { data } = await supabase
      .from('game_participants')
      .select('game:games(*, project:projects(*), polygon:polygons(name, city))')
      .eq('profile_id', profile.id)
      .eq('status', 'confirmed');
    const now = Date.now();
    const games = ((data ?? []) as any[])
      .map((row) => row.game as ConfirmedGame | null)
      .filter(
        (g): g is ConfirmedGame =>
          !!g && (!g.ends_at || new Date(g.ends_at).getTime() > now) && g.project_id === activeProjectId
      )
      .sort((a, b) => (a.starts_at ?? '').localeCompare(b.starts_at ?? ''));
    setNextGame(games[0] ?? null);
  }, [profile, activeProjectId]);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  // Keeps "через 1 ч 12 мин" current without a refetch.
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 60000);
    return () => clearInterval(timer);
  }, []);

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

  const started = !!nextGame?.starts_at && new Date(nextGame.starts_at).getTime() <= Date.now();
  const place = nextGame?.polygon ? [nextGame.polygon.name, nextGame.polygon.city].filter(Boolean).join(' · ') : null;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} colors={[colors.accent]} />}
    >
      <Text style={styles.eyebrow}>Ближайшая игра</Text>

      {nextGame ? (
        <View style={styles.hero}>
          <View style={styles.heroTop}>
            <StatusPill label="Подтверждён" tone="success" dot />
            {nextGame.game_type ? <Text style={styles.gameType}>{GAME_TYPE_LABEL[nextGame.game_type]}</Text> : null}
          </View>

          <Text style={styles.heroTitle}>{nextGame.name}</Text>

          <View style={styles.metaList}>
            {nextGame.starts_at ? (
              <MetaLine icon="calendar-month-outline" text={formatDateRange(nextGame.starts_at, nextGame.ends_at)} />
            ) : null}
            {place ? <MetaLine icon="map-marker-outline" text={place} /> : null}
            {ownMembership ? <MetaLine icon="account-group-outline" text={`Команда «${ownMembership.team.name}»`} /> : null}
          </View>

          {nextGame.starts_at ? (
            <View style={styles.countdown}>
              <Text style={styles.countdownLabel}>{started ? 'Игра началась' : 'Старт'}</Text>
              <Text style={styles.countdownValue}>{formatRelative(nextGame.starts_at)}</Text>
            </View>
          ) : null}

          <Button
            title="Приступить к игре"
            icon="play"
            size="lg"
            variant={started ? 'live' : 'primary'}
            onPress={() => onStartGame({ id: nextGame.id, project_id: nextGame.project_id })}
            accessibilityHint="Откроет экран игры с номером, QR-кодом и заданиями"
          />
          <Button
            title="Карточка игры"
            variant="ghost"
            onPress={() => {
              onOpenGame({ id: nextGame.id, project_id: nextGame.project_id });
              setOpenGameId(nextGame.id);
            }}
          />
        </View>
      ) : (
        <EmptyState
          icon="calendar-blank-outline"
          title="Нет подтверждённых игр"
          message="Подайте заявку на игру — после подтверждения организатором она появится здесь."
          actionLabel="Все игры"
          onAction={onGoToGames}
        />
      )}

      {nextGame ? <Button title="Все игры проекта" variant="secondary" icon="calendar-month-outline" onPress={onGoToGames} /> : null}
    </ScrollView>
  );
}

function MetaLine({ icon, text }: { icon: keyof typeof MaterialCommunityIcons.glyphMap; text: string }) {
  return (
    <View style={styles.metaLine}>
      <MaterialCommunityIcons name={icon} size={16} color={colors.textMuted} />
      <Text style={styles.metaText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxxl,
    gap: spacing.md,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
  },
  eyebrow: {
    fontFamily: font.bodySemiBold,
    fontSize: 12,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: colors.textDim,
  },
  hero: {
    backgroundColor: colors.teamGradientEnd,
    borderWidth: 1,
    borderColor: colors.teamGradientBorder,
    borderRadius: radii.lg,
    padding: spacing.lg,
    gap: spacing.md,
  },
  heroTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  gameType: {
    fontFamily: font.bodyMedium,
    fontSize: 13,
    color: colors.textMuted,
  },
  heroTitle: {
    fontFamily: font.heading,
    fontSize: 24,
    lineHeight: 30,
    color: colors.text,
  },
  metaList: {
    gap: 6,
  },
  metaLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  metaText: {
    flex: 1,
    fontFamily: font.body,
    fontSize: 14.5,
    color: colors.textMuted,
  },
  countdown: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.sm,
  },
  countdownLabel: {
    fontFamily: font.body,
    fontSize: 14,
    color: colors.textMuted,
  },
  countdownValue: {
    fontFamily: font.bodyBold,
    fontSize: 20,
    color: colors.text,
  },
});
