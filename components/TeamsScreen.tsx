import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { supabase } from '../lib/supabase';
import type { Team } from '../lib/database.types';
import { TransferModal } from './TransferModal';
import { Avatar } from './Avatar';
import { Button } from './Button';
import { colors, font, radii, spacing } from '../lib/theme';
import { formatMoney } from '../lib/format';

type TeamWithBalance = Team & { balance: number };

type Props = {
  projectId: string | null;
};

export function TeamsScreen({ projectId }: Props) {
  const [teams, setTeams] = useState<TeamWithBalance[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [transferOpen, setTransferOpen] = useState(false);

  const loadTeams = useCallback(async () => {
    if (!projectId) {
      setTeams([]);
      return;
    }
    const [teamsRes, balancesRes] = await Promise.all([
      supabase.from('teams').select('*').order('name', { ascending: true }),
      supabase.from('project_team_balances').select('*').eq('project_id', projectId),
    ]);

    if (teamsRes.error) {
      setError(teamsRes.error.message);
      return;
    }
    setError(null);
    const balanceMap = new Map((balancesRes.data ?? []).map((row) => [row.team_id, row.balance]));
    setTeams((teamsRes.data ?? []).map((t) => ({ ...t, balance: balanceMap.get(t.id) ?? 0 })));
  }, [projectId]);

  useEffect(() => {
    loadTeams().finally(() => setLoading(false));
  }, [loadTeams]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadTeams();
    setRefreshing(false);
  }, [loadTeams]);

  const onTransferDone = useCallback(async () => {
    setTransferOpen(false);
    setSelectedIds([]);
    await loadTeams();
  }, [loadTeams]);

  const toggleTeamSelect = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id].slice(-2)));
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (!projectId) {
    return (
      <View style={styles.center}>
        <Text style={styles.empty}>Нет проекта с включённой экономикой</Text>
      </View>
    );
  }

  const fromTeam = teams.find((t) => t.id === selectedIds[0]) ?? null;
  const toTeam = teams.find((t) => t.id === selectedIds[1]) ?? null;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Команды</Text>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <FlatList
        data={teams}
        keyExtractor={(team) => team.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
        contentContainerStyle={teams.length === 0 ? styles.emptyList : styles.list}
        ListEmptyComponent={<Text style={styles.empty}>Команд пока нет</Text>}
        renderItem={({ item }) => {
          const selected = selectedIds.includes(item.id);
          return (
            <Pressable
              style={[styles.row, selected ? styles.rowSelected : styles.rowUnselected]}
              onPress={() => toggleTeamSelect(item.id)}
            >
              <View style={styles.teamIdentity}>
                <Avatar uri={item.avatar_url} name={item.name} size={26} />
                <Text style={styles.teamName}>{item.name}</Text>
              </View>
              <Text style={styles.balance}>{formatMoney(item.balance)}</Text>
            </Pressable>
          );
        }}
      />

      <Button
        title="Перевести между командами"
        onPress={() => setTransferOpen(true)}
        disabled={!fromTeam || !toTeam}
        style={styles.transferButton}
      />
      <Text style={styles.hint}>Выберите две команды, чтобы выполнить перевод</Text>

      {fromTeam && toTeam ? (
        <TransferModal
          visible={transferOpen}
          projectId={projectId}
          fromTeam={fromTeam}
          toTeam={toTeam}
          onClose={() => setTransferOpen(false)}
          onSuccess={onTransferDone}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 16,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.bg,
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
    marginBottom: spacing.md + 2,
  },
  list: {
    gap: spacing.sm,
    paddingBottom: spacing.md,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: radii.lg,
    borderWidth: 1,
    marginBottom: spacing.sm,
  },
  rowUnselected: {
    backgroundColor: colors.card,
    borderColor: colors.cardBorder,
  },
  rowSelected: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.accentSoftBorder,
  },
  teamIdentity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  teamName: {
    fontFamily: font.bodySemiBold,
    fontSize: 14,
    color: colors.text,
  },
  balance: {
    fontFamily: font.heading,
    fontSize: 15,
    color: colors.text,
  },
  empty: {
    fontFamily: font.body,
    textAlign: 'center',
    color: colors.textMuted,
    marginTop: 40,
  },
  emptyList: {
    flexGrow: 1,
  },
  error: {
    fontFamily: font.body,
    color: colors.danger,
    marginBottom: spacing.md,
  },
  transferButton: {
    marginTop: spacing.sm,
  },
  hint: {
    fontFamily: font.body,
    fontSize: 11.5,
    color: colors.textDim,
    textAlign: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
  },
});
