import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { supabase } from '../lib/supabase';
import type { Profile, Team } from '../lib/database.types';
import { Sheet } from './Sheet';
import { Card } from './Card';
import { Chip } from './Chip';
import { Button } from './Button';
import { TextField } from './TextField';
import { colors, font, spacing } from '../lib/theme';

type Props = {
  visible: boolean;
  projectId: string;
  onClose: () => void;
};

export function ClosedProjectAccessSheet({ visible, projectId, onClose }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [allowedTeamIds, setAllowedTeamIds] = useState<Set<string>>(new Set());
  const [allowedPlayerIds, setAllowedPlayerIds] = useState<Set<string>>(new Set());
  const [playerQuery, setPlayerQuery] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [teamsRes, profilesRes, allowedTeamsRes, allowedPlayersRes] = await Promise.all([
      supabase.from('teams').select('*').order('name', { ascending: true }),
      supabase.from('profiles').select('*').order('full_name', { ascending: true }),
      supabase.from('project_allowed_teams').select('team_id').eq('project_id', projectId),
      supabase.from('project_allowed_players').select('profile_id').eq('project_id', projectId),
    ]);
    setTeams(teamsRes.data ?? []);
    setProfiles(profilesRes.data ?? []);
    setAllowedTeamIds(new Set((allowedTeamsRes.data ?? []).map((r) => r.team_id)));
    setAllowedPlayerIds(new Set((allowedPlayersRes.data ?? []).map((r) => r.profile_id)));
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    if (visible) load();
  }, [visible, load]);

  useEffect(() => {
    if (!visible) setPlayerQuery('');
  }, [visible]);

  const toggleTeam = async (teamId: string) => {
    setError(null);
    if (allowedTeamIds.has(teamId)) {
      const { error: delError } = await supabase
        .from('project_allowed_teams')
        .delete()
        .eq('project_id', projectId)
        .eq('team_id', teamId);
      if (delError) {
        setError(delError.message);
        return;
      }
      setAllowedTeamIds((prev) => {
        const next = new Set(prev);
        next.delete(teamId);
        return next;
      });
    } else {
      const { error: insError } = await supabase
        .from('project_allowed_teams')
        .insert({ project_id: projectId, team_id: teamId });
      if (insError) {
        setError(insError.message);
        return;
      }
      setAllowedTeamIds((prev) => new Set(prev).add(teamId));
    }
  };

  const togglePlayer = async (profileId: string) => {
    setError(null);
    if (allowedPlayerIds.has(profileId)) {
      const { error: delError } = await supabase
        .from('project_allowed_players')
        .delete()
        .eq('project_id', projectId)
        .eq('profile_id', profileId);
      if (delError) {
        setError(delError.message);
        return;
      }
      setAllowedPlayerIds((prev) => {
        const next = new Set(prev);
        next.delete(profileId);
        return next;
      });
    } else {
      const { error: insError } = await supabase
        .from('project_allowed_players')
        .insert({ project_id: projectId, profile_id: profileId });
      if (insError) {
        setError(insError.message);
        return;
      }
      setAllowedPlayerIds((prev) => new Set(prev).add(profileId));
    }
  };

  const allowedPlayers = useMemo(
    () => profiles.filter((p) => allowedPlayerIds.has(p.id)),
    [profiles, allowedPlayerIds]
  );

  const playerQueryTrimmed = playerQuery.trim();
  const playerSearchResults = useMemo(() => {
    if (!playerQueryTrimmed) return [];
    return profiles
      .filter((p) => !allowedPlayerIds.has(p.id))
      .filter((p) =>
        /^\d+$/.test(playerQueryTrimmed)
          ? String(p.participant_number).includes(playerQueryTrimmed)
          : p.full_name.toLowerCase().includes(playerQueryTrimmed.toLowerCase())
      );
  }, [profiles, allowedPlayerIds, playerQueryTrimmed]);

  return (
    <Sheet visible={visible} onRequestClose={onClose} style={styles.sheet}>
      <Text style={styles.title}>Доступ к закрытому проекту</Text>
      <Text style={styles.hint}>
        Проект скрыт от всех, кроме организаторов, админа и тех команд/игроков, кого добавили здесь.
      </Text>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {loading ? (
        <ActivityIndicator color={colors.accent} style={styles.loader} />
      ) : (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
          <Text style={styles.sectionTitle}>Команды</Text>
          {teams.length === 0 ? (
            <Text style={styles.label}>Команд пока нет</Text>
          ) : (
            <View style={styles.chips}>
              {teams.map((team) => (
                <Chip
                  key={team.id}
                  label={team.name}
                  selected={allowedTeamIds.has(team.id)}
                  onPress={() => toggleTeam(team.id)}
                />
              ))}
            </View>
          )}

          <Text style={styles.sectionTitle}>Игроки</Text>
          {allowedPlayers.length === 0 ? (
            <Text style={styles.label}>Отдельных игроков не добавлено</Text>
          ) : (
            <View style={styles.list}>
              {allowedPlayers.map((p) => (
                <Card key={p.id}>
                  <View style={styles.playerRow}>
                    <Text style={styles.playerName}>
                      {p.full_name || '(без имени)'} · №{p.participant_number}
                    </Text>
                    <Pressable onPress={() => togglePlayer(p.id)}>
                      <Text style={styles.removeLink}>Убрать</Text>
                    </Pressable>
                  </View>
                </Card>
              ))}
            </View>
          )}

          <TextField
            style={styles.input}
            label="Добавить игрока"
            placeholder="Номер участника или позывной"
            value={playerQuery}
            onChangeText={setPlayerQuery}
          />
          {playerQueryTrimmed ? (
            playerSearchResults.length === 0 ? (
              <Text style={styles.label}>Никого не нашлось</Text>
            ) : (
              <View style={styles.list}>
                {playerSearchResults.map((p) => (
                  <Card key={p.id}>
                    <View style={styles.playerRow}>
                      <Text style={styles.playerName}>
                        {p.full_name || '(без имени)'} · №{p.participant_number}
                      </Text>
                      <Pressable onPress={() => togglePlayer(p.id)}>
                        <Text style={styles.addLink}>Добавить</Text>
                      </Pressable>
                    </View>
                  </Card>
                ))}
              </View>
            )
          ) : null}
        </ScrollView>
      )}

      <Button title="Готово" onPress={onClose} style={styles.doneButton} />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  sheet: {
    maxHeight: '85%',
  },
  title: {
    fontFamily: font.heading,
    fontSize: 18,
    color: colors.text,
    marginBottom: 4,
  },
  hint: {
    fontFamily: font.body,
    fontSize: 12.5,
    color: colors.textDim,
    marginBottom: spacing.md,
  },
  scroll: {
    flexGrow: 0,
  },
  scrollContent: {
    paddingBottom: spacing.sm,
  },
  loader: {
    marginVertical: spacing.lg,
  },
  sectionTitle: {
    fontFamily: font.heading,
    fontSize: 15,
    color: colors.text,
    marginTop: spacing.md,
    marginBottom: 6,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  list: {
    gap: spacing.sm,
  },
  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  playerName: {
    fontFamily: font.bodySemiBold,
    fontSize: 13,
    color: colors.text,
    flex: 1,
  },
  addLink: {
    fontFamily: font.bodySemiBold,
    color: colors.accent,
    fontSize: 13,
  },
  removeLink: {
    fontFamily: font.body,
    color: colors.danger,
    fontSize: 13,
  },
  label: {
    fontFamily: font.body,
    fontSize: 12,
    color: colors.textMuted,
  },
  input: {
    marginTop: spacing.md,
  },
  error: {
    fontFamily: font.body,
    color: colors.danger,
    marginBottom: spacing.sm,
  },
  doneButton: {
    marginTop: spacing.md,
  },
});
