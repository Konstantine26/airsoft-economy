import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useSunMode } from '../lib/sunMode';
import { formatMoney } from '../lib/format';
import { encodeParticipantCode } from '../lib/participantCode';
import { hapticSelection } from '../lib/haptics';
import { font, radii, sizes, spacing, type GamePalette } from '../lib/theme';
import type { GameStage, Task, Team, TeamMember } from '../lib/database.types';
import { QrFullscreen } from './QrFullscreen';
import { SendMoneyModal } from './SendMoneyModal';

type Props = {
  gameId: string;
  ownMembership: (TeamMember & { team: Team }) | null;
  onOpenTasks: () => void;
  onOpenBriefing: () => void;
};

type GameInfo = {
  name: string;
  projectId: string;
  economyEnabled: boolean;
};

// The one screen a player needs mid-game: who am I (number + QR), how much
// money do I have, and what am I supposed to be doing. Everything else is a
// tab away. Follows the "Солнце" palette switch.
export function InGameScreen({ gameId, ownMembership, onOpenTasks, onOpenBriefing }: Props) {
  const { profile } = useAuth();
  const { sun, palette, toggle } = useSunMode();
  const s = useMemo(() => makeStyles(palette), [palette]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [game, setGame] = useState<GameInfo | null>(null);
  const [sideName, setSideName] = useState<string | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [myTasks, setMyTasks] = useState<Task[]>([]);
  const [claimableCount, setClaimableCount] = useState(0);
  const [stages, setStages] = useState<GameStage[]>([]);
  const [qrOpen, setQrOpen] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);

  const load = useCallback(async () => {
    if (!profile) return;
    setError(null);
    const [gameRes, participantRes, tasksRes, stagesRes] = await Promise.all([
      supabase.from('games').select('name, project_id, project:projects(economy_enabled)').eq('id', gameId).single(),
      supabase.from('game_participants').select('side_id, team_id').eq('game_id', gameId).eq('profile_id', profile.id).maybeSingle(),
      supabase.from('tasks').select('*').eq('game_id', gameId).in('status', ['open', 'claimed']),
      supabase.from('game_stages').select('*').eq('game_id', gameId).order('position', { ascending: true }),
    ]);
    if (gameRes.error) setError(gameRes.error.message);

    const g = gameRes.data as { name: string; project_id: string; project: { economy_enabled: boolean } | null } | null;
    const info: GameInfo | null = g
      ? { name: g.name, projectId: g.project_id, economyEnabled: !!g.project?.economy_enabled }
      : null;
    setGame(info);
    setStages(stagesRes.data ?? []);

    const tasks = tasksRes.data ?? [];
    setMyTasks(tasks.filter((t) => t.assignee_profile_id === profile.id));
    setClaimableCount(tasks.filter((t) => t.visibility === 'claimable' && t.status === 'open' && !t.assignee_profile_id).length);

    // Side: a player without a team picks one directly; otherwise it's
    // whatever side the team commander chose for the whole team.
    let sideId = participantRes.data?.side_id ?? null;
    const teamId = participantRes.data?.team_id ?? ownMembership?.team_id ?? null;
    if (!sideId && teamId) {
      const { data } = await supabase.from('game_team_sides').select('side_id').eq('game_id', gameId).eq('team_id', teamId).maybeSingle();
      sideId = data?.side_id ?? null;
    }
    if (sideId) {
      const { data } = await supabase.from('game_sides').select('name').eq('id', sideId).maybeSingle();
      setSideName(data?.name ?? null);
    } else {
      setSideName(null);
    }

    if (info?.economyEnabled) {
      const { data } = await supabase
        .from('project_profile_balances')
        .select('balance')
        .eq('project_id', info.projectId)
        .eq('profile_id', profile.id)
        .maybeSingle();
      setBalance(data?.balance ?? 0);
    } else {
      setBalance(null);
    }
  }, [gameId, ownMembership, profile]);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  if (!profile) return null;

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator color={palette.live} />
      </View>
    );
  }

  const identityLine = [profile.full_name, ownMembership?.team.name].filter(Boolean).join(' · ');

  return (
    <ScrollView
      style={s.container}
      contentContainerStyle={s.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={palette.live} colors={[palette.live]} />}
    >
      <View style={s.titleRow}>
        <View style={s.titleText}>
          <Text style={s.title} numberOfLines={2}>
            {game?.name ?? 'Игра'}
          </Text>
          {sideName ? (
            <View style={s.sideRow}>
              <MaterialCommunityIcons name="flag" size={15} color={palette.textMuted} />
              <Text style={s.sideText}>Сторона «{sideName}»</Text>
            </View>
          ) : null}
        </View>
        <Pressable
          onPress={() => {
            hapticSelection();
            toggle();
          }}
          style={({ pressed }) => [s.sunButton, sun && s.sunButtonOn, pressed && s.pressed]}
          accessibilityRole="switch"
          accessibilityState={{ checked: sun }}
          accessibilityLabel="Тема «Солнце» для яркого света"
        >
          <MaterialCommunityIcons name={sun ? 'white-balance-sunny' : 'weather-sunny'} size={22} color={sun ? palette.accent : palette.textMuted} />
        </Pressable>
      </View>

      {error ? <Text style={s.error}>{error}</Text> : null}

      {/* Who am I */}
      <Pressable
        onPress={() => setQrOpen(true)}
        style={({ pressed }) => [s.idCard, pressed && s.pressed]}
        accessibilityRole="button"
        accessibilityLabel={`Номер участника ${profile.participant_number}. Показать QR-код на весь экран`}
      >
        <View style={s.qrMini}>
          <QRCode value={encodeParticipantCode(profile.participant_number)} size={92} color="#0B0D0E" backgroundColor="#FFFFFF" />
        </View>
        <View style={s.idText}>
          <Text style={s.eyebrow}>Номер участника</Text>
          <Text style={s.idNumber}>
            <Text style={s.idSign}>№</Text>
            {profile.participant_number}
          </Text>
          <Text style={s.idLine} numberOfLines={1}>
            {identityLine}
          </Text>
          <View style={s.qrHint}>
            <MaterialCommunityIcons name="fullscreen" size={16} color={palette.accent} />
            <Text style={s.qrHintText}>QR на весь экран</Text>
          </View>
        </View>
      </Pressable>

      {/* Money */}
      {balance !== null && game ? (
        <View style={s.balanceRow}>
          <View style={s.balanceText}>
            <Text style={s.eyebrow}>Баланс</Text>
            <Text style={s.balance}>{formatMoney(balance)}</Text>
          </View>
          <Pressable
            onPress={() => setSendOpen(true)}
            style={({ pressed }) => [s.sendButton, pressed && s.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Перевести деньги"
          >
            <MaterialCommunityIcons name="send" size={17} color={palette.text} />
            <Text style={s.sendText}>Перевести</Text>
          </Pressable>
        </View>
      ) : null}

      {/* What to do */}
      <View style={s.sectionHead}>
        <Text style={s.eyebrow}>Мои задания</Text>
        <Pressable onPress={onOpenTasks} hitSlop={12} accessibilityRole="button">
          <Text style={s.link}>Все задания</Text>
        </Pressable>
      </View>
      {myTasks.length === 0 ? (
        <Pressable onPress={onOpenTasks} style={({ pressed }) => [s.card, s.emptyTasks, pressed && s.pressed]} accessibilityRole="button">
          <Text style={s.cardText}>Нет взятых заданий</Text>
          <Text style={s.cardMeta}>
            {claimableCount > 0 ? `Можно взять: ${claimableCount}` : 'Командир выдаст их во время игры'}
          </Text>
        </Pressable>
      ) : (
        <View style={s.card}>
          {myTasks.slice(0, 3).map((task, i) => (
            <Pressable
              key={task.id}
              onPress={onOpenTasks}
              style={({ pressed }) => [s.taskRow, i > 0 && s.taskDivider, pressed && s.pressed]}
              accessibilityRole="button"
            >
              <View style={s.taskIcon}>
                <MaterialCommunityIcons name="clipboard-check-outline" size={18} color={palette.textMuted} />
              </View>
              <Text style={s.taskTitle} numberOfLines={2}>
                {task.title}
              </Text>
              {task.reward ? <Text style={s.reward}>+{formatMoney(task.reward)}</Text> : null}
            </Pressable>
          ))}
          {myTasks.length > 3 ? <Text style={s.more}>И ещё {myTasks.length - 3}</Text> : null}
        </View>
      )}

      {stages.length > 0 ? (
        <>
          <View style={s.sectionHead}>
            <Text style={s.eyebrow}>Этапы · {stages.length}</Text>
            <Pressable onPress={onOpenBriefing} hitSlop={12} accessibilityRole="button">
              <Text style={s.link}>Брифинг</Text>
            </Pressable>
          </View>
          <View style={[s.card, s.stages]}>
            {stages.map((stage, i) => (
              <View key={stage.id} style={s.stageRow}>
                <Text style={s.stageNum}>{i + 1}</Text>
                <Text style={s.stageTitle} numberOfLines={2}>
                  {stage.title}
                </Text>
              </View>
            ))}
          </View>
        </>
      ) : null}

      <QrFullscreen
        visible={qrOpen}
        onClose={() => setQrOpen(false)}
        participantNumber={profile.participant_number}
        name={profile.full_name}
        subtitle={[ownMembership?.team.name, sideName ? `Сторона «${sideName}»` : null].filter(Boolean).join(' · ')}
      />
      {game && balance !== null ? (
        <SendMoneyModal
          visible={sendOpen}
          projectId={game.projectId}
          ownTeam={ownMembership?.team ?? null}
          onClose={() => setSendOpen(false)}
          onSuccess={() => {
            setSendOpen(false);
            load();
          }}
        />
      ) : null}
    </ScrollView>
  );
}

function makeStyles(p: GamePalette) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: p.bg,
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
      backgroundColor: p.bg,
    },
    pressed: {
      opacity: 0.8,
    },
    titleRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.md,
    },
    titleText: {
      flex: 1,
      gap: 4,
    },
    title: {
      fontFamily: font.heading,
      fontSize: 24,
      lineHeight: 30,
      color: p.text,
    },
    sideRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    sideText: {
      fontFamily: font.bodyMedium,
      fontSize: 14,
      color: p.textMuted,
    },
    sunButton: {
      width: sizes.hitMin,
      height: sizes.hitMin,
      borderRadius: sizes.hitMin / 2,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: p.card,
      borderWidth: 1,
      borderColor: p.border,
    },
    sunButtonOn: {
      backgroundColor: p.accentSoft,
      borderColor: p.accent,
    },
    error: {
      fontFamily: font.body,
      fontSize: 13.5,
      color: p.danger,
    },
    eyebrow: {
      fontFamily: font.bodySemiBold,
      fontSize: 12,
      letterSpacing: 1,
      textTransform: 'uppercase',
      color: p.textDim,
    },
    idCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md + 2,
      backgroundColor: p.card,
      borderRadius: radii.lg,
      borderWidth: 1,
      borderColor: p.border,
      padding: spacing.md,
    },
    qrMini: {
      padding: 6,
      backgroundColor: '#FFFFFF',
      borderRadius: radii.sm,
    },
    idText: {
      flex: 1,
      gap: 2,
    },
    idNumber: {
      fontFamily: font.numeric,
      fontVariant: ['tabular-nums'],
      fontSize: 48,
      lineHeight: 50,
      color: p.text,
    },
    idSign: {
      fontFamily: font.bodyBold,
      fontSize: 26,
      color: p.textDim,
    },
    idLine: {
      fontFamily: font.body,
      fontSize: 14,
      color: p.textMuted,
    },
    qrHint: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      marginTop: 6,
    },
    qrHintText: {
      fontFamily: font.bodySemiBold,
      fontSize: 13.5,
      color: p.accent,
    },
    balanceRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      backgroundColor: p.card,
      borderRadius: radii.lg,
      paddingVertical: spacing.md,
      paddingLeft: spacing.lg,
      paddingRight: spacing.md,
    },
    balanceText: {
      flex: 1,
      gap: 2,
    },
    balance: {
      fontFamily: font.numeric,
      fontVariant: ['tabular-nums'],
      fontSize: 30,
      lineHeight: 34,
      color: p.text,
    },
    sendButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      minHeight: sizes.hitMin,
      paddingHorizontal: spacing.md + 2,
      borderRadius: radii.md,
      backgroundColor: p.surface2,
    },
    sendText: {
      fontFamily: font.bodySemiBold,
      fontSize: 14.5,
      color: p.text,
    },
    sectionHead: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginTop: spacing.sm,
    },
    link: {
      fontFamily: font.bodySemiBold,
      fontSize: 14,
      color: p.accent,
    },
    card: {
      backgroundColor: p.card,
      borderRadius: radii.lg,
      paddingHorizontal: spacing.md + 2,
    },
    emptyTasks: {
      paddingVertical: spacing.md + 2,
      gap: 2,
    },
    cardText: {
      fontFamily: font.bodySemiBold,
      fontSize: 15,
      color: p.text,
    },
    cardMeta: {
      fontFamily: font.body,
      fontSize: 13.5,
      color: p.textMuted,
    },
    taskRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      minHeight: sizes.listRow,
      paddingVertical: spacing.sm,
    },
    taskDivider: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: p.border,
    },
    taskIcon: {
      width: 34,
      height: 34,
      borderRadius: radii.sm + 2,
      backgroundColor: p.surface2,
      alignItems: 'center',
      justifyContent: 'center',
    },
    taskTitle: {
      flex: 1,
      fontFamily: font.bodySemiBold,
      fontSize: 15,
      color: p.text,
    },
    reward: {
      fontFamily: font.numeric,
      fontVariant: ['tabular-nums'],
      fontSize: 17,
      color: p.success,
    },
    more: {
      fontFamily: font.body,
      fontSize: 13.5,
      color: p.textMuted,
      paddingBottom: spacing.md,
    },
    stages: {
      paddingVertical: spacing.sm,
    },
    stageRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingVertical: 6,
    },
    stageNum: {
      width: 26,
      height: 26,
      borderRadius: 13,
      overflow: 'hidden',
      backgroundColor: p.liveSoft,
      color: p.live,
      textAlign: 'center',
      lineHeight: 26,
      fontFamily: font.numeric,
      fontSize: 15,
    },
    stageTitle: {
      flex: 1,
      fontFamily: font.bodyMedium,
      fontSize: 15,
      color: p.text,
    },
  });
}
