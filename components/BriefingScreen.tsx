import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import type { Game, GameAttachment, GameSide, GameStage, Polygon, PolygonType, Project } from '../lib/database.types';
import { GAME_TYPE_LABEL } from '../lib/gameTypes';
import { Avatar } from './Avatar';
import { Card } from './Card';
import { GameStagesList } from './GameStagesList';
import { GameAttachmentsGrid } from './GameAttachmentsGrid';
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
};

export function BriefingScreen({ gameId }: Props) {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [game, setGame] = useState<GameWithRelations | null>(null);
  const [stages, setStages] = useState<GameStage[]>([]);
  const [attachments, setAttachments] = useState<GameAttachment[]>([]);
  const [mySide, setMySide] = useState<GameSide | null>(null);
  const [roster, setRoster] = useState<SideRosterRow[]>([]);

  const load = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    setError(null);

    const [gameRes, stagesRes, attachmentsRes, myParticipantRes] = await Promise.all([
      supabase.from('games').select('*, project:projects(*), polygon:polygons(*)').eq('id', gameId).single(),
      supabase.from('game_stages').select('*').eq('game_id', gameId).order('position', { ascending: true }),
      supabase
        .from('game_attachments')
        .select('*')
        .eq('game_id', gameId)
        .order('created_at', { ascending: false }),
      supabase
        .from('game_participants')
        .select('team_id, side_id')
        .eq('game_id', gameId)
        .eq('profile_id', profile.id)
        .maybeSingle(),
    ]);

    if (gameRes.error) setError(gameRes.error.message);
    setGame((gameRes.data as GameWithRelations) ?? null);
    setStages(stagesRes.data ?? []);
    setAttachments(attachmentsRes.data ?? []);

    let effectiveSideId: string | null = myParticipantRes.data?.side_id ?? null;
    if (!effectiveSideId && myParticipantRes.data?.team_id) {
      const { data: teamSide } = await supabase
        .from('game_team_sides')
        .select('side_id')
        .eq('game_id', gameId)
        .eq('team_id', myParticipantRes.data.team_id)
        .maybeSingle();
      effectiveSideId = teamSide?.side_id ?? null;
    }

    if (effectiveSideId) {
      const [sideRes, teamSidesRes, participantsRes] = await Promise.all([
        supabase.from('game_sides').select('*').eq('id', effectiveSideId).single(),
        supabase.from('game_team_sides').select('team_id, side_id').eq('game_id', gameId),
        supabase
          .from('game_participants')
          .select('id, side_id, team_id, team:teams(name), profile:profiles(full_name, avatar_url)')
          .eq('game_id', gameId),
      ]);
      setMySide(sideRes.data ?? null);

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
      setRoster(rows);
    } else {
      setMySide(null);
      setRoster([]);
    }

    setLoading(false);
  }, [gameId, profile]);

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

  if (!game) {
    return (
      <View style={styles.container}>
        {error ? <Text style={styles.error}>{error}</Text> : <Text style={styles.label}>Игра не найдена</Text>}
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
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

      {attachments.length > 0 ? (
        <>
          <Text style={styles.sectionTitle}>Файлы</Text>
          <GameAttachmentsGrid attachments={attachments} />
        </>
      ) : null}

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

      <Text style={styles.sectionTitle}>Состав стороны{mySide ? ` «${mySide.name}»` : ''}</Text>
      {!mySide ? (
        <Text style={styles.label}>Сторона ещё не назначена</Text>
      ) : roster.length === 0 ? (
        <Text style={styles.label}>Пока никого</Text>
      ) : (
        <View style={styles.rosterList}>
          {roster.map((row) => (
            <View key={row.id} style={styles.rosterRow}>
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
  rosterList: {
    gap: spacing.sm,
  },
  rosterRow: {
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
  error: {
    fontFamily: font.body,
    color: colors.danger,
    marginBottom: spacing.md,
  },
});
