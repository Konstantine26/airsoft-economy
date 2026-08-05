import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { supabase } from '../lib/supabase';
import type { Task, TaskAttachment } from '../lib/database.types';
import { TASK_STATUS_LABEL, TASK_VISIBILITY_LABEL, type TaskParticipantOption, type TaskSideOption, type TaskTeamOption } from '../lib/tasks';
import { Button } from './Button';
import { Chip } from './Chip';
import { Sheet } from './Sheet';
import { TaskAttachmentsList } from './TaskAttachmentsList';
import { colors, font, spacing } from '../lib/theme';

type Props = {
  task: Task | null;
  sides: TaskSideOption[];
  teams: TaskTeamOption[];
  participants: TaskParticipantOption[];
  profileNameById: Record<string, string>;
  currentProfileId: string;
  isOrganizer: boolean;
  traderSideIds: string[];
  onClose: () => void;
  onChanged: () => void;
};

export function TaskDetailSheet({
  task,
  sides,
  teams,
  participants,
  profileNameById,
  currentProfileId,
  isOrganizer,
  traderSideIds,
  onClose,
  onChanged,
}: Props) {
  const [attachments, setAttachments] = useState<TaskAttachment[]>([]);
  const [pickingRecipient, setPickingRecipient] = useState(false);
  const [chosenRecipientId, setChosenRecipientId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadAttachments = useCallback(async (taskId: string) => {
    const { data } = await supabase.from('task_attachments').select('*').eq('task_id', taskId);
    setAttachments(data ?? []);
  }, []);

  useEffect(() => {
    setError(null);
    setPickingRecipient(false);
    setChosenRecipientId(null);
    if (task) loadAttachments(task.id);
    else setAttachments([]);
  }, [task, loadAttachments]);

  if (!task) return null;

  const sideName = sides.find((s) => s.id === task.side_id)?.name ?? '—';
  const teamName = task.team_id ? teams.find((t) => t.id === task.team_id)?.name ?? '—' : null;
  const assigneeName = task.assignee_profile_id ? profileNameById[task.assignee_profile_id] ?? '—' : null;
  const customerName = profileNameById[task.customer_profile_id] ?? '—';
  const isOpenish = task.status === 'open' || task.status === 'claimed';

  const myEffectiveSideId = participants.find((p) => p.profileId === currentProfileId)?.effectiveSideId ?? null;

  const canClaim =
    task.visibility === 'claimable' &&
    task.status === 'open' &&
    !task.assignee_profile_id &&
    myEffectiveSideId === task.side_id;

  const canAssign =
    task.visibility === 'claimable' &&
    task.status === 'open' &&
    !task.assignee_profile_id &&
    (isOrganizer || traderSideIds.includes(task.side_id));

  const canConfirm = task.customer_profile_id === currentProfileId && isOpenish;
  const canCancel = (task.customer_profile_id === currentProfileId || isOrganizer) && isOpenish;

  const recipientCandidates = participants.filter(
    (p) => p.effectiveSideId === task.side_id && (task.visibility !== 'team' || p.teamId === task.team_id)
  );

  const run = async (action: () => PromiseLike<{ error: { message: string } | null }>) => {
    setSubmitting(true);
    setError(null);
    const { error: actionError } = await action();
    setSubmitting(false);
    if (actionError) {
      setError(actionError.message);
      return;
    }
    onChanged();
    onClose();
  };

  const claim = () => run(() => supabase.rpc('claim_task', { p_task_id: task.id }));
  const assignTo = (profileId: string) => run(() => supabase.rpc('assign_task', { p_task_id: task.id, p_profile_id: profileId }));
  const cancel = () => run(() => supabase.rpc('cancel_task', { p_task_id: task.id }));
  const confirm = (recipientId?: string) =>
    run(() => supabase.rpc('complete_task', { p_task_id: task.id, p_recipient_profile_id: recipientId ?? null }));

  return (
    <Sheet visible={!!task} onRequestClose={onClose}>
      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>{task.title}</Text>
          <Text style={styles.reward}>{task.reward != null ? `${task.reward.toFixed(2)} ₽` : 'Без награды'}</Text>
        </View>

        <View style={styles.badgeRow}>
          <Text style={styles.badge}>{TASK_VISIBILITY_LABEL[task.visibility]}</Text>
          <Text style={styles.badge}>{TASK_STATUS_LABEL[task.status]}</Text>
        </View>

        <Text style={styles.meta}>Сторона: {sideName}</Text>
        {teamName ? <Text style={styles.meta}>Команда: {teamName}</Text> : null}
        {assigneeName ? <Text style={styles.meta}>Исполнитель: {assigneeName}</Text> : null}
        <Text style={styles.meta}>Заказчик: {customerName}</Text>

        {task.description ? <Text style={styles.description}>{task.description}</Text> : null}

        <TaskAttachmentsList attachments={attachments} />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={styles.actions}>
          {canClaim ? <Button title="Взять" onPress={claim} loading={submitting} style={styles.actionButton} /> : null}
          {canAssign ? (
            <Button
              title="Назначить"
              variant="secondary"
              onPress={() => setPickingRecipient((v) => !v)}
              style={styles.actionButton}
            />
          ) : null}
          {canConfirm ? (
            task.assignee_profile_id ? (
              <Button title="Подтвердить" onPress={() => confirm()} loading={submitting} style={styles.actionButton} />
            ) : (
              <Button
                title="Подтвердить"
                onPress={() => setPickingRecipient((v) => !v)}
                loading={submitting}
                style={styles.actionButton}
              />
            )
          ) : null}
          {canCancel ? (
            <Button title="Отменить" variant="danger" onPress={cancel} loading={submitting} style={styles.actionButton} />
          ) : null}
        </View>

        {pickingRecipient ? (
          <View style={styles.recipientPicker}>
            <Text style={styles.label}>
              {canAssign && !canConfirm ? 'Кому назначить' : 'Кто выполнил'}
            </Text>
            {recipientCandidates.length === 0 ? (
              <Text style={styles.hint}>Нет подходящих участников</Text>
            ) : (
              <View style={styles.chips}>
                {recipientCandidates.map((p) => (
                  <Chip
                    key={p.profileId}
                    label={p.fullName}
                    selected={chosenRecipientId === p.profileId}
                    onPress={() => setChosenRecipientId(p.profileId)}
                  />
                ))}
              </View>
            )}
            <Button
              title={canAssign && !task.assignee_profile_id && !canConfirm ? 'Назначить' : 'Подтвердить'}
              disabled={!chosenRecipientId}
              loading={submitting}
              onPress={() => {
                if (!chosenRecipientId) return;
                if (canConfirm) confirm(chosenRecipientId);
                else assignTo(chosenRecipientId);
              }}
              style={styles.pickerSubmit}
            />
          </View>
        ) : null}

        <Button title="Закрыть" variant="ghost" onPress={onClose} style={styles.closeButton} />
      </ScrollView>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  scroll: {
    maxHeight: 560,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    flex: 1,
    fontFamily: font.heading,
    fontSize: 18,
    color: colors.text,
    marginRight: 8,
  },
  reward: {
    fontFamily: font.heading,
    fontSize: 18,
    color: colors.accent,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: spacing.sm,
  },
  badge: {
    fontFamily: font.bodySemiBold,
    fontSize: 11,
    color: colors.textMuted,
    backgroundColor: colors.white10,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 20,
    paddingHorizontal: 9,
    paddingVertical: 3,
    overflow: 'hidden',
  },
  meta: {
    fontFamily: font.body,
    fontSize: 12.5,
    color: colors.textMuted,
    marginTop: 6,
  },
  description: {
    fontFamily: font.body,
    fontSize: 13.5,
    color: colors.text,
    marginTop: spacing.md,
    marginBottom: spacing.md,
  },
  error: {
    fontFamily: font.body,
    color: colors.danger,
    marginTop: spacing.sm,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: spacing.lg,
  },
  actionButton: {
    flex: 1,
    minWidth: 100,
  },
  recipientPicker: {
    marginTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
    paddingTop: spacing.md,
  },
  label: {
    fontFamily: font.body,
    fontSize: 12,
    color: colors.textMuted,
    marginBottom: 6,
  },
  hint: {
    fontFamily: font.body,
    fontSize: 12,
    color: colors.textDim,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: spacing.sm,
  },
  pickerSubmit: {
    marginTop: 4,
  },
  closeButton: {
    marginTop: spacing.md,
  },
});
