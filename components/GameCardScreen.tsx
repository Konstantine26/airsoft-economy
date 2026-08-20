import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { supabase } from '../lib/supabase';
import { confirmAsync } from '../lib/confirm';
import { withRetry } from '../lib/retry';
import { useAuth } from '../contexts/AuthContext';
import type {
  Game,
  GameAttachment,
  GameParticipantStatus,
  GameSide,
  GameStage,
  Polygon,
  PolygonType,
  Project,
  Team,
  TeamMember,
} from '../lib/database.types';
import { GAME_TYPE_LABEL } from '../lib/gameTypes';
import { Avatar } from './Avatar';
import { Card } from './Card';
import { Chip } from './Chip';
import { Button } from './Button';
import { GameStagesList } from './GameStagesList';
import { GameAttachmentsGrid } from './GameAttachmentsGrid';
import { GameResultsSummary } from './GameResultsSummary';
import { PolygonMapThumbnails } from './PolygonMapThumbnails';
import { TasksSection } from './TasksSection';
import { colors, font, radii, spacing } from '../lib/theme';

const POLYGON_TYPE_LABEL: Record<PolygonType, string> = {
  built_up: 'Застройка',
  forest: 'Лес',
  field: 'Поле',
  sqb: 'SQB',
  mixed: 'Смешанный',
};

type GameWithRelations = Game & { project: Project | null; polygon: Polygon | null };
type SideRosterRow = { id: string; full_name: string; avatar_url: string | null; team_name: string };

type Props = {
  gameId: string;
  ownMembership: (TeamMember & { team: Team }) | null;
  onClose?: () => void;
  showRegistration?: boolean;
  onEndGame?: () => void;
};

