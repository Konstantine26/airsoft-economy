import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { supabase } from '../lib/supabase';
import type { Team } from '../lib/database.types';
import { TransferModal } from './TransferModal';

export function TeamsScreen() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transferOpen, setTransferOpen] = useState(false);

  const loadTeams = useCallback(async () => {
    const { data, error } = await supabase
      .from('teams')
      .select('*')
      .order('name', { ascending: true });

    if (error) {
      setError(error.message);
    } else {
      setError(null);
      setTeams(data ?? []);
    }
  }, []);

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
    await loadTeams();
  }, [loadTeams]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Команды</Text>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <FlatList
        data={teams}
        keyExtractor={(team) => team.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={teams.length === 0 && styles.emptyList}
        ListEmptyComponent={<Text style={styles.empty}>Команд пока нет</Text>}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Text style={styles.teamName}>{item.name}</Text>
            <Text style={styles.balance}>{item.balance.toFixed(2)} ₽</Text>
          </View>
        )}
      />

      <Pressable
        style={styles.transferButton}
        onPress={() => setTransferOpen(true)}
        disabled={teams.length < 2}
      >
        <Text style={styles.transferButtonText}>Перевести</Text>
      </Pressable>

      <TransferModal
        visible={transferOpen}
        teams={teams}
        onClose={() => setTransferOpen(false)}
        onSuccess={onTransferDone}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 60,
    paddingHorizontal: 20,
    backgroundColor: '#fff',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 16,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#ddd',
  },
  teamName: {
    fontSize: 17,
  },
  balance: {
    fontSize: 17,
    fontWeight: '600',
  },
  empty: {
    textAlign: 'center',
    color: '#888',
    marginTop: 40,
  },
  emptyList: {
    flexGrow: 1,
  },
  error: {
    color: '#c00',
    marginBottom: 12,
  },
  transferButton: {
    backgroundColor: '#111',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginVertical: 16,
  },
  transferButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
