import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { supabase } from '../lib/supabase';
import type { Team, TeamMember } from '../lib/database.types';
import { Avatar } from './Avatar';
import { colors, font, radii, spacing } from '../lib/theme';
import { formatMoney } from '../lib/format';

type Props = {
  ownMembership: (TeamMember & { team: Team }) | null;
  activeProjectId: string | null;
};

type RosterEntry = { profile_id: string; full_name: string; avatar_url: string | null };

export function PlayerTeamScreen({ ownMembership, activeProjectId }: Props) {
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [teamBalance, setTeamBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

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

  useEffect(() => {
    Promise.all([loadRoster(), loadTeamBalance()]).finally(() => setLoading(false));
  }, [loadRoster, loadTeamBalance]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([loadRoster(), loadTeamBalance()]);
    setRefreshing(false);
  }, [loadRoster, loadTeamBalance]);

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
        <Text style={styles.label}>Вы пока не состоите ни в одной команде</Text>
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
});