export function GameCardScreen({ gameId, ownMembership, onClose, showRegistration = true, onEndGame }: Props) {
  const { profile } = useAuth();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [game, setGame] = useState<GameWithRelations | null>(null);
  const [stages, setStages] = useState<GameStage[]>([]);
  const [attachments, setAttachments] = useState<GameAttachment[]>([]);
  const [sides, setSides] = useState<GameSide[]>([]);
  const [teamSideId, setTeamSideId] = useState<string | null>(null);
  const [noTeamSideId, setNoTeamSideId] = useState<string | null>(null);
  const [myStatus, setMyStatus] = useState<GameParticipantStatus | null>(null);
  const [sideRoster, setSideRoster] = useState<SideRosterRow[]>([]);
  const [rulesAccepted, setRulesAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [gameRes, stagesRes, attachmentsRes, sidesRes] = await Promise.all([
      supabase.from('games').select('*, project:projects(*), polygon:polygons(*)').eq('id', gameId).single(),
      supabase.from('game_stages').select('*').eq('game_id', gameId).order('position', { ascending: true }),
      supabase
        .from('game_attachments')
        .select('*')
        .eq('game_id', gameId)
        .order('created_at', { ascending: false }),
      supabase.from('game_sides').select('*').eq('game_id', gameId).order('name', { ascending: true }),
    ]);
    if (gameRes.error) setError(gameRes.error.message);
    setGame((gameRes.data as GameWithRelations) ?? null);
    setStages(stagesRes.data ?? []);
    setAttachments(attachmentsRes.data ?? []);
    setSides(sidesRes.data ?? []);

    let myStatusValue: GameParticipantStatus | null = null;
    let noTeamSideValue: string | null = null;
    if (profile) {
      const { data } = await supabase
        .from('game_participants')
        .select('status, side_id')
        .eq('game_id', gameId)
        .eq('profile_id', profile.id)
        .maybeSingle();
      myStatusValue = data?.status ?? null;
      noTeamSideValue = data?.side_id ?? null;
      setMyStatus(myStatusValue);
      setNoTeamSideId(noTeamSideValue);
    }

    let teamSideValue: string | null = null;
    if (ownMembership) {
      const { data } = await supabase
        .from('game_team_sides')
        .select('side_id')
        .eq('game_id', gameId)
        .eq('team_id', ownMembership.team_id)
        .maybeSingle();
      teamSideValue = data?.side_id ?? null;
      setTeamSideId(teamSideValue);
    }

    const effectiveSideId = noTeamSideValue ?? teamSideValue;
    const shouldShowSide = myStatusValue === 'confirmed' || (myStatusValue === 'pending' && !!effectiveSideId);
    if (shouldShowSide && effectiveSideId) {
      const [teamSidesRes, participantsRes] = await Promise.all([
        supabase.from('game_team_sides').select('team_id, side_id').eq('game_id', gameId),
        supabase
          .from('game_participants')
          .select('id, side_id, team_id, team:teams(name), profile:profiles(full_name, avatar_url)')
          .eq('game_id', gameId)
          .neq('status', 'rejected'),
      ]);
      const teamSideMap = new Map<string, string>();
      for (const row of teamSidesRes.data ?? []) {
        teamSideMap.set(row.team_id, row.side_id);
      }
      const rows: SideRosterRow[] = ((participantsRes.data as any[]) ?? [])
        .filter((row) => (row.side_id ?? teamSideMap.get(row.team_id) ?? null) === effectiveSideId)
        .map((row) => ({
          id: row.id,
          full_name: row.profile?.full_name || '(без имени)',
          avatar_url: row.profile?.avatar_url ?? null,
          team_name: row.team?.name ?? '',
        }));
      setSideRoster(rows);
    } else {
      setSideRoster([]);
    }

    setLoading(false);
  }, [gameId, ownMembership, profile]);

  useEffect(() => {
    load();
  }, [load]);

  const register = async () => {
    if (!profile) return;
    setError(null);

    if (myStatus === 'pending' || myStatus === 'confirmed') return;

    if (myStatus === 'rejected') {
      // A rejected row sticks around as history (see 025_reject_game_participant.sql)
      // instead of being deleted, so re-applying has to clear it first or the
      // unique (game_id, profile_id) constraint blocks the insert below.
      const { error: cleanupError } = await supabase
        .from('game_participants')
        .delete()
        .eq('game_id', gameId)
        .eq('profile_id', profile.id);
      if (cleanupError) {
        setError(cleanupError.message);
        return;
      }
    }

    if (ownMembership) {
      if (!teamSideId) return;
      setSubmitting(true);
      const { error } = await withRetry(() =>
        supabase.from('game_participants').insert({ game_id: gameId, team_id: ownMembership.team_id, profile_id: profile.id })
      );
      setSubmitting(false);
      if (error) {
        setError(error.message);
        return;
      }
      setMyStatus('pending');
      return;
    }

    if (!noTeamSideId) return;
    setSubmitting(true);
    const { error } = await withRetry(() =>
      supabase.from('game_participants').insert({ game_id: gameId, team_id: null, profile_id: profile.id, side_id: noTeamSideId })
    );
    setSubmitting(false);
    if (error) {
      setError(error.message);
      return;
    }
    setMyStatus('pending');
  };

  const cancelApplication = async () => {
    if (!profile) return;
    setError(null);
    const { error } = await supabase
      .from('game_participants')
      .delete()
      .eq('game_id', gameId)
      .eq('profile_id', profile.id);
    if (error) {
      setError(error.message);
      return;
    }
    setMyStatus(null);
    setSideRoster([]);
  };

  const handleEndGame = async () => {
    const ok = await confirmAsync(
      'Окончить игру?',
      'Это вернёт на главный экран и снимет блокировку выбора проекта.',
      'Окончить'
    );
    if (!ok) return;
    onEndGame?.();
  };

  const handleCancelPress = async () => {
    if (myStatus === 'confirmed') {
      const ok = await confirmAsync(
        'Отменить заявку?',
        'Вы уже подтверждены организатором на эту игру. Отменить заявку?',
        'Отменить'
      );
      if (!ok) return;
    }
    cancelApplication();
  };

  const alreadyRegistered = myStatus === 'pending' || myStatus === 'confirmed';
  const canRegister =
    rulesAccepted && (ownMembership ? !!teamSideId && !alreadyRegistered : !!noTeamSideId && !alreadyRegistered);
  const ended = !!game?.ends_at && new Date(game.ends_at).getTime() <= Date.now();

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (!game) {
    return (
      <View style={styles.container}>
        {onEndGame ? (
          <Button title="Окончить игру" variant="danger" onPress={handleEndGame} style={styles.endGameButton} />
        ) : (
          <Pressable onPress={onClose}>
            <Text style={styles.back}>‹ Назад</Text>
          </Pressable>
        )}
        {error ? <Text style={styles.error}>{error}</Text> : <Text style={styles.label}>Игра не найдена</Text>}
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {onEndGame ? (
        <Button title="Окончить игру" variant="danger" onPress={handleEndGame} style={styles.endGameButton} />
      ) : (
        <Pressable onPress={onClose}>
          <Text style={styles.back}>‹ Назад</Text>
        </Pressable>
      )}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Text style={styles.title}>{game.name}</Text>
      {game.game_type ? <Text style={styles.badge}>{GAME_TYPE_LABEL[game.game_type]}</Text> : null}
      {game.starts_at ? (
        <Text style={styles.subtitle}>
          Начало: {new Date(game.starts_at).toLocaleString()}
          {game.ends_at ? ` · Окончание: ${new Date(game.ends_at).toLocaleString()}` : ''}
        </Text>
      ) : null}

      <Text style={styles.sectionTitle}>Полигон</Text>
      {game.polygon ? (
        <Card>
          <Text style={styles.cardTitle}>{game.polygon.name}</Text>
          <Text style={styles.label}>{locationLine(game.polygon)}</Text>
          <Text style={styles.label}>Тип: {POLYGON_TYPE_LABEL[game.polygon.type]}</Text>
          <PolygonMapThumbnails polygonId={game.polygon.id} />
        </Card>
      ) : (
        <Text style={styles.label}>Полигон не выбран</Text>
      )}

      {game.description ? (
        <>
          <Text style={styles.sectionTitle}>Сценарий</Text>
          <Text style={styles.label}>{game.description}</Text>
        </>
      ) : null}

      {!ended && stages.length > 0 ? (
        <>
          <Text style={styles.sectionTitle}>Этапы</Text>
          <GameStagesList stages={stages} />
        </>
      ) : null}

      {!ended && attachments.length > 0 ? (
        <>
          <Text style={styles.sectionTitle}>Файлы</Text>
          <GameAttachmentsGrid attachments={attachments} />
        </>
      ) : null}

      {ended ? <GameResultsSummary gameId={gameId} stages={stages} attachments={attachments} /> : null}

      {!ended && showRegistration ? (
        <>
          <Text style={styles.sectionTitle}>Регистрация</Text>
          <Pressable
            style={styles.checkboxRow}
            onPress={() => setRulesAccepted((v) => !v)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: rulesAccepted }}
            accessibilityLabel="Ознакомлен и согласен с правилами игры"
          >
            <View style={[styles.checkbox, rulesAccepted && styles.checkboxChecked]} />
            <Text style={styles.checkboxLabel}>Ознакомлен и согласен с правилами игры</Text>
          </Pressable>

          {ownMembership ? (
            <>
              <Text style={styles.label}>Сторона команды {ownMembership.team.name}</Text>
              <Text style={styles.label}>
                {teamSideId ? (sides.find((s) => s.id === teamSideId)?.name ?? '—') : 'Командир ещё не выбрал сторону'}
              </Text>
              <Text style={styles.label}>
                {alreadyRegistered
                  ? myStatus === 'confirmed'
                    ? 'Вы подтверждены на игру'
                    : 'Заявка подана, ожидает подтверждения'
                  : 'Вы ещё не зарегистрированы'}
              </Text>
            </>
          ) : (
            <>
              <Text style={styles.label}>Сторона</Text>
              <View style={styles.chips}>
                {sides.map((side) => (
                  <Chip key={side.id} label={side.name} selected={noTeamSideId === side.id} onPress={() => setNoTeamSideId(side.id)} />
                ))}
              </View>
              <Text style={styles.label}>
                {alreadyRegistered
                  ? myStatus === 'confirmed'
                    ? 'Вы подтверждены на игру'
                    : 'Заявка подана, ожидает подтверждения'
                  : 'Вы ещё не зарегистрированы'}
              </Text>
            </>
          )}

          {alreadyRegistered ? (
            <Button title="Отменить заявку" variant="danger" onPress={handleCancelPress} style={styles.registerButton} />
          ) : (
            <Button
              title={submitting ? 'Отправка…' : 'Зарегистрироваться'}
              onPress={register}
              disabled={!canRegister || submitting}
              style={styles.registerButton}
            />
          )}
        </>
      ) : null}

      {!ended && alreadyRegistered && (noTeamSideId || teamSideId) ? (
        <>
          <Text style={styles.sectionTitle}>
            Состав стороны{sides.find((s) => s.id === (noTeamSideId ?? teamSideId))?.name
              ? ` «${sides.find((s) => s.id === (noTeamSideId ?? teamSideId))?.name}»`
              : ''}
          </Text>
          {sideRoster.length === 0 ? (
            <Text style={styles.label}>Пока никого</Text>
          ) : (
            <View style={styles.rosterList}>
              {sideRoster.map((row) => (
                <View key={row.id} style={styles.sideRosterRow}>
                  <Avatar uri={row.avatar_url} name={row.full_name} size={26} />
                  <Text style={styles.rosterName}>
                    {row.full_name}
                    {row.team_name ? ` · ${row.team_name}` : ''}
                  </Text>
                </View>
              ))}
            </View>
          )}

          <Text style={styles.sectionTitle}>Задания</Text>
          <TasksSection gameId={gameId} splitClaimable />
        </>
      ) : null}
    </ScrollView>
  );
}

