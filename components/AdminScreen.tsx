import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { supabase } from '../lib/supabase';
import type { Profile, Role, Team } from '../lib/database.types';

const ROLES: Role[] = ['member', 'organizer', 'admin'];
const ROLE_LABEL: Record<Role, string> = {
  member: 'Участник',
  organizer: 'Организатор',
  admin: 'Админ',
};

export function AdminScreen() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [profilesRes, teamsRes] = await Promise.all([
      supabase.from('profiles').select('*').order('full_name', { ascending: true }),
      supabase.from('teams').select('*').order('name', { ascending: true }),
    ]);
    if (profilesRes.error) setError(profilesRes.error.message);
    setProfiles(profilesRes.data ?? []);
    setTeams(teamsRes.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const setRole = async (profileId: string, role: Role) => {
    setError(null);
    const { error } = await supabase.from('profiles').update({ role }).eq('id', profileId);
    if (error) {
      setError(error.message);
      return;
    }
    setProfiles((prev) => prev.map((p) => (p.id === profileId ? { ...p, role } : p)));
  };

  const deposit = async (profileId: string, amount: number) => {
    setError(null);
    const { error } = await supabase.rpc('deposit_to_participant', {
      p_to_profile_id: profileId,
      p_amount: amount,
    });
    if (error) {
      setError(error.message);
      return;
    }
    setProfiles((prev) =>
      prev.map((p) => (p.id === profileId ? { ...p, balance: p.balance + amount } : p))
    );
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
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Text style={styles.sectionTitle}>Пользователи</Text>
      {profiles.map((p) => (
        <View key={p.id} style={styles.card}>
          <Text style={styles.cardTitle}>
            {p.full_name || '(без имени)'} · №{p.participant_number}
          </Text>
          <Text style={styles.label}>Баланс: {p.balance.toFixed(2)} ₽</Text>
          <View style={styles.chips}>
            {ROLES.map((role) => (
              <Pressable
                key={role}
                style={[styles.chip, p.role === role && styles.chipSelected]}
                onPress={() => setRole(p.id, role)}
              >
                <Text style={p.role === role ? styles.chipTextSelected : styles.chipText}>
                  {ROLE_LABEL[role]}
                </Text>
              </Pressable>
            ))}
          </View>
          <DepositRow profileId={p.id} onDeposit={(amount) => deposit(p.id, amount)} />
        </View>
      ))}

      <Text style={styles.sectionTitle}>Командиры команд</Text>
      {teams.map((team) => (
        <View key={team.id} style={styles.card}>
          <Text style={styles.cardTitle}>{team.name}</Text>
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
    </ScrollView>
  );
}

function DepositRow({ onDeposit }: { profileId: string; onDeposit: (amount: number) => void }) {
  const [amount, setAmount] = useState('');

  const submit = () => {
    const numeric = Number(amount.replace(',', '.'));
    if (!Number.isFinite(numeric) || numeric <= 0) return;
    onDeposit(numeric);
    setAmount('');
  };

  return (
    <View style={styles.depositRow}>
      <TextInput
        style={styles.depositInput}
        placeholder="Сумма пополнения"
        value={amount}
        onChangeText={setAmount}
        keyboardType="decimal-pad"
      />
      <Pressable style={styles.depositButton} onPress={submit}>
        <Text style={styles.depositButtonText}>Пополнить</Text>
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
  sectionTitle: {
    fontSize: 18,
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
    marginBottom: 8,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
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
    marginBottom: 8,
  },
  depositRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  depositInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
  },
  depositButton: {
    backgroundColor: '#111',
    borderRadius: 8,
    paddingHorizontal: 14,
    justifyContent: 'center',
  },
  depositButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 13,
  },
});
