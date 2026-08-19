import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { supabase } from '../lib/supabase';
import type { Game, GameSide, Polygon, Profile, Team, TeamJoinRequest } from '../lib/database.types';
import { Avatar } from './Avatar';
import { Button } from './Button';
import { Card } from './Card';
import { Chip } from './Chip';
import { TextField } from './TextField';
import { AmountForm } from './AmountForm';
import { colors, font, radii, spacing } from '../lib/theme';
import { confirmAsync } from '../lib/confirm';
import { formatMoney } from '../lib/format';

type RosterRow = { id: string; profile_id: string; full_name: string; avatar_url: string | null };
type GameWithProject = Game & { project_name: string; polygon: Polygon | null };

type Props = {
  teams: Team[];
  projectId: string | null;
  activeProjectId: string | null;
  onTeamDisbanded: () => void;
};

const TEAM_AVATAR_BUCKET = 'team-avatars';

export function TeamCommanderScreen({ teams, projectId, activeProjectId, onTeamDisbanded }: Props) {
  const [activeTeam, setActiveTeam] = useState<Team>(teams[0]);
  const [activeTab, setActiveTab] = useState<'team' | 'requests' | 'games' | 'budget'>('team');
  const [addQuery, setAddQuery] = useState('');
  const [teamBalance, setTeamBalance] = useState(0);
  const [roster, setRoster] = useState<RosterRow[]>([]);
  const [availableProfiles, setAvailableProfiles] = useState<Profile[]>([]);
  const [joinRequests, setJoinRequests] = useState<(TeamJoinRequest & { profile: Profile | null })[]>([]);
  const [reviewingRequestId, setReviewingRequestId] = useState<string | null>(null);
  const [games, setGames] = useState<GameWithProject[]>([]);
  const [activeGame, setActiveGame] = useState<GameWithProject | null>(null);
  const [sides, setSides] = useState<GameSide[]>([]);
  const [teamSideId, setTeamSideId] = useState<string | null>(null);
  const [registeredProfiles, setRegisteredProfiles] = useState<Map<string, 'pending' | 'confirmed'>>(new Map());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [disbanding, setDisbanding] = useState(false);

  useEffect(() => {
    setActiveTeam((prev) => (teams.some((t) => t.id === prev.id) ? prev : (teams[0] ?? prev)));
  }, [teams]);

  const changeTeamAvatar = useCallback(async () => {
    setError(null);
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setError('Нет доступа к галерее');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled) return;

    setUploadingAvatar(true);
    try {
      const asset = result.assets[0];
      const arrayBuffer = await fetch(asset.uri).then((res) => res.arrayBuffer());
      const path = `${activeTeam.id}/avatar.jpg`;
      const { error: uploadError } = await supabase.storage
        .from(TEAM_AVATAR_BUCKET)
        .upload(path, arrayBuffer, { contentType: asset.mimeType ?? 'image/jpeg', upsert: true });
      if (uploadError) throw uploadError;

      const publicUrl = supabase.storage.from(TEAM_AVATAR_BUCKET).getPublicUrl(path).data.publicUrl;
      const avatarUrl = `${publicUrl}?v=${Date.now()}`;

      const { error: rpcError } = await supabase.rpc('set_team_avatar', {
        p_team_id: activeTeam.id,
        p_avatar_url: avatarUrl,
      });
      if (rpcError) throw rpcError;

      setActiveTeam((prev) => ({ ...prev, avatar_url: avatarUrl }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось загрузить фото');
    } finally {
      setUploadingAvatar(false);
    }
  }, [activeTeam.id]);

  const loadRoster = useCallback(async (team: Team) => {
    const { data } = await supabase
      .from('team_members')
      .select('id, profile_id, profile:profiles(full_name, avatar_url)')
      .eq('team_id', team.id);
    const rows: RosterRow[] = (data ?? []).map((row: any) => ({
      id: row.id,
      profile_id: row.profile_id,
      full_name: row.profile?.full_name || '(без имени)',
      avatar_url: row.profile?.avatar_url ?? null,
    }));
    rows.sort((a, b) => Number(b.profile_id === team.commander_id) - Number(a.profile_id === team.commander_id));
    setRoster(rows);

    const { data: allProfiles } = await supabase.from('profiles').select('*');
    const rosteredIds = new Set(rows.map((r) => r.profile_id));
    setAvailableProfiles((allProfiles ?? []).filter((p) => !rosteredIds.has(p.id)));
  }, []);

  const loadJoinRequests = useCallback(async (team: Team) => {
    const { data } = await supabase
      .from('team_join_requests')
      .select('*, profile:profiles(*)')
      .eq('team_id', team.id)
      .eq('status', 'pending')
      .order('created_at', { ascending: true });
    setJoinRequests((data as any[]) ?? []);
  }, []);

  const loadGames = useCallback(async () => {
    const { data } = await supabase
      .from('games')
      .select('*, project:projects(name), polygon:polygons(*)')
      .order('created_at', { ascending: false });
    const rows: GameWithProject[] = (data ?? [])
      .filter((row: any) => row.project_id === activeProjectId)
      .map((row: any) => ({
        ...row,
        project_name: row.project?.name ?? '',
      }));
    setGames(rows);
  }, [activeProjectId]);

  const loadBalance = useCallback(async () => {
    if (!projectId) {
      setTeamBalance(0);
      return;
    }
    const { data } = await supabase
      .from('project_team_balances')
      .select('*')
      .eq('project_id', projectId)
      .eq('team_id', activeTeam.id)
      .maybeSingle();
    setTeamBalance(data?.balance ?? 0);
  }, [activeTeam, projectId]);

  useEffect(() => {
    setLoading(true);
    Promise.all([loadRoster(activeTeam), loadJoinRequests(activeTeam), loadGames(), loadBalance()]).finally(() =>
      setLoading(false)
    );
  }, [activeTeam, loadRoster, loadJoinRequests, loadGames, loadBalance]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([loadRoster(activeTeam), loadJoinRequests(activeTeam), loadGames(), loadBalance()]);
    setRefreshing(false);
  }, [activeTeam, loadRoster, loadJoinRequests, loadGames, loadBalance]);

  const acceptRequest = async (request: TeamJoinRequest) => {
    setError(null);
    setReviewingRequestId(request.id);
    const { error: rpcError } = await supabase.rpc('accept_team_join_request', { p_request_id: request.id });
    setReviewingRequestId(null);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    loadJoinRequests(activeTeam);
    loadRoster(activeTeam);
  };

  const rejectRequest = async (request: TeamJoinRequest) => {
    setError(null);
    setReviewingRequestId(request.id);
    const { error: updateError } = await supabase
      .from('team_join_requests')
      .update({ status: 'rejected' })
      .eq('id', request.id);
    setReviewingRequestId(null);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    loadJoinRequests(activeTeam);
  };

  const disbandTeam = async () => {
    const ok = await confirmAsync(
      'Расформировать команду?',
      `Команда «${activeTeam.name}» будет удалена: все участники будут исключены из команды, бюджет команды будет потерян. Действие необратимо.`,
      'Расформировать'
    );
    if (!ok) return;
    setError(null);
    setDisbanding(true);
    const { error: rpcError } = await supabase.rpc('disband_team', { p_team_id: activeTeam.id });
    setDisbanding(false);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    onTeamDisbanded();
  };

  const openGame = useCallback(
    async (game: GameWithProject) => {
      setActiveGame(game);
      setError(null);
      const [sidesRes, teamSideRes, participantsRes] = await Promise.all([
        supabase.from('game_sides').select('*').eq('game_id', game.id),
        supabase
          .from('game_team_sides')
          .select('*')
          .eq('game_id', game.id)
          .eq('team_id', activeTeam.id)
          .maybeSingle(),
        supabase.from('game_participants').select('profile_id, status').eq('game_id', game.id),
      ]);
      setSides(sidesRes.data ?? []);
      setTeamSideId(teamSideRes.data?.side_id ?? null);
      setRegisteredProfiles(new Map((participantsRes.data ?? []).map((r) => [r.profile_id, r.status])));
    },
    [activeTeam]
  );

  const addMember = async (profile: Profile) => {
    setError(null);
    const { error } = await supabase
      .from('team_members')
      .insert({ team_id: activeTeam.id, profile_id: profile.id });
    if (error) {
      setError(error.message);
      return;
    }
    setAddQuery('');
    loadRoster(activeTeam);
  };

  const removeMember = async (row: RosterRow) => {
    setError(null);
    const { error } = await supabase.from('team_members').delete().eq('id', row.id);
    if (error) {
      setError(error.message);
      return;
    }
    loadRoster(activeTeam);
  };

  const distribute = async (profileId: string, amount: number) => {
    if (!projectId) return;
    setError(null);
    const { error } = await supabase.rpc('distribute_to_participant', {
      p_project_id: projectId,
      p_from_team_id: activeTeam.id,
      p_to_profile_id: profileId,
      p_amount: amount,
    });
    if (error) {
      setError(error.message);
      return;
    }
    setTeamBalance((b) => b - amount);
  };

  const pickSide = async (sideId: string) => {
    if (!activeGame) return;
    setError(null);

    // Team members already submitted for this game were approved (or are
    // pending) for the OLD side -- switching sides means that approval no
    // longer applies, so pull them all and resubmit as fresh pending
    // applications under the new side.
    const registeredTeamProfileIds = roster.map((r) => r.profile_id).filter((id) => registeredProfiles.has(id));

    if (registeredTeamProfileIds.length > 0) {
      const { error: removeError } = await supabase
        .from('game_participants')
        .delete()
        .eq('game_id', activeGame.id)
        .eq('team_id', activeTeam.id)
        .in('profile_id', registeredTeamProfileIds);
      if (removeError) {
        setError(removeError.message);
        return;
      }
    }

    const { error } = await supabase
      .from('game_team_sides')
      .upsert(
        { game_id: activeGame.id, team_id: activeTeam.id, side_id: sideId },
        { onConflict: 'game_id,team_id' }
      );
    if (error) {
      setError(error.message);
      return;
    }
    setTeamSideId(sideId);

    if (registeredTeamProfileIds.length > 0) {
      const rows = registeredTeamProfileIds.map((profile_id) => ({
        game_id: activeGame.id,
        team_id: activeTeam.id,
        profile_id,
      }));
      const { error: insertError } = await supabase.from('game_participants').insert(rows);
      if (insertError) {
        setError(insertError.message);
        return;
      }
      setRegisteredProfiles((prev) => {
        const next = new Map(prev);
        for (const id of registeredTeamProfileIds) next.set(id, 'pending');
        return next;
      });
    }
  };

  const handleSidePress = async (sideId: string) => {
    if (teamSideId && teamSideId !== sideId) {
      const sideName = sides.find((s) => s.id === sideId)?.name ?? '';
      const ok = await confirmAsync(
        'Сменить сторону?',
        `Команда уже записана на другую сторону. Все поданные заявки команды на эту игру будут сняты и поданы заново для стороны «${sideName}», ожидая нового подтверждения организатора. Сменить?`,
        'Сменить'
      );
      if (!ok) return;
    }
    pickSide(sideId);
  };

  const toggleParticipant = async (profileId: string) => {
    if (!activeGame) return;
    setError(null);
    if (registeredProfiles.has(profileId)) {
      const { error } = await supabase
        .from('game_participants')
        .delete()
        .eq('game_id', activeGame.id)
        .eq('profile_id', profileId);
      if (error) {
        setError(error.message);
        return;
      }
      setRegisteredProfiles((prev) => {
        const next = new Map(prev);
        next.delete(profileId);
        return next;
      });
    } else {
      const { error } = await supabase
        .from('game_participants')
        .insert({ game_id: activeGame.id, team_id: activeTeam.id, profile_id: profileId });
      if (error) {
        setError(error.message);
        return;
      }
      setRegisteredProfiles((prev) => new Map(prev).set(profileId, 'pending'));
    }
  };

  const handleRosterPress = async (row: RosterRow) => {
    if (registeredProfiles.get(row.profile_id) === 'confirmed') {
      const ok = await confirmAsync(
        'Убрать из состава?',
        `${row.full_name} уже подтверждён(а) организатором на эту игру. Убрать из состава?`,
        'Убрать'
      );
      if (!ok) return;
    }
    toggleParticipant(row.profile_id);
  };

  const addQueryTrimmed = addQuery.trim();
  const addResults = !addQueryTrimmed
    ? []
    : availableProfiles.filter((p) =>
        /^\d+$/.test(addQueryTrimmed)
          ? String(p.participant_number).includes(addQueryTrimmed)
          : p.full_name.toLowerCase().includes(addQueryTrimmed.toLowerCase())
      );

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (activeGame) {
    return (
      <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} colors={[colors.accent]} />}
    >
        <Pressable onPress={() => setActiveGame(null)}>
          <Text style={styles.back}>‹ Игры</Text>
        </Pressable>
        <Text style={styles.title}>{activeGame.name}</Text>
        <Text style={styles.subtitle}>{activeGame.project_name} · {activeGame.polygon?.name ?? '—'}</Text>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={styles.teamIdentityRowSmall}>
          <Avatar uri={activeTeam.avatar_url} name={activeTeam.name} size={24} />
          <Text style={[styles.sectionTitle, styles.sectionTitleInRow]}>Сторона команды {activeTeam.name}</Text>
        </View>
        <View style={styles.chips}>
          {sides.map((side) => (
            <Chip key={side.id} label={side.name} selected={teamSideId === side.id} onPress={() => handleSidePress(side.id)} />
          ))}
        </View>

        <Text style={styles.sectionTitle}>Состав на игру</Text>
        {!teamSideId ? (
          <Text style={styles.label}>Сначала выберите сторону</Text>
        ) : (
          <View style={styles.rosterList}>
            {roster.map((row) => {
              const status = registeredProfiles.get(row.profile_id);
              return (
                <Card key={row.id} style={styles.rosterRowCard}>
                  <Pressable style={styles.rosterRow} onPress={() => handleRosterPress(row)}>
                    <View style={styles.rosterIdentity}>
                      <Avatar uri={row.avatar_url} name={row.full_name} size={22} />
                      <Text style={styles.rosterName}>{row.full_name}</Text>
                    </View>
                    <Text style={status === 'confirmed' ? styles.statusConfirmed : status === 'pending' ? styles.statusPending : styles.statusOff}>
                      {status === 'confirmed' ? 'Подтверждён' : status === 'pending' ? 'На подтверждении' : 'Не играет'}
                    </Text>
                  </Pressable>
                </Card>
              );
            })}
          </View>
        )}
      </ScrollView>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} colors={[colors.accent]} />}
    >
      <Text style={styles.title}>Моя команда</Text>

      <View style={styles.subNav}>
        <Chip label="Моя команда" selected={activeTab === 'team'} onPress={() => setActiveTab('team')} />
        <Chip
          label={joinRequests.length > 0 ? `Заявки (${joinRequests.length})` : 'Заявки'}
          selected={activeTab === 'requests'}
          onPress={() => setActiveTab('requests')}
        />
        <Chip label="Игры" selected={activeTab === 'games'} onPress={() => setActiveTab('games')} />
        <Chip label="Бюджет" selected={activeTab === 'budget'} onPress={() => setActiveTab('budget')} />
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {activeTab === 'team' ? (
        <>
          <View style={styles.teamIdentityRow}>
            <Pressable onPress={changeTeamAvatar} disabled={uploadingAvatar}>
              {uploadingAvatar ? (
                <View style={[styles.avatarLoading, { width: 48, height: 48, borderRadius: 24 }]}>
                  <ActivityIndicator size="small" color={colors.accent} />
                </View>
              ) : (
                <Avatar uri={activeTeam.avatar_url} name={activeTeam.name} size={48} />
              )}
            </Pressable>
            <View>
              <Text style={styles.teamName}>{activeTeam.name}</Text>
              <Text style={styles.avatarHint}>Нажмите на фото, чтобы изменить</Text>
            </View>
          </View>

          {teams.length > 1 ? (
            <View style={styles.chips}>
              {teams.map((team) => (
                <Chip key={team.id} label={team.name} selected={activeTeam.id === team.id} onPress={() => setActiveTeam(team)} />
              ))}
            </View>
          ) : null}

          <Text style={styles.sectionTitle}>Ростер</Text>
          <View style={styles.rosterList}>
            {roster.map((row) => (
              <Card key={row.id}>
                <View style={styles.rosterRow}>
                  <View style={styles.rosterIdentity}>
                    <Avatar uri={row.avatar_url} name={row.full_name} size={22} />
                    <Text style={styles.rosterName}>{row.full_name}</Text>
                    {row.profile_id === activeTeam.commander_id ? (
                      <MaterialCommunityIcons name="crown" size={14} color={colors.crown} />
                    ) : null}
                  </View>
                  <Pressable onPress={() => removeMember(row)}>
                    <Text style={styles.removeText}>Убрать</Text>
                  </Pressable>
                </View>
              </Card>
            ))}
          </View>

          <Text style={styles.sectionTitle}>Добавить в команду</Text>
          <TextField
            style={styles.input}
            placeholder="Номер участника или позывной"
            value={addQuery}
            onChangeText={setAddQuery}
          />
          {!addQueryTrimmed ? (
            <Text style={styles.label}>Введите номер или позывной, чтобы найти игрока</Text>
          ) : addResults.length === 0 ? (
            <Text style={styles.label}>Никого не нашлось</Text>
          ) : (
            <View style={styles.rosterList}>
              {addResults.map((p) => (
                <Pressable key={p.id} style={styles.addRow} onPress={() => addMember(p)}>
                  <View style={styles.rosterIdentity}>
                    <Avatar uri={p.avatar_url} name={p.full_name} size={22} />
                    <Text style={styles.rosterName}>{p.full_name || '(без имени)'} · №{p.participant_number}</Text>
                  </View>
                  <Text style={styles.addText}>+ Добавить</Text>
                </Pressable>
              ))}
            </View>
          )}

          <Text style={styles.sectionTitle}>Опасная зона</Text>
          <Button
            title="Расформировать команду"
            variant="danger"
            onPress={disbandTeam}
            loading={disbanding}
            style={styles.disbandButton}
          />
        </>
      ) : null}

      {activeTab === 'requests' ? (
        joinRequests.length === 0 ? (
          <Text style={styles.label}>Заявок на вступление нет</Text>
        ) : (
          <View style={styles.rosterList}>
            {joinRequests.map((request) => (
              <Card key={request.id}>
                <View style={styles.rosterRow}>
                  <View style={styles.rosterIdentity}>
                    <Avatar uri={request.profile?.avatar_url ?? null} name={request.profile?.full_name ?? ''} size={22} />
                    <Text style={styles.rosterName}>
                      {request.profile?.full_name || '(без имени)'}
                      {request.profile ? ` · №${request.profile.participant_number}` : ''}
                    </Text>
                  </View>
                </View>
                <View style={styles.requestActions}>
                  <Button
                    title="Принять"
                    variant="success"
                    onPress={() => acceptRequest(request)}
                    loading={reviewingRequestId === request.id}
                    style={styles.requestButton}
                  />
                  <Button
                    title="Отклонить"
                    variant="danger"
                    onPress={() => rejectRequest(request)}
                    loading={reviewingRequestId === request.id}
                    style={styles.requestButton}
                  />
                </View>
              </Card>
            ))}
          </View>
        )
      ) : null}

      {activeTab === 'games' ? (
        <View style={styles.rosterList}>
          {games.map((game) => (
            <Pressable key={game.id} onPress={() => openGame(game)}>
              <Card>
                <Text style={styles.cardTitle}>{game.name}</Text>
                <Text style={styles.label}>{game.project_name} · {game.polygon?.name ?? '—'}</Text>
              </Card>
            </Pressable>
          ))}
        </View>
      ) : null}

      {activeTab === 'budget' ? (
        <>
          {projectId ? (
            <Text style={styles.subtitle}>Баланс команды: {formatMoney(teamBalance)}</Text>
          ) : (
            <Text style={styles.subtitle}>Нет проекта с включённой экономикой</Text>
          )}
          <View style={styles.rosterList}>
            {roster.map((row) => (
              <Card key={row.id}>
                <View style={styles.rosterRow}>
                  <View style={styles.rosterIdentity}>
                    <Avatar uri={row.avatar_url} name={row.full_name} size={22} />
                    <Text style={styles.rosterName}>{row.full_name}</Text>
                  </View>
                </View>
                {projectId ? (
                  <AmountForm buttonLabel="Выдать" onSubmit={(amount) => distribute(row.profile_id, amount)} />
                ) : null}
              </Card>
            ))}
          </View>
        </>
      ) : null}
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
  back: {
    fontFamily: font.body,
    color: colors.textMuted,
    marginBottom: spacing.sm,
  },
  title: {
    fontFamily: font.heading,
    fontSize: 19,
    color: colors.text,
  },
  subtitle: {
    fontFamily: font.body,
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 4,
    marginBottom: spacing.md,
  },
  subNav: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  teamIdentityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 2,
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  teamIdentityRowSmall: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: spacing.lg,
  },
  sectionTitleInRow: {
    marginTop: 0,
    marginBottom: 0,
  },
  teamName: {
    fontFamily: font.heading,
    fontSize: 17,
    color: colors.text,
  },
  avatarHint: {
    fontFamily: font.body,
    fontSize: 11,
    color: colors.textDim,
    marginTop: 2,
  },
  avatarLoading: {
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    fontFamily: font.heading,
    fontSize: 15,
    color: colors.text,
    marginTop: spacing.lg,
    marginBottom: spacing.sm + 2,
  },
  cardTitle: {
    fontFamily: font.bodySemiBold,
    fontSize: 13.5,
    color: colors.text,
  },
  label: {
    fontFamily: font.body,
    fontSize: 11.5,
    color: colors.textMuted,
    marginTop: 3,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: spacing.sm,
  },
  input: {
    marginBottom: spacing.sm + 2,
  },
  rosterList: {
    gap: spacing.sm,
  },
  rosterRowCard: {
    padding: 0,
    overflow: 'hidden',
  },
  rosterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
  },
  requestActions: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 12,
    paddingBottom: 12,
  },
  requestButton: {
    flex: 1,
    paddingVertical: 9,
  },
  disbandButton: {
    marginBottom: spacing.lg,
  },
  addRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radii.lg,
    padding: 12,
  },
  rosterIdentity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  rosterName: {
    fontFamily: font.bodySemiBold,
    fontSize: 13.5,
    color: colors.text,
  },
  removeText: {
    fontFamily: font.body,
    color: colors.danger,
    fontSize: 12,
  },
  addText: {
    fontFamily: font.body,
    color: colors.success,
    fontSize: 12,
  },
  statusConfirmed: {
    fontFamily: font.body,
    color: colors.success,
    fontSize: 11,
  },
  statusPending: {
    fontFamily: font.body,
    color: colors.accent,
    fontSize: 11,
  },
  statusOff: {
    fontFamily: font.body,
    color: colors.textDim,
    fontSize: 11,
  },
  error: {
    fontFamily: font.body,
    color: colors.danger,
    marginBottom: spacing.md,
  },
});
