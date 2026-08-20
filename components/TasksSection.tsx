import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import type { Task } from '../lib/database.types';
import type { TaskParticipantOption, TaskSideOption, TaskTeamOption } from '../lib/tasks';
import { Button } from './Button';
import { CreateTaskModal } from './CreateTaskModal';
import { TaskCard } from './TaskCard';
import { TaskDetailSheet } from './TaskDetailSheet';
import { colors, font, spacing } from '../lib/theme';

type Props = {
  gameId: string;
  isOrganizer?: boolean;
  traderSideIds?: string[];
  commandedSideIds?: string[];
  splitClaimable?: boolean;
};

export function TasksSection({
  gameId,
  isOrganizer = false,
  traderSideIds = [],
  commandedSideIds = [],
  splitClaimable = false,
}: Props) {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [sides, setSides] = useState<TaskSideOption[]>([]);
  const [teams, setTeams] = useState<TaskTeamOption[]>([]);
  const [participants, setParticipants] = useState<TaskParticipantOption[]>([]);
  const [profileNameById, setProfileNameById] = useState<Record<string, string>>({});
  const [creating, setCreating] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    const [tasksRes, sidesRes, teamSidesRes, participantsRes, profilesRes] = await Promise.all([
      supabase.from('tasks').select('*').eq('game_id', gameId).order('created_at', { ascending: false }),
      supabase.from('game_sides').select('id, name').eq('game_id', gameId).order('name', { ascending: true }),
      supabase.from('game_team_sides').select('team_id, side_id, team:teams(id, name)').eq('game_id', gameId),
      supabase
        .from('game_participants')
        .select('profile_id, team_id, side_id, profile:profiles(full_name)')
        .eq('game_id', gameId)
        .neq('status', 'rejected'),
      supabase.from('profiles').select('id, full_name'),
    ]);

    if (tasksRes.error) setError(tasksRes.error.message);
    setTasks(tasksRes.data ?? []);
    setSides(sidesRes.data ?? []);

    const teamSideMap = new Map<string, string>();
    const teamRows: TaskTeamOption[] = [];
    for (const row of (teamSidesRes.data as any[]) ?? []) {
      teamSideMap.set(row.team_id, row.side_id);
      if (row.team) teamRows.push({ id: row.team.id, name: row.team.name, sideId: row.side_id });
    }
    setTeams(teamRows);

    const participantRows: TaskParticipantOption[] = ((participantsRes.data as any[]) ?? []).map((row) => ({
      profileId: row.profile_id,
      fullName: row.profile?.full_name || '(без имени)',
      effectiveSideId: row.side_id ?? teamSideMap.get(row.team_id) ?? null,
      teamId: row.team_id ?? null,
    }));
    setParticipants(participantRows);

    const nameMap: Record<string, string> = {};
    for (const p of profilesRes.data ?? []) {
      nameMap[p.id] = p.full_name || '(без имени)';
    }
    setProfileNameById(nameMap);

    setLoading(false);
  }, [gameId]);

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

  const myEffectiveSideId = participants.find((p) => p.profileId === profile?.id)?.effectiveSideId ?? null;
  const allowedSideIds = isOrganizer
    ? sides.map((s) => s.id)
    : traderSideIds.length > 0
      ? traderSideIds
      : commandedSideIds.length > 0
        ? commandedSideIds
        : myEffectiveSideId
          ? [myEffectiveSideId]
          : [];

  const allowedSides = sides.filter((s) => allowedSideIds.includes(s.id));

  const activeTasks = tasks.filter((t) => t.status === 'open' || t.status === 'claimed');
  const claimableTasks = activeTasks.filter((t) => t.visibility === 'claimable' && !t.assignee_profile_id);
  const otherTasks = splitClaimable ? tasks.filter((t) => !claimableTasks.includes(t)) : tasks;

  const renderTask = (task: Task) => (
    <TaskCard
      key={task.id}
      task={task}
      sideName={sides.find((s) => s.id === task.side_id)?.name ?? '—'}
      teamName={task.team_id ? teams.find((t) => t.id === task.team_id)?.name ?? null : null}
      assigneeName={task.assignee_profile_id ? profileNameById[task.assignee_profile_id] ?? null : null}
      onPress={() => setSelectedTask(task)}
    />
  );

  return (
    <View>
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Button
        title="+ Новое задание"
        variant="secondary"
        disabled={allowedSideIds.length === 0}
        onPress={() => setCreating(true)}
        style={styles.createButton}
      />
      {allowedSideIds.length === 0 ? (
        <Text style={styles.hint}>
          {sides.length === 0
            ? 'В игре ещё нет ни одной стороны — сначала создайте её в разделе «Стороны»'
            : 'Вы пока не назначены на сторону в этой игре'}
        </Text>
      ) : null}

      {splitClaimable ? (
        <>
          <Text style={styles.sectionTitle}>Активные задания</Text>
          {otherTasks.length === 0 ? (
            <Text style={styles.hint}>Пока нет заданий</Text>
          ) : (
            otherTasks.map(renderTask)
          )}

          <Text style={styles.sectionTitle}>Можно взять</Text>
          {claimableTasks.length === 0 ? (
            <Text style={styles.hint}>Нечего брать</Text>
          ) : (
            claimableTasks.map(renderTask)
          )}
        </>
      ) : (
        <>
          <Text style={styles.sectionTitle}>Задания</Text>
          {tasks.length === 0 ? <Text style={styles.hint}>Заданий пока нет</Text> : tasks.map(renderTask)}
        </>
      )}

      <CreateTaskModal
        visible={creating}
        gameId={gameId}
        customerProfileId={profile?.id ?? ''}
        sides={allowedSides}
        teams={teams}
        participants={participants}
        onClose={() => setCreating(false)}
        onCreated={load}
      />

      <TaskDetailSheet
        task={selectedTask}
        sides={sides}
        teams={teams}
        participants={participants}
        profileNameById={profileNameById}
        currentProfileId={profile?.id ?? ''}
        isOrganizer={isOrganizer}
        traderSideIds={traderSideIds}
        commandedSideIds={commandedSideIds}
        onClose={() => setSelectedTask(null)}
        onChanged={load}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    paddingVertical: spacing.lg,
    alignItems: 'center',
  },
  sectionTitle: {
    fontFamily: font.heading,
    fontSize: 15,
    color: colors.text,
    marginTop: spacing.lg,
    marginBottom: spacing.sm + 2,
  },
  createButton: {
    marginBottom: spacing.sm,
  },
  hint: {
    fontFamily: font.body,
    fontSize: 12,
    color: colors.textDim,
    marginBottom: spacing.sm,
  },
  error: {
    fontFamily: font.body,
    color: colors.danger,
    marginBottom: spacing.md,
  },
});
