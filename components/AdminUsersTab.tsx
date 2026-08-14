import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { supabase } from '../lib/supabase';
import type { Profile, Role } from '../lib/database.types';
import { Avatar } from './Avatar';
import { Card } from './Card';
import { Chip } from './Chip';
import { colors, font, spacing } from '../lib/theme';
import { formatMoney } from '../lib/format';

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
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [profilesRes, balancesRes] = await Promise.all([
      supabase.from('profiles').select('*').order('full_name', { ascending: true }),
      activeProjectId
        ? supabase.from('project_profile_balances').select('*').eq('project_id', activeProjectId)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (profilesRes.error) setError(profilesRes.error.message);
    setProfiles(profilesRes.data ?? []);
    setBalances(new Map((balancesRes.data ?? []).map((row) => [row.profile_id, row.balance])));
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

  const setRole = async (profileId: string, role: Role) => {
    setError(null);
    const { error } = await supabase.from('profiles').update({ role }).eq('id', profileId);
    if (error) {
      setError(error.message);
      return;
    }
    setProfiles((prev) => prev.map((p) => (p.id === profileId ? { ...p, role } : p)));
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

      <View style={styles.list}>
        {profiles.map((p) => (
          <Card key={p.id}>
            <View style={styles.identityRow}>
              <Avatar uri={p.avatar_url} name={p.full_name} size={36} />
              <Text style={styles.cardTitle}>
                {p.full_name || '(без имени)'} · №{p.participant_number}
              </Text>
            </View>
            {activeProjectId ? (
              <Text style={styles.label}>Баланс в проекте: {formatMoney(balances.get(p.id) ?? 0)}</Text>
            ) : null}
            <View style={styles.chips}>
              {ROLES.map((role) => (
                <Chip key={role} label={ROLE_LABEL[role]} selected={p.role === role} onPress={() => setRole(p.id, role)} />
              ))}
            </View>
          </Card>
        ))}
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
  cardTitle: {
    fontFamily: font.bodySemiBold,
    fontSize: 14,
    color: colors.text,
    flex: 1,
  },
  identityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: spacing.sm,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
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
    marginBottom: spacing.sm,
  },
});
