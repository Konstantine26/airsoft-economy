import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import type { Team, TeamCreationRequest, TeamJoinRequest, TeamMember } from '../lib/database.types';
import { Avatar } from './Avatar';
import { Button } from './Button';
import { Card } from './Card';
import { TextField } from './TextField';
import { colors, font, radii, spacing } from '../lib/theme';
import { formatMoney } from '../lib/format';

type Props = {
  ownMembership: (TeamMember & { team: Team }) | null;
  activeProjectId: string | null;
};

type RosterEntry = { profile_id: string; full_name: string; avatar_url: string | null };

export function PlayerTeamScreen({ ownMembership, activeProjectId }: Props) {
  const { profile } = useAuth();
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [teamBalance, setTeamBalance] = useState<number | null>(null);
  const [allTeams, setAllTeams] = useState<Team[]>([]);
  const [myRequests, setMyRequests] = useState<Map<string, TeamJoinRequest>>(new Map());
  const [myCreationRequests, setMyCreationRequests] = useState<TeamCreationRequest[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [applyingTeamId, setApplyingTeamId] = useState<string | null>(null);
  const [newTeamName, setNewTeamName] = useState('');
  const [creatingTeam, setCreatingTeam] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadRoster = useCallback(async () => {
    if (!ownMembership) return;
    const { data } = await supabase
      .from('team_members')
      .select('profile_id, profile:profiles(full_name, avatar_url)')
      .eq('team_id', ownMembership.team_id);
    const commanderId = ownMembership.team.commander_id;
    const rows: RosterEntry[] = (data ?? []).map((row: any) => ({
      profile_id: row.profile_id,
      full_name: row.profile?.full_name || '(без имени)',
      avatar_url: row.profile?.avatar_url ?? null,
    }));
    rows.sort((a, b) => Number(b.profile_id === commanderId) - Number(a.profile_id === commanderId));
    setRoster(rows);
  }, [ownMembership]);

  const loadTeamBalance = useCallback(async () => {
    if (!ownMembership || !activeProjectId) {
      setTeamBalance(null);
      return;
    }
    const { data } = await supabase
      .from('project_team_balances')
      .select('*')
      .eq('project_id', activeProjectId)
      .eq('team_id', ownMembership.team_id)
      .maybeSingle();
    setTeamBalance(data?.balance ?? 0);
  }, [ownMembership, activeProjectId]);

  const loadTeamsAndRequests = useCallback(async () => {
    if (ownMembership || !profile) return;
    const [teamsRes, requestsRes, creationRes] = await Promise.all([
      supabase.from('teams').select('*').order('name', { ascending: true }),
      supabase.from('team_join_requests').select('*').eq('profile_id', profile.id),
      supabase
        .from('team_creation_requests')
        .select('*')
        .eq('profile_id', profile.id)
        .order('created_at', { ascending: false }),
    ]);
    setAllTeams(teamsRes.data ?? []);
    const map = new Map<string, TeamJoinRequest>();
    for (const row of (requestsRes.data ?? []) as TeamJoinRequest[]) map.set(row.team_id, row);
    setMyRequests(map);

    // Accepted requests are deleted server-side as soon as they're
    // accepted (accept_team_creation_request) -- one showing up here
    // while we're not on a team means its team was since disbanded.
    // Clean it up rather than leaving an orphaned row the player can't
    // otherwise get rid of.
    const creationRows = (creationRes.data as TeamCreationRequest[]) ?? [];
    const orphaned = creationRows.filter((r) => r.status === 'accepted');
    if (orphaned.length > 0) {
      await supabase
        .from('team_creation_requests')
        .delete()
        .in('id', orphaned.map((r) => r.id));
    }
    setMyCreationRequests(creationRows.filter((r) => r.status !== 'accepted'));
  }, [ownMembership, profile]);

  useEffect(() => {
    Promise.all([loadRoster(), loadTeamBalance(), loadTeamsAndRequests()]).finally(() => setLoading(false));
  }, [loadRoster, loadTeamBalance, loadTeamsAndRequests]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([loadRoster(), loadTeamBalance(), loadTeamsAndRequests()]);
    setRefreshing(false);
  }, [loadRoster, loadTeamBalance, loadTeamsAndRequests]);

  const hasPendingJoinRequest = Array.from(myRequests.values()).some((r) => r.status === 'pending');
  const hasPendingCreationRequest = myCreationRequests.some((r) => r.status === 'pending');
  const hasPendingRequest = hasPendingJoinRequest || hasPendingCreationRequest;
  // Accepted requests are deleted server-side once the team is created
  // (accept_team_creation_request), so only pending/rejected should ever
  // show up here -- filtered defensively in case of stale data.
  const latestCreationRequest =
    myCreationRequests.find((r) => r.status === 'pending' || r.status === 'rejected') ?? null;

  const applyToTeam = async (team: Team) => {
    if (!profile || hasPendingRequest) return;
    setError(null);
    setApplyingTeamId(team.id);
    const existing = myRequests.get(team.id);
    if (existing && existing.status === 'rejected') {
      const { error: deleteError } = await supabase.from('team_join_requests').delete().eq('id', existing.id);
      if (deleteError) {
        setError(deleteError.message);
        setApplyingTeamId(null);
        return;
      }
    }
    const { error: insertError } = await supabase
      .from('team_join_requests')
      .insert({ team_id: team.id, profile_id: profile.id });
    setApplyingTeamId(null);
    if (insertError) {
      setError(insertError.message);
      return;
    }
    loadTeamsAndRequests();
  };

  const withdrawRequest = async (request: TeamJoinRequest) => {
    setError(null);
    const { error: deleteError } = await supabase.from('team_join_requests').delete().eq('id', request.id);
    if (deleteError) {
      setError(deleteError.message);
      return;
    }
    loadTeamsAndRequests();
  };

  const submitTeamCreation = async () => {
    const name = newTeamName.trim();
    if (!profile || !name || hasPendingRequest) return;
    setError(null);
    setCreatingTeam(true);
    const { error: insertError } = await supabase
      .from('team_creation_requests')
      .insert({ profile_id: profile.id, team_name: name });
    setCreatingTeam(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }
    setNewTeamName('');
    loadTeamsAndRequests();
  };

  const withdrawCreationRequest = async (request: TeamCreationRequest) => {
    setError(null);
    const { error: deleteError } = await supabase.from('team_creation_requests').delete().eq('id', request.id);
    if (deleteError) {
      setError(deleteError.message);
      return;
    }
    loadTeamsAndRequests();
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
      <Text style={styles.title}>Моя команда</Text>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {ownMembership ? (
        <LinearGradient
          colors={[colors.teamGradientStart, colors.teamGradientEnd]}
          start={{ x: 0.15, y: 0 }}
          end={{ x: 0.85, y: 1 }}
          style={styles.teamCard}
        >
          <View style={styles.teamCardHeader}>
            <Avatar uri={ownMembership.team.avatar_url} name={ownMembership.team.name} size={40} />
            <Text style={styles.teamCardTitle}>{ownMembership.team.name}</Text>
          </View>
          <Text style={styles.teamCardBalance}>
            {teamBalance !== null ? `Баланс: ${formatMoney(teamBalance)}` : 'Нет проекта с включённой экономикой'}
          </Text>
          <View style={styles.rosterList}>
            {roster.map((entry) => (
              <View key={entry.profile_id} style={styles.participantRow}>
                <Avatar uri={entry.avatar_url} name={entry.full_name} size={22} />
                <Text style={styles.participant}>{entry.full_name}</Text>
                {entry.profile_id === ownMembership.team.commander_id ? (
                  <MaterialCommunityIcons name="crown" size={14} color={colors.crown} />
                ) : null}
              </View>
            ))}
          </View>
        </LinearGradient>
      ) : (
        <>
          <Text style={styles.label}>Вы пока не состоите ни в одной команде</Text>

          {myRequests.size > 0 ? (
            <>
              <Text style={styles.sectionTitle}>Мои заявки</Text>
              <View style={styles.list}>
                {Array.from(myRequests.values()).map((request) => {
                  const team = allTeams.find((t) => t.id === request.team_id);
                  return (
                    <Card key={request.id} style={styles.teamRow}>
                      <View style={styles.teamRowIdentity}>
                        <Avatar uri={team?.avatar_url ?? null} name={team?.name ?? ''} size={26} />
                        <View>
                          <Text style={styles.teamRowName}>{team?.name ?? '—'}</Text>
                          <Text style={request.status === 'pending' ? styles.statusPending : styles.statusRejected}>
                            {request.status === 'pending' ? 'На рассмотрении' : 'Отклонено'}
                          </Text>
                        </View>
                      </View>
                      <Button
                        title="Отменить"
                        variant="danger"
                        onPress={() => withdrawRequest(request)}
                        style={styles.applyButton}
                      />
                    </Card>
                  );
                })}
              </View>
            </>
          ) : null}

          <Text style={styles.sectionTitle}>Найти команду</Text>
          {hasPendingRequest ? (
            <Text style={styles.label}>
              У вас уже есть заявка на рассмотрении. Отзовите её, чтобы подать заявку в другую команду.
            </Text>
          ) : null}
          <TextField placeholder="Название команды" value={searchQuery} onChangeText={setSearchQuery} />
          {(() => {
            const trimmed = searchQuery.trim();
            if (!trimmed) return <Text style={styles.label}>Введите название, чтобы найти команду</Text>;
            const results = allTeams.filter((t) => t.name.toLowerCase().includes(trimmed.toLowerCase()));
            if (results.length === 0) return <Text style={styles.label}>Ничего не нашлось</Text>;
            return (
              <View style={styles.list}>
                {results.map((team) => {
                  const request = myRequests.get(team.id);
                  const pending = request?.status === 'pending';
                  return (
                    <Card key={team.id} style={styles.teamRow}>
                      <View style={styles.teamRowIdentity}>
                        <Avatar uri={team.avatar_url} name={team.name} size={26} />
                        <Text style={styles.teamRowName}>{team.name}</Text>
                      </View>
                      {pending ? (
                        <Button
                          title="Отменить"
                          variant="danger"
                          onPress={() => request && withdrawRequest(request)}
                          style={styles.applyButton}
                        />
                      ) : hasPendingRequest ? (
                        <Text style={styles.blockedHint}>Сначала отзовите текущую заявку</Text>
                      ) : (
                        <Button
                          title="Подать заявку"
                          onPress={() => applyToTeam(team)}
                          loading={applyingTeamId === team.id}
                          style={styles.applyButton}
                        />
                      )}
                    </Card>
                  );
                })}
              </View>
            );
          })()}

          <Text style={styles.sectionTitle}>Создать команду</Text>
          {latestCreationRequest ? (
            <>
              <Card style={styles.teamRow}>
                <View>
                  <Text style={styles.teamRowName}>{latestCreationRequest.team_name}</Text>
                  <Text style={latestCreationRequest.status === 'pending' ? styles.statusPending : styles.statusRejected}>
                    {latestCreationRequest.status === 'pending'
                      ? 'На рассмотрении у администратора'
                      : 'Ваша заявка на создание отклонена'}
                  </Text>
                </View>
                <Button
                  title="Отменить"
                  variant="danger"
                  onPress={() => withdrawCreationRequest(latestCreationRequest)}
                  style={styles.applyButton}
                />
              </Card>
              {latestCreationRequest.status === 'rejected' ? (
                <Text style={styles.label}>Нажмите «Отменить», чтобы подать новую заявку на создание команды.</Text>
              ) : null}
            </>
          ) : hasPendingJoinRequest ? (
            <Text style={styles.label}>Сначала отзовите заявку на вступление в команду.</Text>
          ) : (
            <>
              <TextField
                placeholder="Название новой команды"
                value={newTeamName}
                onChangeText={setNewTeamName}
              />
              <Button
                title="Подать заявку на создание команды"
                onPress={submitTeamCreation}
                disabled={!newTeamName.trim()}
                loading={creatingTeam}
                style={styles.createTeamButton}
              />
            </>
          )}
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
    marginBottom: spacing.sm + 2,
  },
  label: {
    fontFamily: font.body,
    fontSize: 12,
    color: colors.textMuted,
  },
  teamCard: {
    borderWidth: 1,
    borderColor: colors.teamGradientBorder,
    borderRadius: radii.xl,
    padding: spacing.lg,
  },
  teamCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  teamCardTitle: {
    fontFamily: font.heading,
    fontSize: 18,
    color: colors.text,
  },
  teamCardBalance: {
    fontFamily: font.body,
    fontSize: 12.5,
    color: '#c3d0f5',
    marginTop: 4,
  },
  rosterList: {
    marginTop: spacing.md,
    gap: 7,
  },
  participantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  participant: {
    fontFamily: font.body,
    fontSize: 13,
    color: '#e0e0e0',
  },
  sectionTitle: {
    fontFamily: font.heading,
    fontSize: 15,
    color: colors.text,
    marginTop: spacing.lg,
    marginBottom: spacing.sm + 2,
  },
  list: {
    gap: spacing.sm,
  },
  teamRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
  },
  teamRowIdentity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  teamRowName: {
    fontFamily: font.bodySemiBold,
    fontSize: 13.5,
    color: colors.text,
  },
  applyButton: {
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  statusPending: {
    fontFamily: font.body,
    fontSize: 11,
    color: colors.accent,
    marginTop: 1,
  },
  statusRejected: {
    fontFamily: font.body,
    fontSize: 11,
    color: colors.danger,
    marginTop: 1,
  },
  createTeamButton: {
    marginTop: spacing.sm + 2,
  },
  blockedHint: {
    fontFamily: font.body,
    fontSize: 11,
    color: colors.textDim,
    maxWidth: 130,
    textAlign: 'right',
  },
  error: {
    fontFamily: font.body,
    color: colors.danger,
    marginBottom: spacing.md,
  },
});
