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
import type { Profile, Team } from '../lib/database.types';
import { AmountForm } from './AmountForm';

type Props = {
  activeProjectId: string | null;
};

export function AdminTeamsTab({ activeProjectId }: Props) {
  const [teams, setTeams] = useState<Team[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [balances, setBalances] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newTeamName, setNewTeamName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const [teamsRes, profilesRes, balancesRes] = await Promise.all([
      supabase.from('teams').select('*').order('name', { ascending: true }),
      supabase.from('profiles').select('*').order('full_name', { ascending: true }),
      activeProjectId
        ? supabase.from('project_team_balances').select('*').eq('project_id', activeProjectId)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (teamsRes.error) setError(teamsRes.error.message);
    setTeams(teamsRes.data ?? []);
    setProfiles(profilesRes.data ?? []);
    setBalances(new Map((balancesRes.data ?? []).map((row) => [row.team_id, row.balance])));
    setLoading(false);
  }, [activeProjectId]);

  useEffect(() => {
    load();
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

  const setCommander = async (teamId: string, profileId: string | null) => {
    setError(null);
    const { error } = await supabase.from('teams').update({ commander_id: profileId }).eq('id', teamId);
    if (error) {
      setError(error.message);
      return;
    }
    setTeams((prev) => prev.map((t) => (t.id === teamId ? { ...t, commander_id: profileId } : t)));
  };

  const deposit = async (teamId: string, amount: number) => {
    if (!activeProjectId) return;
    setError(null);
    const { error } = await supabase.rpc('deposit_to_team', {
      p_project_id: activeProjectId,
      p_to_team_id: teamId,
      p_amount: amount,
    });
    if (error) {
      setError(error.message);
      return;
    }
    setBalances((prev) => new Map(prev).set(teamId, (prev.get(teamId) ?? 0) + amount));
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {!activeProjectId ? (
        <Text style={styles.label}>
          Нет проекта с включённой экономикой — пополнение недоступно. Включите «Ведение экономики» во
          вкладке «Проекты и игры».
        </Text>
      ) : null}

      {teams.map((team) => (
        <View key={team.id} style={styles.card}>
          {editingId === team.id ? (
            <View style={styles.row}>
              <TextInput
                style={[styles.input, styles.flexInput]}
                value={editingName}
                onChangeText={setEditingName}
              />
              <Pressable style={styles.smallButton} onPress={() => saveRename(team)}>
                <Text style={styles.smallButtonText}>Сохранить</Text>
              </Pressable>
              <Pressable onPress={() => setEditingId(null)}>
                <Text style={styles.cancelText}>Отмена</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.row}>
              <Text style={styles.cardTitle}>{team.name}</Text>
              <Pressable onPress={() => startRename(team)}>
                <Text style={styles.editText}>Переименовать</Text>
              </Pressable>
              <Pressable onPress={() => deleteTeam(team)}>
                <Text style={styles.deleteText}>Удалить</Text>
              </Pressable>
            </View>
          )}

          {activeProjectId ? (
            <>
              <Text style={styles.label}>Баланс в проекте: {(balances.get(team.id) ?? 0).toFixed(2)} ₽</Text>
              <AmountForm
                placeholder="Пополнить баланс команды"
                buttonLabel="Пополнить"
                onSubmit={(amount) => deposit(team.id, amount)}
              />
            </>
          ) : null}

          <Text style={styles.label}>Командир</Text>
          <View style={styles.chips}>
            <Pressable
              style={[styles.chip, !team.commander_id && styles.chipSelected]}
              onPress={() => setCommander(team.id, null)}
            >
              <Text style={!team.commander_id ? styles.chipTextSelected : styles.chipText}>—</Text>
            </Pressable>
            {profiles.map((p) => (
              <Pressable
                key={p.id}
                style={[styles.chip, team.commander_id === p.id && styles.chipSelected]}
                onPress={() => setCommander(team.id, p.id)}
              >
                <Text style={team.commander_id === p.id ? styles.chipTextSelected : styles.chipText}>
                  {p.full_name || '(без имени)'}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      ))}

      <Text style={styles.sectionTitle}>Новая команда</Text>
      <View style={styles.row}>
        <TextInput
          style={[styles.input, styles.flexInput]}
          placeholder="Название команды"
          value={newTeamName}
          onChangeText={setNewTeamName}
        />
        <Pressable style={styles.smallButton} onPress={createTeam}>
          <Text style={styles.smallButtonText}>Добавить</Text>
        </Pressable>
      </View>
    </ScrollView>
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
  card: {
    borderWidth: 1,
    borderColor: '#eee',
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '600',
    flex: 1,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginTop: 16,
    marginBottom: 8,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
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
  error: {
    color: '#c00',
    marginBottom: 12,
  },
  label: {
    fontSize: 13,
    color: '#666',
    marginTop: 10,
    marginBottom: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
  },
  flexInput: {
    flex: 1,
  },
  smallButton: {
    backgroundColor: '#111',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  smallButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 13,
  },
  editText: {
    color: '#111',
    fontSize: 13,
  },
  deleteText: {
    color: '#c00',
    fontSize: 13,
  },
  cancelText: {
    color: '#666',
    fontSize: 13,
  },
});
