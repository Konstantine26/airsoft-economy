import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { supabase } from '../lib/supabase';
import type { Game, GameSide, Polygon, Profile, Team } from '../lib/database.types';
import { Avatar } from './Avatar';

type RosterRow = { id: string; profile_id: string; full_name: string; avatar_url: string | null };
type GameWithProject = Game & { project_name: string; polygon: Polygon | null };

type Props = {
  teams: Team[];
  projectId: string | null;
};

export function TeamCommanderScreen({ teams, projectId }: Props) {
  const [activeTeam, setActiveTeam] = useState<Team>(teams[0]);
  const [teamBalance, setTeamBalance] = useState(0);
  const [roster, setRoster] = useState<RosterRow[]>([]);
  const [availableProfiles, setAvailableProfiles] = useState<Profile[]>([]);
  const [games, setGames] = useState<GameWithProject[]>([]);
  const [activeGame, setActiveGame] = useState<GameWithProject | null>(null);
  const [sides, setSides] = useState<GameSide[]>([]);
  const [teamSideId, setTeamSideId] = useState<string | null>(null);
  const [registeredProfiles, setRegisteredProfiles] = useState<Map<string, 'pending' | 'confirmed'>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
    setRoster(rows);

    const { data: allProfiles } = await supabase.from('profiles').select('*');
    const rosteredIds = new Set(rows.map((r) => r.profile_id));
    setAvailableProfiles((allProfiles ?? []).filter((p) => !rosteredIds.has(p.id)));
  }, []);

  const loadGames = useCallback(async () => {
    const { data } = await supabase
      .from('games')
      .select('*, project:projects(name), polygon:polygons(*)')
      .order('created_at', { ascending: false });
    const rows: GameWithProject[] = (data ?? []).map((row: any) => ({
      ...row,
      project_name: row.project?.name ?? '',
    }));
    setGames(rows);
  }, []);

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
    Promise.all([loadRoster(activeTeam), loadGames(), loadBalance()]).finally(() => setLoading(false));
  }, [activeTeam, loadRoster, loadGames, loadBalance]);

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
        supabase
          .from('game_participants')
          .select('profile_id, status')
          .eq('game_id', game.id)
          .eq('team_id', activeTeam.id),
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

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  if (activeGame) {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <Pressable onPress={() => setActiveGame(null)}>
          <Text style={styles.back}>‹ Игры</Text>
        </Pressable>
        <Text style={styles.title}>{activeGame.name}</Text>
        <Text style={styles.subtitle}>{activeGame.project_name} · {activeGame.polygon?.name ?? '—'}</Text>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Text style={styles.sectionTitle}>Сторона команды {activeTeam.name}</Text>
        <View style={styles.chips}>
          {sides.map((side) => (
            <Pressable
              key={side.id}
              style={[styles.chip, teamSideId === side.id && styles.chipSelected]}
              onPress={() => pickSide(side.id)}
            >
              <Text style={teamSideId === side.id ? styles.chipTextSelected : styles.chipText}>
                {side.name}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.sectionTitle}>Состав на игру</Text>
        {!teamSideId ? (
          <Text style={styles.label}>Сначала выберите сторону</Text>
        ) : (
          roster.map((row) => {
            const status = registeredProfiles.get(row.profile_id);
            return (
              <Pressable
                key={row.id}
                style={styles.rosterRow}
                onPress={() => toggleParticipant(row.profile_id)}
              >
                <View style={styles.rosterIdentity}>
                  <Avatar uri={row.avatar_url} name={row.full_name} size={28} />
                  <Text style={styles.rosterName}>{row.full_name}</Text>
                </View>
                <Text style={status ? styles.checkOn : styles.checkOff}>
                  {status === 'confirmed'
                    ? 'Подтверждён'
                    : status === 'pending'
                      ? 'На подтверждении'
                      : 'Не играет'}
                </Text>
              </Pressable>
            );
          })
        )}
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Моя команда</Text>

      {teams.length > 1 ? (
        <View style={styles.chips}>
          {teams.map((team) => (
            <Pressable
              key={team.id}
              style={[styles.chip, activeTeam.id === team.id && styles.chipSelected]}
              onPress={() => setActiveTeam(team)}
            >
              <Text style={activeTeam.id === team.id ? styles.chipTextSelected : styles.chipText}>
                {team.name}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {projectId ? (
        <Text style={styles.subtitle}>Баланс команды: {teamBalance.toFixed(2)} ₽</Text>
      ) : (
        <Text style={styles.subtitle}>Нет проекта с включённой экономикой</Text>
      )}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Text style={styles.sectionTitle}>Ростер</Text>
      {roster.map((row) => (
        <View key={row.id} style={styles.rosterCard}>
          <View style={styles.rosterRow}>
            <View style={styles.rosterIdentity}>
              <Avatar uri={row.avatar_url} name={row.full_name} size={28} />
              <Text style={styles.rosterName}>{row.full_name}</Text>
            </View>
            <Pressable onPress={() => removeMember(row)}>
              <Text style={styles.removeText}>Убрать</Text>
            </Pressable>
          </View>
          {projectId ? (
            <DistributeRow onDistribute={(amount) => distribute(row.profile_id, amount)} />
          ) : null}
        </View>
      ))}

      <Text style={styles.sectionTitle}>Добавить в команду</Text>
      {availableProfiles.map((p) => (
        <Pressable key={p.id} style={styles.rosterRow} onPress={() => addMember(p)}>
          <View style={styles.rosterIdentity}>
            <Avatar uri={p.avatar_url} name={p.full_name} size={28} />
            <Text style={styles.rosterName}>{p.full_name || '(без имени)'}</Text>
          </View>
          <Text style={styles.addText}>+ Добавить</Text>
        </Pressable>
      ))}

      <Text style={styles.sectionTitle}>Игры</Text>
      {games.map((game) => (
        <Pressable key={game.id} style={styles.card} onPress={() => openGame(game)}>
          <Text style={styles.cardTitle}>{game.name}</Text>
          <Text style={styles.label}>{game.project_name} · {game.polygon?.name ?? '—'}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

function DistributeRow({ onDistribute }: { onDistribute: (amount: number) => void }) {
  const [amount, setAmount] = useState('');

  const submit = () => {
    const numeric = Number(amount.replace(',', '.'));
    if (!Number.isFinite(numeric) || numeric <= 0) return;
    onDistribute(numeric);
    setAmount('');
  };

  return (
    <View style={styles.distributeRow}>
      <TextInput
        style={styles.distributeInput}
        placeholder="Сумма"
        value={amount}
        onChangeText={setAmount}
        keyboardType="decimal-pad"
      />
      <Pressable style={styles.distributeButton} onPress={submit}>
        <Text style={styles.distributeButtonText}>Выдать</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  back: {
    color: '#666',
    marginBottom: 8,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    marginTop: 16,
    marginBottom: 8,
  },
  card: {
    borderWidth: 1,
    borderColor: '#eee',
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  label: {
    fontSize: 13,
    color: '#666',
    marginTop: 4,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  chip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#ccc',
  },
  chipSelected: {
    backgroundColor: '#111',
    borderColor: '#111',
  },
  chipText: {
    color: '#111',
    fontSize: 13,
  },
  chipTextSelected: {
    color: '#fff',
    fontSize: 13,
  },
  rosterCard: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#ddd',
    paddingVertical: 8,
  },
  rosterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  rosterIdentity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  distributeRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 6,
    marginBottom: 4,
  },
  distributeInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 14,
  },
  distributeButton: {
    backgroundColor: '#111',
    borderRadius: 8,
    paddingHorizontal: 14,
    justifyContent: 'center',
  },
  distributeButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 13,
  },
  rosterName: {
    fontSize: 15,
  },
  removeText: {
    color: '#c00',
    fontSize: 13,
  },
  addText: {
    color: '#0a7d2c',
    fontSize: 13,
  },
  checkOn: {
    color: '#0a7d2c',
    fontWeight: '600',
  },
  checkOff: {
    color: '#999',
  },
  error: {
    color: '#c00',
    marginBottom: 12,
  },
});
