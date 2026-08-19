import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { supabase } from '../lib/supabase';
import type { Profile, Team, TeamCreationRequest } from '../lib/database.types';
import { Avatar } from './Avatar';
import { Button } from './Button';
import { Card } from './Card';
import { Chip } from './Chip';
import { TextField } from './TextField';
import { colors, font, spacing } from '../lib/theme';
import { formatMoney } from '../lib/format';

type Props = {
  activeProjectId: string | null;
};

export function AdminTeamsTab({ activeProjectId }: Props) {
  const [teams, setTeams] = useState<Team[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [balances, setBalances] = useState<Map<string, number>>(new Map());
  const [creationRequests, setCreationRequests] = useState<(TeamCreationRequest & { profile: Profile | null })[]>([]);
  const [reviewingRequestId, setReviewingRequestId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newTeamName, setNewTeamName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  const load = useCallback(async () => {
    const [teamsRes, profilesRes, balancesRes, requestsRes] = await Promise.all([
      supabase.from('teams').select('*').order('name', { ascending: true }),
      supabase.from('profiles').select('*').order('full_name', { ascending: true }),
      activeProjectId
        ? supabase.from('project_team_balances').select('*').eq('project_id', activeProjectId)
        : Promise.resolve({ data: [], error: null }),
      supabase
        .from('team_creation_requests')
        .select('*, profile:profiles(*)')
        .eq('status', 'pending')
        .order('created_at', { ascending: true }),
    ]);
    if (teamsRes.error) setError(teamsRes.error.message);
    setTeams(teamsRes.data ?? []);
    setProfiles(profilesRes.data ?? []);
    setBalances(new Map((balancesRes.data ?? []).map((row) => [row.team_id, row.balance])));
    setCreationRequests((requestsRes.data as any[]) ?? []);
  }, [activeProjectId]);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const createTeam = async () => {
    if (!newTeamName.trim()) return;
    setError(null);
    const { error } = await supabase.from('teams').insert({ name: newTeamName.trim() });
    if (error) {
      setError(error.message);
      return;
    }
    setNewTeamName('');
    load();
  };

  const startRename = (team: Team) => {
    setEditingId(team.id);
    setEditingName(team.name);
  };

  const saveRename = async (team: Team) => {
    if (!editingName.trim()) return;
    setError(null);
    const { error } = await supabase.from('teams').update({ name: editingName.trim() }).eq('id', team.id);
    if (error) {
      setError(error.message);
      return;
    }
    setTeams((prev) => prev.map((t) => (t.id === team.id ? { ...t, name: editingName.trim() } : t)));
    setEditingId(null);
  };

  const deleteTeam = async (team: Team) => {
    setError(null);
    const { error } = await supabase.from('teams').delete().eq('id', team.id);
    if (error) {
      setError(error.message);
      return;
    }
    setTeams((prev) => prev.filter((t) => t.id !== team.id));
  };

  const acceptCreationRequest = async (request: TeamCreationRequest) => {
    setError(null);
    setReviewingRequestId(request.id);
    const { error: rpcError } = await supabase.rpc('accept_team_creation_request', { p_request_id: request.id });
    setReviewingRequestId(null);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    load();
  };

  const rejectCreationRequest = async (request: TeamCreationRequest) => {
    setError(null);
    setReviewingRequestId(request.id);
    const { error: updateError } = await supabase
      .from('team_creation_requests')
      .update({ status: 'rejected' })
      .eq('id', request.id);
    setReviewingRequestId(null);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    load();
  };

  const setCommander = async (teamId: string, profileId: string | null) => {
    setError(null);
    const { error } = await supabase.from('teams').update({ commander_id: profileId }).eq('id', teamId);
    if (error) {
      setError(error.message);
      return;
    }
    setTeams((prev) => prev.map((t) => (t.id === teamId ? { ...t, commander_id: profileId } : t)));
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} colors={[colors.accent]} />}
    >
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {!activeProjectId ? (
        <Text style={styles.label}>
          Нет проекта с включённой экономикой — пополнение недоступно. Включите «Ведение экономики» во
          вкладке «Проекты и игры».
        </Text>
      ) : null}

      {creationRequests.length > 0 ? (
        <>
          <Text style={styles.sectionTitle}>Заявки на создание команды ({creationRequests.length})</Text>
          <View style={styles.list}>
            {creationRequests.map((request) => (
              <Card key={request.id}>
                <View style={styles.row}>
                  <Avatar uri={request.profile?.avatar_url ?? null} name={request.profile?.full_name ?? ''} size={26} />
                  <View style={styles.flexInput}>
                    <Text style={styles.cardTitle}>{request.team_name}</Text>
                    <Text style={styles.label}>
                      Заявитель: {request.profile?.full_name || '(без имени)'}
                      {request.profile ? ` · №${request.profile.participant_number}` : ''}
                    </Text>
                  </View>
                </View>
                <View style={styles.requestActions}>
                  <Button
                    title="Принять"
                    variant="success"
                    onPress={() => acceptCreationRequest(request)}
                    loading={reviewingRequestId === request.id}
                    style={styles.requestButton}
                  />
                  <Button
                    title="Отклонить"
                    variant="danger"
                    onPress={() => rejectCreationRequest(request)}
                    loading={reviewingRequestId === request.id}
                    style={styles.requestButton}
                  />
                </View>
              </Card>
            ))}
          </View>
        </>
      ) : null}

      <View style={styles.list}>
        {teams.map((team) => (
          <Card key={team.id}>
            {editingId === team.id ? (
              <View style={styles.row}>
                <TextField style={styles.flexInput} value={editingName} onChangeText={setEditingName} />
                <Pressable onPress={() => saveRename(team)} accessibilityRole="button" accessibilityLabel="Сохранить название">
                  <Text style={styles.saveText}>Сохранить</Text>
                </Pressable>
                <Pressable onPress={() => setEditingId(null)} accessibilityRole="button" accessibilityLabel="Отменить переименование">
                  <Text style={styles.cancelText}>Отмена</Text>
                </Pressable>
              </View>
            ) : (
              <View style={styles.row}>
                <Avatar uri={team.avatar_url} name={team.name} size={30} />
                <Text style={styles.cardTitle}>{team.name}</Text>
                <Pressable onPress={() => startRename(team)} accessibilityRole="button" accessibilityLabel={`Переименовать команду ${team.name}`}>
                  <Text style={styles.editText}>Переименовать</Text>
                </Pressable>
                <Pressable onPress={() => deleteTeam(team)} accessibilityRole="button" accessibilityLabel={`Удалить команду ${team.name}`}>
                  <Text style={styles.deleteText}>Удалить</Text>
                </Pressable>
              </View>
            )}

            {activeProjectId ? (
              <Text style={styles.label}>Баланс в проекте: {formatMoney(balances.get(team.id) ?? 0)}</Text>
            ) : null}

            <Text style={styles.label}>Командир</Text>
            <View style={styles.chips}>
              <Chip label="—" selected={!team.commander_id} onPress={() => setCommander(team.id, null)} />
              {profiles.map((p) => (
                <Chip
                  key={p.id}
                  label={p.full_name || '(без имени)'}
                  selected={team.commander_id === p.id}
                  onPress={() => setCommander(team.id, p.id)}
                />
              ))}
            </View>
          </Card>
        ))}
      </View>

      <Text style={styles.sectionTitle}>Новая команда</Text>
      <View style={styles.row}>
        <TextField style={styles.flexInput} placeholder="Название команды" value={newTeamName} onChangeText={setNewTeamName} />
        <Button title="Добавить" onPress={createTeam} style={styles.addButton} />
      </View>
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
  list: {
    gap: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  cardTitle: {
    fontFamily: font.bodySemiBold,
    fontSize: 14,
    color: colors.text,
    flex: 1,
  },
  requestActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: spacing.sm,
  },
  requestButton: {
    flex: 1,
    paddingVertical: 9,
  },
  sectionTitle: {
    fontFamily: font.heading,
    fontSize: 17,
    color: colors.text,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  error: {
    fontFamily: font.body,
    color: colors.danger,
    marginBottom: spacing.md,
  },
  label: {
    fontFamily: font.body,
    fontSize: 12,
    color: colors.textMuted,
    marginTop: spacing.sm + 2,
    marginBottom: 4,
  },
  flexInput: {
    flex: 1,
  },
  addButton: {
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  editText: {
    fontFamily: font.body,
    color: colors.accent,
    fontSize: 13,
  },
  saveText: {
    fontFamily: font.bodySemiBold,
    color: colors.accent,
    fontSize: 13,
  },
  deleteText: {
    fontFamily: font.body,
    color: colors.danger,
    fontSize: 13,
  },
  cancelText: {
    fontFamily: font.body,
    color: colors.textMuted,
    fontSize: 13,
  },
});
