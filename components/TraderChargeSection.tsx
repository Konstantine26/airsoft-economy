import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { supabase } from '../lib/supabase';
import { Avatar } from './Avatar';
import { Card } from './Card';
import { Chip } from './Chip';
import { AmountForm } from './AmountForm';
import { colors, font, spacing } from '../lib/theme';

type Props = {
  gameId: string;
  projectId: string | null;
  sideIds: string[];
};

type ParticipantRow = { profileId: string; fullName: string; avatarUrl: string | null };
type TeamRow = { teamId: string; name: string };

export function TraderChargeSection({ gameId, projectId, sideIds }: Props) {
  const [target, setTarget] = useState<'participant' | 'team'>('participant');
  const [participants, setParticipants] = useState<ParticipantRow[]>([]);
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [teamSidesRes, participantsRes] = await Promise.all([
      supabase.from('game_team_sides').select('team_id, side_id, team:teams(name)').eq('game_id', gameId),
      supabase
        .from('game_participants')
        .select('profile_id, team_id, side_id, status, profile:profiles(full_name, avatar_url)')
        .eq('game_id', gameId)
        .eq('status', 'confirmed'),
    ]);

    const teamSideMap = new Map<string, string>();
    for (const row of teamSidesRes.data ?? []) {
      teamSideMap.set(row.team_id, row.side_id);
    }

    const teamRows: TeamRow[] = ((teamSidesRes.data as any[]) ?? [])
      .filter((row) => sideIds.includes(row.side_id))
      .map((row) => ({ teamId: row.team_id, name: row.team?.name ?? '' }));
    setTeams(teamRows);

    const participantRows: ParticipantRow[] = ((participantsRes.data as any[]) ?? [])
      .filter((row) => sideIds.includes(row.side_id ?? teamSideMap.get(row.team_id) ?? ''))
      .map((row) => ({
        profileId: row.profile_id,
        fullName: row.profile?.full_name || '(без имени)',
        avatarUrl: row.profile?.avatar_url ?? null,
      }));
    setParticipants(participantRows);

    setLoading(false);
  }, [gameId, sideIds]);

  useEffect(() => {
    load();
  }, [load]);

  const chargeParticipant = async (profileId: string, amount: number) => {
    if (!projectId) return;
    setError(null);
    const { error: chargeError } = await supabase.rpc('trader_charge_participant', {
      p_project_id: projectId,
      p_game_id: gameId,
      p_from_profile_id: profileId,
      p_amount: amount,
    });
    if (chargeError) setError(chargeError.message);
  };

  const chargeTeam = async (teamId: string, amount: number) => {
    if (!projectId) return;
    setError(null);
    const { error: chargeError } = await supabase.rpc('trader_charge_team', {
      p_project_id: projectId,
      p_game_id: gameId,
      p_from_team_id: teamId,
      p_amount: amount,
    });
    if (chargeError) setError(chargeError.message);
  };

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Списать</Text>

      {!projectId ? (
        <Text style={styles.label}>Нет проекта с включённой экономикой</Text>
      ) : (
        <>
          <View style={styles.chips}>
            <Chip label="Участник" selected={target === 'participant'} onPress={() => setTarget('participant')} />
            <Chip label="Команда" selected={target === 'team'} onPress={() => setTarget('team')} />
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          {loading ? (
            <View style={styles.center}>
              <ActivityIndicator color={colors.accent} />
            </View>
          ) : target === 'participant' ? (
            participants.length === 0 ? (
              <Text style={styles.label}>На ваших сторонах пока нет подтверждённых участников</Text>
            ) : (
              <View style={styles.list}>
                {participants.map((p) => (
                  <Card key={p.profileId}>
                    <View style={styles.row}>
                      <Avatar uri={p.avatarUrl} name={p.fullName} size={22} />
                      <Text style={styles.rowName}>{p.fullName}</Text>
                    </View>
                    <AmountForm buttonLabel="Списать" onSubmit={(amount) => chargeParticipant(p.profileId, amount)} />
                  </Card>
                ))}
              </View>
            )
          ) : teams.length === 0 ? (
            <Text style={styles.label}>На ваших сторонах пока нет команд</Text>
          ) : (
            <View style={styles.list}>
              {teams.map((t) => (
                <Card key={t.teamId}>
                  <Text style={styles.teamName}>{t.name}</Text>
                  <AmountForm buttonLabel="Списать" onSubmit={(amount) => chargeTeam(t.teamId, amount)} />
                </Card>
              ))}
            </View>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginTop: spacing.lg,
  },
  sectionTitle: {
    fontFamily: font.heading,
    fontSize: 16,
    color: colors.text,
    marginBottom: spacing.sm + 2,
  },
  center: {
    paddingVertical: spacing.lg,
    alignItems: 'center',
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: spacing.sm,
  },
  list: {
    gap: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: spacing.sm,
  },
  rowName: {
    fontFamily: font.bodySemiBold,
    fontSize: 13.5,
    color: colors.text,
  },
  teamName: {
    fontFamily: font.bodySemiBold,
    fontSize: 13.5,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  label: {
    fontFamily: font.body,
    fontSize: 12,
    color: colors.textMuted,
  },
  error: {
    fontFamily: font.body,
    color: colors.danger,
    marginBottom: spacing.sm,
  },
});
