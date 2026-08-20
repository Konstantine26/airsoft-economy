import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Card } from './Card';
import { KIND_LABEL } from './WalletScreen';
import { colors, font, spacing } from '../lib/theme';
import { formatMoney } from '../lib/format';
import type { PersonalTransaction, PersonalTransactionKind } from '../lib/database.types';

type JournalRow = PersonalTransaction & {
  from_profile: { full_name: string } | null;
  to_profile: { full_name: string } | null;
  from_team: { name: string } | null;
  to_team: { name: string } | null;
};

type Props = {
  activeProjectId: string | null;
  economyProjectId: string | null;
};

export function PlayerStatsScreen({ activeProjectId, economyProjectId }: Props) {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [gamesPlayed, setGamesPlayed] = useState(0);
  const [tasksCompleted, setTasksCompleted] = useState(0);
  const [balance, setBalance] = useState(0);
  const [journal, setJournal] = useState<JournalRow[]>([]);

  const fetchData = useCallback(async () => {
    if (!profile || !activeProjectId) {
      setGamesPlayed(0);
      setTasksCompleted(0);
      setBalance(0);
      setJournal([]);
      return;
    }

    const [participantsRes, tasksRes] = await Promise.all([
      supabase
        .from('game_participants')
        .select('status, game:games(id, ends_at, project_id)')
        .eq('profile_id', profile.id),
      supabase
        .from('tasks')
        .select('id, status, assignee_profile_id, completed_by, game:games(project_id)')
        .eq('status', 'completed')
        .or(`assignee_profile_id.eq.${profile.id},completed_by.eq.${profile.id}`),
    ]);

    const now = Date.now();
    const played = ((participantsRes.data as any[]) ?? []).filter(
      (row) =>
        row.game?.project_id === activeProjectId &&
        row.status === 'confirmed' &&
        !!row.game?.ends_at &&
        new Date(row.game.ends_at).getTime() <= now
    ).length;
    setGamesPlayed(played);

    const completed = ((tasksRes.data as any[]) ?? []).filter((row) => row.game?.project_id === activeProjectId).length;
    setTasksCompleted(completed);

    if (!economyProjectId) {
      setBalance(0);
      setJournal([]);
      return;
    }

    const [balanceRes, journalRes] = await Promise.all([
      supabase
        .from('project_profile_balances')
        .select('*')
        .eq('project_id', economyProjectId)
        .eq('profile_id', profile.id)
        .maybeSingle(),
      supabase
        .from('personal_transactions')
        .select(
          '*, from_profile:profiles!personal_transactions_from_profile_id_fkey(full_name), to_profile:profiles!personal_transactions_to_profile_id_fkey(full_name), from_team:teams!personal_transactions_from_team_id_fkey(name), to_team:teams!personal_transactions_to_team_id_fkey(name)'
        )
        .eq('project_id', economyProjectId)
        .or(`from_profile_id.eq.${profile.id},to_profile_id.eq.${profile.id}`)
        .order('created_at', { ascending: false }),
    ]);
    setBalance(balanceRes.data?.balance ?? 0);
    setJournal((journalRes.data as unknown as JournalRow[]) ?? []);
  }, [profile, activeProjectId, economyProjectId]);

  useEffect(() => {
    setLoading(true);
    fetchData().finally(() => setLoading(false));
  }, [fetchData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  }, [fetchData]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (!activeProjectId) {
    return (
      <View style={styles.center}>
        <Text style={styles.label}>Выберите проект</Text>
      </View>
    );
  }

  const totalIn = journal.filter((row) => row.to_profile_id === profile?.id).reduce((sum, row) => sum + row.amount, 0);
  const totalOut = journal.filter((row) => row.from_profile_id === profile?.id).reduce((sum, row) => sum + row.amount, 0);
  const totalEarnedFromTasks = journal
    .filter((row) => row.kind === 'task_reward' && row.to_profile_id === profile?.id)
    .reduce((sum, row) => sum + row.amount, 0);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} colors={[colors.accent]} />}
    >
      <Text style={styles.title}>Статистика</Text>

      <View style={styles.statsRow}>
        <Card style={styles.statCard}>
          <Text style={styles.statNumber}>{gamesPlayed}</Text>
          <Text style={styles.statLabel}>Игр сыграно</Text>
        </Card>
        <Card style={styles.statCard}>
          <Text style={styles.statNumber}>{tasksCompleted}</Text>
          <Text style={styles.statLabel}>Заданий выполнено</Text>
        </Card>
      </View>

      <Text style={styles.sectionTitle}>Баланс</Text>
      {economyProjectId ? (
        <>
          <Card style={styles.balanceCard}>
            <Text style={styles.balanceLabel}>Текущий баланс</Text>
            <Text style={styles.balanceValue}>{formatMoney(balance)}</Text>
          </Card>
          <View style={styles.statsRow}>
            <Card style={styles.statCard}>
              <Text style={[styles.statNumber, styles.amountIn]}>+{formatMoney(totalIn)}</Text>
              <Text style={styles.statLabel}>Поступления</Text>
            </Card>
            <Card style={styles.statCard}>
              <Text style={[styles.statNumber, styles.amountOut]}>-{formatMoney(totalOut)}</Text>
              <Text style={styles.statLabel}>Списания</Text>
            </Card>
          </View>
          <Card style={styles.balanceCard}>
            <Text style={styles.balanceLabel}>Заработано на заданиях</Text>
            <Text style={styles.balanceValue}>{formatMoney(totalEarnedFromTasks)}</Text>
          </Card>

          <Text style={styles.sectionTitle}>Последние операции</Text>
          {journal.length === 0 ? (
            <Text style={styles.label}>Пока нет операций</Text>
          ) : (
            <View style={styles.journalList}>
              {journal.slice(0, 15).map((row) => {
                const outgoing = row.from_profile_id === profile?.id;
                const counterparty = outgoing
                  ? (row.to_profile?.full_name ?? row.to_team?.name ?? '—')
                  : (row.from_profile?.full_name ?? row.from_team?.name ?? 'Система');
                return (
                  <Card key={row.id} style={styles.journalRow}>
                    <View>
                      <Text style={styles.journalCounterparty}>{counterparty}</Text>
                      <Text style={styles.journalKind}>{KIND_LABEL[row.kind as PersonalTransactionKind]}</Text>
                    </View>
                    <Text style={outgoing ? styles.amountOut : styles.amountIn}>
                      {outgoing ? '-' : '+'}
                      {formatMoney(row.amount)}
                    </Text>
                  </Card>
                );
              })}
            </View>
          )}
        </>
      ) : (
        <Text style={styles.label}>Экономика не включена для этого проекта</Text>
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
  label: {
    fontFamily: font.body,
    fontSize: 13,
    color: colors.textMuted,
  },
  sectionTitle: {
    fontFamily: font.heading,
    fontSize: 16,
    color: colors.text,
    marginTop: spacing.xl,
    marginBottom: spacing.sm + 2,
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  statCard: {
    flex: 1,
    alignItems: 'center',
  },
  statNumber: {
    fontFamily: font.heading,
    fontSize: 24,
    color: colors.text,
  },
  statLabel: {
    fontFamily: font.body,
    fontSize: 11.5,
    color: colors.textMuted,
    marginTop: 4,
    textAlign: 'center',
  },
  balanceCard: {
    marginTop: spacing.sm,
  },
  balanceLabel: {
    fontFamily: font.body,
    fontSize: 12,
    color: colors.textMuted,
  },
  balanceValue: {
    fontFamily: font.heading,
    fontSize: 20,
    color: colors.text,
    marginTop: 4,
  },
  journalList: {
    gap: spacing.sm,
  },
  journalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
  },
  journalCounterparty: {
    fontFamily: font.bodySemiBold,
    fontSize: 13.5,
    color: colors.text,
  },
  journalKind: {
    fontFamily: font.body,
    fontSize: 11.5,
    color: colors.textMuted,
    marginTop: 1,
  },
  amountOut: {
    fontFamily: font.heading,
    fontSize: 14.5,
    color: colors.danger,
  },
  amountIn: {
    fontFamily: font.heading,
    fontSize: 14.5,
    color: colors.success,
  },
});
