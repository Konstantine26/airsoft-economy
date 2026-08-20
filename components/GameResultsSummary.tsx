import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { supabase } from '../lib/supabase';
import type { GameAttachment, GameStage } from '../lib/database.types';
import { Card } from './Card';
import { GameStagesList } from './GameStagesList';
import { GameAttachmentsGrid } from './GameAttachmentsGrid';
import { colors, font, spacing } from '../lib/theme';
import { formatMoney } from '../lib/format';

type TaskRow = {
  id: string;
  title: string;
  reward: number | null;
  status: string;
  assignee: { full_name: string } | null;
};

type Props = {
  gameId: string;
  stages: GameStage[];
  attachments: GameAttachment[];
};

export function GameResultsSummary({ gameId, stages, attachments }: Props) {
  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState<TaskRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    supabase
      .from('tasks')
      .select('id, title, reward, status, assignee:profiles!tasks_assignee_profile_id_fkey(full_name)')
      .eq('game_id', gameId)
      .then(({ data }) => {
        if (cancelled) return;
        setTasks((data as unknown as TaskRow[]) ?? []);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [gameId]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  const completedTasks = tasks.filter((t) => t.status === 'completed');
  const totalRewardPaid = completedTasks.reduce((sum, t) => sum + (t.reward ?? 0), 0);

  return (
    <View>
      <Text style={styles.sectionTitle}>Итоги игры</Text>
      <Card>
        <Text style={styles.summaryLine}>
          {tasks.length > 0
            ? `${completedTasks.length} из ${tasks.length} заданий выполнено`
            : 'Заданий не было'}
        </Text>
        {totalRewardPaid > 0 ? (
          <Text style={styles.summaryLine}>Выплачено: {formatMoney(totalRewardPaid)}</Text>
        ) : null}
      </Card>

      {completedTasks.length > 0 ? (
        <View style={styles.taskList}>
          {completedTasks.map((t) => (
            <Card key={t.id} style={styles.taskRow}>
              <View style={styles.taskInfo}>
                <Text style={styles.taskTitle}>{t.title}</Text>
                <Text style={styles.taskAssignee}>{t.assignee?.full_name ?? '—'}</Text>
              </View>
              {t.reward ? <Text style={styles.taskReward}>{formatMoney(t.reward)}</Text> : null}
            </Card>
          ))}
        </View>
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
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    paddingVertical: spacing.xl,
    alignItems: 'center',
  },
  sectionTitle: {
    fontFamily: font.heading,
    fontSize: 16,
    color: colors.text,
    marginTop: spacing.lg,
    marginBottom: spacing.sm + 2,
  },
  summaryLine: {
    fontFamily: font.body,
    fontSize: 13.5,
    color: colors.text,
  },
  taskList: {
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  taskRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
  },
  taskInfo: {
    flex: 1,
  },
  taskTitle: {
    fontFamily: font.bodySemiBold,
    fontSize: 13.5,
    color: colors.text,
  },
  taskAssignee: {
    fontFamily: font.body,
    fontSize: 11.5,
    color: colors.textMuted,
    marginTop: 1,
  },
  taskReward: {
    fontFamily: font.heading,
    fontSize: 14.5,
    color: colors.success,
  },
});
