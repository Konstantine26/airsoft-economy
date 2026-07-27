import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { supabase } from '../lib/supabase';
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
import { PolygonMapThumbnails } from './PolygonMapThumbnails';
import { colors, font, radii, spacing } from '../lib/theme';

const POLYGON_TYPE_LABEL: Record<PolygonType, string> = {
  built_up: 'Застройка',
  forest: 'Лес',
  field: 'Поле',
  sqb: 'SQB',
  mixed: 'Смешанный',
};

type GameWithRelations = Game & { project: Project | null; polygon: Polygon | null };
type RosterRow = { id: string; profile_id: string; full_name: string; avatar_url: string | null };

type Props = {
  gameId: string;
  ownMembership: (TeamMember & { team: Team }) | null;
  onClose: () => void;
};

export function GameCardScreen({ gameId, ownMembership, onClose }: Props) {
  const { profile } = useAuth();
  const isCommander = !!ownMembership && ownMembership.team.commander_id === profile?.id;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [game, setGame] = useState<GameWithRelations | null>(null);
  const [stages, setStages] = useState<GameStage[]>([]);
  const [attachments, setAttachments] = useState<GameAttachment[]>([]);
  const [sides, setSides] = useState<GameSide[]>([]);
  const [teamSideId, setTeamSideId] = useState<string | null>(null);
  const [noTeamSideId, setNoTeamSideId] = useState<string | null>(null);
  const [myStatus, setMyStatus] = useState<GameParticipantStatus | null>(null);
  const [roster, setRoster] = useState<RosterRow[]>([]);
  const [registered, setRegistered] = useState<Map<string, GameParticipantStatus>>(new Map());
  const [selectedProfileIds, setSelectedProfileIds] = useState<Set<string>>(new Set());
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

    if (profile) {
      const { data } = await supabase
        .from('game_participants')
        .select('status, side_id')
        .eq('game_id', gameId)
        .eq('profile_id', profile.id)
        .maybeSingle();
      setMyStatus(data?.status ?? null);
      setNoTeamSideId(data?.side_id ?? null);
    }

    if (ownMembership) {
      const [teamSideRes, rosterRes, participantsRes] = await Promise.all([
        supabase
          .from('game_team_sides')
          .select('side_id')
          .eq('game_id', gameId)
          .eq('team_id', ownMembership.team_id)
          .maybeSingle(),
        supabase
          .from('team_members')
          .select('id, profile_id, profile:profiles(full_name, avatar_url)')
          .eq('team_id', ownMembership.team_id),
        supabase
          .from('game_participants')
          .select('profile_id, status')
          .eq('game_id', gameId)
          .eq('team_id', ownMembership.team_id),
      ]);
      setTeamSideId(teamSideRes.data?.side_id ?? null);
      const rosterRows: RosterRow[] = (rosterRes.data ?? []).map((row: any) => ({
        id: row.id,
        profile_id: row.profile_id,
        full_name: row.profile?.full_name || '(без имени)',
        avatar_url: row.profile?.avatar_url ?? null,
      }));
      setRoster(rosterRows);
      setRegistered(new Map((participantsRes.data ?? []).map((r) => [r.profile_id, r.status])));
    }
    setLoading(false);
  }, [gameId, ownMembership, profile]);

  useEffect(() => {
    load();
  }, [load]);

  const pickSide = async (sideId: string) => {
    if (!ownMembership) return;
    setError(null);
    const { error } = await supabase
      .from('game_team_sides')
      .upsert({ game_id: gameId, team_id: ownMembership.team_id, side_id: sideId }, { onConflict: 'game_id,team_id' });
    if (error) {
      setError(error.message);
      return;
    }
    setTeamSideId(sideId);
  };

  const toggleSelected = (profileId: string) => {
    setSelectedProfileIds((prev) => {
      const next = new Set(prev);
      if (next.has(profileId)) next.delete(profileId);
      else next.add(profileId);
      return next;
    });
  };

  const selectAllRoster = () => {
    setSelectedProfileIds(new Set(roster.filter((r) => !registered.has(r.profile_id)).map((r) => r.profile_id)));
  };

  const register = async () => {
    if (!profile) return;
    setError(null);

    if (isCommander) {
      if (!ownMembership || !teamSideId) return;
      const rows = Array.from(selectedProfileIds)
        .filter((id) => !registered.has(id))
        .map((profile_id) => ({ game_id: gameId, team_id: ownMembership.team_id, profile_id }));
      if (rows.length === 0) return;

      setSubmitting(true);
      const { error } = await supabase.from('game_participants').insert(rows);
      setSubmitting(false);
      if (error) {
        setError(error.message);
        return;
      }
      setRegistered((prev) => {
        const next = new Map(prev);
        for (const row of rows) next.set(row.profile_id, 'pending');
        return next;
      });
      setSelectedProfileIds(new Set());
      return;
    }

    if (myStatus) return;

    if (ownMembership) {
      if (!teamSideId) return;
      setSubmitting(true);
      const { error } = await supabase
        .from('game_participants')
        .insert({ game_id: gameId, team_id: ownMembership.team_id, profile_id: profile.id });
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
    const { error } = await supabase
      .from('game_participants')
      .insert({ game_id: gameId, team_id: null, profile_id: profile.id, side_id: noTeamSideId });
    setSubmitting(false);
    if (error) {
      setError(error.message);
      return;
    }
    setMyStatus('pending');
  };

  const alreadyRegistered = !!myStatus;
  const canRegister =
    rulesAccepted &&
    (isCommander
      ? !!teamSideId && selectedProfileIds.size > 0
      : ownMembership
        ? !!teamSideId && !alreadyRegistered
        : !!noTeamSideId && !alreadyRegistered);

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
        <Pressable onPress={onClose}>
          <Text style={styles.back}>‹ Назад</Text>
        </Pressable>
        {error ? <Text style={styles.error}>{error}</Text> : <Text style={styles.label}>Игра не найдена</Text>}
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Pressable onPress={onClose}>
        <Text style={styles.back}>‹ Назад</Text>
      </Pressable>

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

      {stages.length > 0 ? (
        <>
          <Text style={styles.sectionTitle}>Этапы</Text>
          <GameStagesList stages={stages} />
        </>
      ) : null}

      {attachments.length > 0 ? (
        <>
          <Text style={styles.sectionTitle}>Файлы</Text>
          <GameAttachmentsGrid attachments={attachments} />
        </>
      ) : null}

      <Text style={styles.sectionTitle}>Регистрация</Text>
      <Pressable style={styles.checkboxRow} onPress={() => setRulesAccepted((v) => !v)}>
        <View style={[styles.checkbox, rulesAccepted && styles.checkboxChecked]} />
        <Text style={styles.checkboxLabel}>Ознакомлен и согласен с правилами игры</Text>
      </Pressable>

      {ownMembership ? (
        <>
          <Text style={styles.label}>Сторона команды {ownMembership.team.name}</Text>
          {isCommander ? (
            <View style={styles.chips}>
              {sides.map((side) => (
                <Chip key={side.id} label={side.name} selected={teamSideId === side.id} onPress={() => pickSide(side.id)} />
              ))}
            </View>
          ) : (
            <Text style={styles.label}>
              {teamSideId ? (sides.find((s) => s.id === teamSideId)?.name ?? '—') : 'Командир ещё не выбрал сторону'}
            </Text>
          )}

          {isCommander ? (
            <>
              <View style={styles.rosterHeader}>
                <Text style={styles.label}>Состав на игру</Text>
                <Pressable onPress={selectAllRoster}>
                  <Text style={styles.editLink}>Выбрать всю команду</Text>
                </Pressable>
              </View>
              <View style={styles.rosterList}>
                {roster.map((row) => {
                  const status = registered.get(row.profile_id);
                  const selected = selectedProfileIds.has(row.profile_id);
                  return (
                    <Pressable
                      key={row.id}
                      style={styles.rosterRow}
                      disabled={!!status}
                      onPress={() => toggleSelected(row.profile_id)}
                    >
                      <View style={styles.rosterIdentity}>
                        <Avatar uri={row.avatar_url} name={row.full_name} size={22} />
                        <Text style={styles.rosterName}>{row.full_name}</Text>
                      </View>
                      <Text
                        style={
                          status === 'confirmed'
                            ? styles.statusConfirmed
                            : status === 'pending'
                              ? styles.statusPending
                              : selected
                                ? styles.statusSelected
                                : styles.statusOff
                        }
                      >
                        {status === 'confirmed'
                          ? 'Подтверждён'
                          : status === 'pending'
                            ? 'На подтверждении'
                            : selected
                              ? 'Выбран'
                              : 'Не выбран'}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </>
          ) : (
            <Text style={styles.label}>
              {alreadyRegistered
                ? myStatus === 'confirmed'
                  ? 'Вы подтверждены на игру'
                  : 'Заявка подана, ожидает подтверждения'
                : 'Вы ещё не зарегистрированы'}
            </Text>
          )}
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

      <Button
        title={submitting ? 'Отправка…' : 'Зарегистрироваться'}
        onPress={register}
        disabled={!canRegister || submitting}
        style={styles.registerButton}
      />
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
  rosterHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  rosterList: {
    gap: spacing.sm,
    marginTop: 6,
  },
  rosterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radii.lg,
    padding: 12,
  },
  rosterIdentity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  rosterName: {
    fontFamily: font.bodySemiBold,
    fontSize: 13.5,
    color: colors.text,
  },
  statusConfirmed: {
    fontFamily: font.body,
    color: colors.success,
    fontSize: 11,
  },
  statusPending: {
    fontFamily: font.body,
    color: colors.accent,
    fontSize: 11,
  },
  statusSelected: {
    fontFamily: font.bodySemiBold,
    color: colors.accent,
    fontSize: 11,
  },
  statusOff: {
    fontFamily: font.body,
    color: colors.textDim,
    fontSize: 11,
  },
  registerButton: {
    marginTop: spacing.lg,
    marginBottom: spacing.xl,
  },
  editLink: {
    fontFamily: font.bodySemiBold,
    color: colors.accent,
    fontSize: 12.5,
  },
  error: {
    fontFamily: font.body,
    color: colors.danger,
    marginBottom: spacing.md,
  },
});
