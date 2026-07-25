import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { supabase } from '../lib/supabase';
import type { Profile, Role } from '../lib/database.types';
import { AmountForm } from './AmountForm';

const ROLES: Role[] = ['member', 'admin'];
const ROLE_LABEL: Record<Role, string> = {
  member: 'Участник',
  admin: 'Админ',
};

type Props = {
  activeProjectId: string | null;
};

export function AdminUsersTab({ activeProjectId }: Props) {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [balances, setBalances] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [profilesRes, balancesRes] = await Promise.all([
      supabase.from('profiles').select('*').order('full_name', { ascending: true }),
      activeProjectId
        ? supabase.from('project_profile_balances').select('*').eq('project_id', activeProjectId)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (profilesRes.error) setError(profilesRes.error.message);
    setProfiles(profilesRes.data ?? []);
    setBalances(new Map((balancesRes.data ?? []).map((row) => [row.profile_id, row.balance])));
    setLoading(false);
  }, [activeProjectId]);

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
    if (!activeProjectId) return;
    setError(null);
    const { error } = await supabase.rpc('deposit_to_participant', {
      p_project_id: activeProjectId,
      p_to_profile_id: profileId,
      p_amount: amount,
    });
    if (error) {
      setError(error.message);
      return;
    }
    setBalances((prev) => new Map(prev).set(profileId, (prev.get(profileId) ?? 0) + amount));
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

      {profiles.map((p) => (
        <View key={p.id} style={styles.card}>
          <Text style={styles.cardTitle}>
            {p.full_name || '(без имени)'} · №{p.participant_number}
          </Text>
          {activeProjectId ? (
            <Text style={styles.label}>Баланс в проекте: {(balances.get(p.id) ?? 0).toFixed(2)} ₽</Text>
          ) : null}
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
          {activeProjectId ? (
            <AmountForm placeholder="Сумма пополнения" buttonLabel="Пополнить" onSubmit={(amount) => deposit(p.id, amount)} />
          ) : null}
        </View>
      ))}
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
});
