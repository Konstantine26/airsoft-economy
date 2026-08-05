import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Task } from '../lib/database.types';
import { TASK_STATUS_LABEL, TASK_VISIBILITY_LABEL } from '../lib/tasks';
import { Card } from './Card';
import { colors, font, radii } from '../lib/theme';

type Props = {
  task: Task;
  sideName: string;
  teamName: string | null;
  assigneeName: string | null;
  onPress: () => void;
};

export function TaskCard({ task, sideName, teamName, assigneeName, onPress }: Props) {
  const targetLine = (() => {
    if (task.visibility === 'personal') return `Для: ${assigneeName ?? '—'}`;
    if (task.visibility === 'team') return `Команда «${teamName ?? '—'}» · сторона «${sideName}»`;
    if (task.visibility === 'claimable') {
      return assigneeName ? `Взял: ${assigneeName}` : `Можно взять · сторона «${sideName}»`;
    }
    return `Сторона «${sideName}»`;
  })();

  return (
    <Pressable onPress={onPress}>
      <Card style={styles.card}>
        <View style={styles.row}>
          <Text style={styles.title} numberOfLines={1}>
            {task.title}
          </Text>
          <Text style={styles.reward}>{task.reward != null ? `${task.reward.toFixed(2)} ₽` : 'Без награды'}</Text>
        </View>
        <Text style={styles.target}>{targetLine}</Text>
        <View style={styles.row}>
          <Text style={styles.badge}>{TASK_VISIBILITY_LABEL[task.visibility]}</Text>
          <Text style={[styles.status, statusStyle(task.status)]}>{TASK_STATUS_LABEL[task.status]}</Text>
        </View>
      </Card>
    </Pressable>
  );
}

function statusStyle(status: Task['status']) {
  if (status === 'completed') return { color: colors.success };
  if (status === 'cancelled') return { color: colors.textDim };
  if (status === 'claimed') return { color: colors.accent };
  return { color: colors.textMuted };
}

const styles = StyleSheet.create({
  card: {
    marginBottom: 8,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    flex: 1,
    fontFamily: font.bodySemiBold,
    fontSize: 14,
    color: colors.text,
    marginRight: 8,
  },
  reward: {
    fontFamily: font.heading,
    fontSize: 14,
    color: colors.accent,
  },
  target: {
    fontFamily: font.body,
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 4,
  },
  badge: {
    fontFamily: font.bodySemiBold,
    fontSize: 10.5,
    color: colors.accent,
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: colors.accentSoftBorder,
    borderRadius: radii.pill,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginTop: 8,
    overflow: 'hidden',
  },
  status: {
    fontFamily: font.bodySemiBold,
    fontSize: 11,
    marginTop: 8,
  },
});
