import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import type { Game, Polygon, Project, Team, TeamMember } from '../lib/database.types';
import { Avatar } from './Avatar';
import { Card } from './Card';
import { Button } from './Button';
import { GameCardScreen } from './GameCardScreen';
import { colors, font, radii, spacing } from '../lib/theme';
import { formatMoney } from '../lib/format';

type Props = {
  ownMembership: (TeamMember & { team: Team }) | null;
  activeProjectId: string | null;
  activeGameId: string | null;
  onActivateGame: (game: { id: string; project_id: string }) => void;
};

type RosterEntry = { profile_id: string; full_name: string; avatar_url: string | null };
type ProjectGame = Game & { polygon: Polygon | null };
type ConfirmedGame = Game & { project: Project | null };

export function ParticipantScreen({ ownMembership, activeProjectId, activeGameId, onActivateGame }: Props) {
  const { profile } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [expandedProjectId, setExpandedProjectId] = useState<string | null>(null);
  const [gamesByProject, setGamesByProject] = useState<Record<string, ProjectGame[]>>({});
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [teamBalance, setTeamBalance] = useState<number | null>(null);
  const [confirmedGames, setConfirmedGames] = useState<ConfirmedGame[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [openGameId, setOpenGameId] = useState<string | null>(null);

  const loadProjects = useCallback(async () => {
    const { data } = await supabase.from('projects').select('*').order('created_at', { ascending: false });
    setProjects(data ?? []);
    setLoading(false);
  }, []);

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

  const loadConfirmedGames = useCallback(async () => {
    if (!profile) {
      setConfirmedGames([]);
      return;
    }
    const { data } = await supabase
      .from('game_participants')
      .select('game:games(*, project:projects(*))')
      .eq('profile_id', profile.id)
      .eq('status', 'confirmed');
    const now = Date.now();
    const games = ((data ?? []) as any[])
      .map((row) => row.game as ConfirmedGame | null)
      .filter((g): g is ConfirmedGame => !!g && (!g.ends_at || new Date(g.ends_at).getTime() > now));
    setConfirmedGames(games);
  }, [profile]);

  useEffect(() => {
    loadProjects();
    loadRoster();
    loadTeamBalance();
    loadConfirmedGames();
  }, [loadProjects, loadRoster, loadTeamBalance, loadConfirmedGames]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([loadProjects(), loadRoster(), loadTeamBalance(), loadConfirmedGames()]);
    setRefreshing(false);
  }, [loadProjects, loadRoster, loadTeamBalance, loadConfirmedGames]);

  const toggleProject = async (project: Project) => {
    if (expandedProjectId === project.id) {
      setExpandedProjectId(null);
      return;
    }
    setExpandedProjectId(project.id);
    if (gamesByProject[project.id]) return;
    const { data } = await supabase
      .from('games')
      .select('*, polygon:polygons(*)')
      .eq('project_id', project.id)
      .order('created_at', { ascending: false });
    setGamesByProject((prev) => ({ ...prev, [project.id]: (data as ProjectGame[]) ?? [] }));
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (openGameId) {
    return (
      <GameCardScreen gameId={openGameId} ownMembership={ownMembership} onClose={() => setOpenGameId(null)} />
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} colors={[colors.accent]} />}
    >
      {confirmedGames.length > 0 ? (
        <>
          <Text style={styles.title}>Мои игры</Text>
          <View style={styles.myGamesList}>
            {confirmedGames.map((game) => {
              const isActive = activeGameId === game.id;
              return (
                <Card key={game.id} style={styles.myGameCard}>
                  <View style={styles.myGameInfo}>
                    <Text style={styles.cardTitle}>{game.name}</Text>
                    <Text style={styles.label}>{game.project?.name ?? '—'}</Text>
                    {game.starts_at ? (
                      <Text style={styles.label}>{new Date(game.starts_at).toLocaleString()}</Text>
                    ) : null}
                  </View>
                  <Button
                    title={isActive ? 'Активна' : 'Старт'}
                    variant="success"
                    disabled={isActive}
                    onPress={() => onActivateGame({ id: game.id, project_id: game.project_id })}
                    style={styles.startButton}
                  />
                </Card>
              );
            })}
          </View>
        </>
      ) : null}

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

      <Text style={styles.sectionTitle}>Проекты</Text>
      <View style={styles.projectsList}>
        {projects.map((project) => {
          const isOpen = expandedProjectId === project.id;
          const games = gamesByProject[project.id] ?? [];
          return (
            <Pressable key={project.id} onPress={() => toggleProject(project)}>
              <Card>
                <Text style={styles.cardTitle}>{project.name}</Text>
                {project.description ? <Text style={styles.label}>{project.description}</Text> : null}
                {isOpen ? (
                  <View style={styles.gamesSection}>
                    <Text style={styles.gamesHeading}>Игры</Text>
                    {games.length === 0 ? (
                      <Text style={styles.label}>Игр пока нет</Text>
                    ) : (
                      games.map((game) => (
                        <Pressable key={game.id} style={styles.gameRow} onPress={() => setOpenGameId(game.id)}>
                          <View style={styles.gameIcon}>
                            <Text style={styles.gameIconText}>🎯</Text>
                          </View>
                          <View style={styles.gameInfo}>
                            <Text style={styles.gameName}>{game.name}</Text>
                            <Text style={styles.gameMeta}>Полигон: {game.polygon?.name ?? '—'}</Text>
                          </View>
                        </Pressable>
                      ))
                    )}
                  </View>
                ) : null}
              </Card>
            </Pressable>
          );
        })}
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
  title: {
    fontFamily: font.heading,
    fontSize: 19,
    color: colors.text,
    marginBottom: spacing.sm + 2,
  },
  myGamesList: {
    gap: 10,
    marginBottom: spacing.xl,
  },
  myGameCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  myGameInfo: {
    flex: 1,
  },
  startButton: {
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  teamCard: {
    borderWidth: 1,
    borderColor: colors.teamGradientBorder,
    borderRadius: radii.xl,
    padding: spacing.lg,
    marginBottom: spacing.xl,
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
  sectionTitle: {
    fontFamily: font.heading,
    fontSize: 16,
    color: colors.text,
    marginBottom: spacing.sm + 2,
  },
  projectsList: {
    gap: 10,
  },
  cardTitle: {
    fontFamily: font.bodyBold,
    fontSize: 14,
    color: colors.text,
  },
  label: {
    fontFamily: font.body,
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 3,
  },
  gamesSection: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
    gap: 8,
  },
  gamesHeading: {
    fontFamily: font.bodySemiBold,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: colors.textDim,
  },
  gameRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: colors.bg,
    borderRadius: 10,
    padding: 9,
  },
  gameIcon: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gameIconText: {
    fontSize: 13,
  },
  gameInfo: {
    flex: 1,
  },
  gameName: {
    fontFamily: font.bodySemiBold,
    fontSize: 12.5,
    color: colors.text,
  },
  gameMeta: {
    fontFamily: font.body,
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 2,
  },
});
