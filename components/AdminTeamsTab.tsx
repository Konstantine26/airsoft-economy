import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { supabase } from '../lib/supabase';
import type { Profile, Team } from '../lib/database.types';
import { AmountForm } from './AmountForm';
import { Avatar } from './Avatar';
import { Card } from './Card';
import { Chip } from './Chip';
import { Button } from './Button';
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
        <ActivityIndicator color={colors.accent} />
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

      <View style={styles.list}>
        {teams.map((team) => (
          <Card key={team.id}>
            {editingId === team.id ? (
              <View style={styles.row}>
                <TextField style={styles.flexInput} value={editingName} onChangeText={setEditingName} />
                <Pressable onPress={() => saveRename(team)}>
                  <Text style={styles.saveText}>Сохранить</Text>
                </Pressable>
                <Pressable onPress={() => setEditingId(null)}>
                  <Text style={styles.cancelText}>Отмена</Text>
                </Pressable>
              </View>
            ) : (
              <View style={styles.row}>
                <Avatar uri={team.avatar_url} name={team.name} size={30} />
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
                <Text style={styles.label}>Баланс в проекте: {formatMoney(balances.get(team.id) ?? 0)}</Text>
                <AmountForm
                  placeholder="Пополнить баланс команды"
                  buttonLabel="Пополнить"
                  onSubmit={(amount) => deposit(team.id, amount)}
                />
              </>
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