function locationLine(p: Polygon) {
  return [p.country, p.region, p.city, p.address].filter(Boolean).join(', ') || 'Расположение не указано';
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
  endGameButton: {
    marginBottom: spacing.md,
  },
  title: {
    fontFamily: font.heading,
    fontSize: 20,
    color: colors.text,
  },
  badge: {
    fontFamily: font.bodySemiBold,
    fontSize: 11,
    color: colors.accent,
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: colors.accentSoftBorder,
    borderRadius: radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 3,
    alignSelf: 'flex-start',
    marginTop: 6,
    overflow: 'hidden',
  },
  subtitle: {
    fontFamily: font.body,
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 6,
  },
  sectionTitle: {
    fontFamily: font.heading,
    fontSize: 16,
    color: colors.text,
    marginTop: spacing.lg,
    marginBottom: spacing.sm + 2,
  },
  cardTitle: {
    fontFamily: font.bodySemiBold,
    fontSize: 14,
    color: colors.text,
  },
  label: {
    fontFamily: font.body,
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 4,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: radii.sm / 2,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.card,
  },
  checkboxChecked: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  checkboxLabel: {
    fontFamily: font.body,
    fontSize: 13.5,
    color: colors.text,
    flex: 1,
  },
  rosterList: {
    gap: spacing.sm,
    marginTop: 6,
  },
  sideRosterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radii.lg,
    padding: 12,
  },
  rosterName: {
    fontFamily: font.bodySemiBold,
    fontSize: 13.5,
    color: colors.text,
  },
  registerButton: {
    marginTop: spacing.lg,
    marginBottom: spacing.xl,
  },
  error: {
    fontFamily: font.body,
    color: colors.danger,
    marginBottom: spacing.md,
  },
});
