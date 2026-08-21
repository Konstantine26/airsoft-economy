import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { supabase } from '../lib/supabase';
import type { CommandedSide } from '../hooks/useCapabilities';
import { Avatar } from './Avatar';
import { Button } from './Button';
import { Card } from './Card';
import { Chip } from './Chip';
import { RevivalModal } from './RevivalModal';
import { TasksSection } from './TasksSection';
import { colors, font, spacing } from '../lib/theme';

type ParticipantEntry = { full_name: string; avatar_url: string | null; status: 'pending' | 'confirmed' };
type TeamWithRoster = {
  team_id: string;
  team_name: string;
  team_avatar_url: string | null;
  participants: ParticipantEntry[];
};

export function SideCommanderScreen({ sides }: { sides: CommandedSide[] }) {
  const [activeSide, setActiveSide] = useState<CommandedSide | null>(sides[0] ?? null);
  const [activeTab, setActiveTab] = useState<'side' | 'teams' | 'tasks'>('side');
  const [gameLabel, setGameLabel] = useState('');
  const [revivalEnabled, setRevivalEnabled] = useState(false);
  const [revivalModalOpen, setRevivalModalOpen] = useState(false);
  const [teams, setTeams] = useState<TeamWithRoster[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setActiveSide((prev) => (prev && sides.some((s) => s.id === prev.id) ? prev : (sides[0] ?? null)));
  }, [sides]);

  const load = useCallback(async (side: CommandedSide) => {
    setLoading(true);
    setError(null);

    const [gameRes, teamSidesRes, participantsRes] = await Promise.all([
      supabase
        .from('games')
        .select('*, project:projects(name), polygon:polygons(name)')
        .eq('id', side.game_id)
        .single(),
      supabase
        .from('game_team_sides')
        .select('team_id, side_id, team:teams(id, name, avatar_url)')
        .eq('game_id', side.game_id),
      supabase
        .from('game_participants')
        .select('team_id, side_id, status, profile:profiles(full_name, avatar_url)')
        .eq('game_id', side.game_id),
    ]);

    if (gameRes.error) setError(gameRes.error.message);
    const game: any = gameRes.data;
    setGameLabel(game ? `${game.project?.name ?? ''} · ${game.name} · ${game.polygon?.name ?? '—'}` : '');
    setRevivalEnabled(!!game?.revival_enabled);

    const teamSideMap = new Map<string, string>();
    const teamNameMap = new Map<string, string>();
    const teamAvatarMap = new Map<string, string | null>();
    for (const row of (teamSidesRes.data as any[]) ?? []) {
      teamSideMap.set(row.team_id, row.side_id);
      teamNameMap.set(row.team_id, row.team?.name ?? '');
      teamAvatarMap.set(row.team_id, row.team?.avatar_url ?? null);
    }

    const byTeam = new Map<string, ParticipantEntry[]>();
    for (const row of (participantsRes.data as any[]) ?? []) {
      if (row.status === 'rejected') continue;
      const effectiveSideId = row.side_id ?? teamSideMap.get(row.team_id) ?? null;
      if (effectiveSideId !== side.id) continue;
      const entry: ParticipantEntry = {
        full_name: row.profile?.full_name || '(без имени)',
        avatar_url: row.profile?.avatar_url ?? null,
        status: row.status,
      };
      if (!byTeam.has(row.team_id)) byTeam.set(row.team_id, []);
      byTeam.get(row.team_id)!.push(entry);
    }

    const withRosters: TeamWithRoster[] = Array.from(byTeam.entries()).map(([teamId, participants]) => ({
      team_id: teamId,
      team_name: teamNameMap.get(teamId) ?? '',
      team_avatar_url: teamAvatarMap.get(teamId) ?? null,
      participants,
    }));

    setTeams(withRosters);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (activeSide) load(activeSide);
  }, [activeSide, load]);

  if (!activeSide) {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <Text style={styles.title}>Моя сторона</Text>
        <Text style={styles.label}>У вас нет сторон в этом проекте</Text>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Моя сторона</Text>

      {sides.length > 1 ? (
        <View style={styles.chips}>
          {sides.map((side) => (
            <Chip key={side.id} label={side.name} selected={activeSide.id === side.id} onPress={() => setActiveSide(side)} />
          ))}
        </View>
      ) : (
        <Text style={styles.subtitle}>{activeSide.name}</Text>
      )}

      <Text style={styles.subtitle}>{gameLabel}</Text>

      <View style={styles.subNav}>
        <Chip label="Моя сторона" selected={activeTab === 'side'} onPress={() => setActiveTab('side')} />
        <Chip label="Команды" selected={activeTab === 'teams'} onPress={() => setActiveTab('teams')} />
        <Chip label="Задания" selected={activeTab === 'tasks'} onPress={() => setActiveTab('tasks')} />
      </View>

      {revivalEnabled && activeSide.project_id ? (
        <>
          <Button
            title="Возродить участника"
            onPress={() => setRevivalModalOpen(true)}
            style={styles.revivalButton}
          />
          <RevivalModal
            visible={revivalModalOpen}
            projectId={activeSide.project_id}
            gameId={activeSide.game_id}
            sideIds={[activeSide.id]}
            onClose={() => setRevivalModalOpen(false)}
            onSuccess={() => setRevivalModalOpen(false)}
          />
        </>
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {loading ? (
        <ActivityIndicator style={{ marginTop: 20 }} color={colors.accent} />
      ) : (
        <>
          {activeTab === 'side' ? (
            teams.length === 0 ? (
              <Text style={styles.label}>Пока ни одна команда не выбрала эту сторону</Text>
            ) : (
              <View style={styles.teamsList}>
                {teams.map((team) => (
                  <Card key={team.team_id}>
                    <View style={styles.teamHeader}>
                      <Avatar uri={team.team_avatar_url} name={team.team_name} size={24} />
                      <Text style={styles.cardTitle}>{team.team_name}</Text>
                    </View>
                    {team.participants.length === 0 ? (
                      <Text style={styles.label}>Состав ещё не зарегистрирован</Text>
                    ) : (
                      team.participants.map((p, idx) => (
                        <View key={idx} style={styles.participantRow}>
                          <View style={styles.participantIdentity}>
                            <Avatar uri={p.avatar_url} name={p.full_name} size={22} />
                            <Text style={styles.participant}>{p.full_name}</Text>
                          </View>
                          <Text style={p.status === 'confirmed' ? styles.statusConfirmed : styles.statusPending}>
                            {p.status === 'confirmed' ? 'Подтверждён' : 'На подтверждении'}
                          </Text>
                        </View>
                      ))
                    )}
                  </Card>
                ))}
              </View>
            )
          ) : null}

          {activeTab === 'teams' ? (
            teams.length === 0 ? (
              <Text style={styles.label}>Пока ни одна команда не выбрала эту сторону</Text>
            ) : (
              <View style={styles.teamsList}>
                {teams.map((team) => {
                  const confirmedCount = team.participants.filter((p) => p.status === 'confirmed').length;
                  return (
                    <Card key={team.team_id}>
                      <View style={styles.teamHeader}>
                        <Avatar uri={team.team_avatar_url} name={team.team_name} size={24} />
                        <Text style={styles.cardTitle}>{team.team_name}</Text>
                      </View>
                      <Text style={styles.label}>
                        Участников: {team.participants.length} · Подтверждено: {confirmedCount}
                      </Text>
                    </Card>
                  );
                })}
              </View>
            )
          ) : null}

          {activeTab === 'tasks' ? (
            <TasksSection gameId={activeSide.game_id} commandedSideIds={[activeSide.id]} />
          ) : null}
        </>
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
  title: {
    fontFamily: font.heading,
    fontSize: 19,
    color: colors.text,
  },
  subtitle: {
    fontFamily: font.body,
    fontSize: 12.5,
    color: colors.textMuted,
    marginTop: 4,
    marginBottom: spacing.md,
  },
  teamHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: spacing.sm,
  },
  cardTitle: {
    fontFamily: font.bodyBold,
    fontSize: 14,
    color: colors.text,
  },
  participantRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  participantIdentity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  participant: {
    fontFamily: font.body,
    fontSize: 13,
    color: '#d9d9d9',
  },
  statusConfirmed: {
    fontFamily: font.body,
    fontSize: 11,
    color: colors.success,
  },
  statusPending: {
    fontFamily: font.body,
    fontSize: 11,
    color: colors.accent,
  },
  label: {
    fontFamily: font.body,
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 4,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: spacing.md,
  },
  subNav: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: spacing.md,
  },
  revivalButton: {
    marginBottom: spacing.md,
  },
  teamsList: {
    gap: 10,
  },
  error: {
    fontFamily: font.body,
    color: colors.danger,
    marginBottom: spacing.md,
  },
});
