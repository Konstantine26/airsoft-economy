import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import type { Game, Polygon, Project } from '../lib/database.types';
import { Card } from './Card';
import { GameManageScreen } from './GameManageScreen';
import { colors, font, spacing } from '../lib/theme';

type GameWithRelations = Game & { project: Project | null; polygon: Polygon | null };

export function OrganizerScreen() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [allGames, setAllGames] = useState<GameWithRelations[]>([]);

  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);

  const loadAccessible = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    setError(null);

    let gameIds: string[] | null = null;
    if (!isAdmin) {
      const [projectOrgRes, gameOrgRes] = await Promise.all([
        supabase.from('project_organizers').select('project_id').eq('profile_id', profile.id),
        supabase.from('game_organizers').select('game_id').eq('profile_id', profile.id),
      ]);
      const projectIds = (projectOrgRes.data ?? []).map((r) => r.project_id);
      const directGameIds = (gameOrgRes.data ?? []).map((r) => r.game_id);

      let gamesFromProjects: string[] = [];
      if (projectIds.length > 0) {
        const { data } = await supabase.from('games').select('id').in('project_id', projectIds);
        gamesFromProjects = (data ?? []).map((g) => g.id);
      }
      gameIds = Array.from(new Set([...gamesFromProjects, ...directGameIds]));
    }

    if (gameIds !== null && gameIds.length === 0) {
      setAllGames([]);
      setLoading(false);
      return;
    }

    let query = supabase
      .from('games')
      .select('*, project:projects(*), polygon:polygons(*)')
      .order('created_at', { ascending: false });
    if (gameIds !== null) query = query.in('id', gameIds);

    const { data, error: gamesError } = await query;
    if (gamesError) setError(gamesError.message);
    setAllGames((data as GameWithRelations[]) ?? []);
    setLoading(false);
  }, [profile, isAdmin]);

  useEffect(() => {
    loadAccessible();
  }, [loadAccessible]);

  const projects = (() => {
    const map = new Map<string, Project>();
    for (const g of allGames) {
      if (g.project) map.set(g.project.id, g.project);
    }
    return Array.from(map.values());
  })();

  const gamesForSelectedProject = selectedProject
    ? allGames.filter((g) => g.project_id === selectedProject.id)
    : [];

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (selectedGameId) {
    return (
      <GameManageScreen
        gameId={selectedGameId}
        onBack={() => setSelectedGameId(null)}
        onDeleted={() => {
          setSelectedGameId(null);
          loadAccessible();
        }}
      />
    );
  }

  if (selectedProject) {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <Pressable onPress={() => setSelectedProject(null)}>
          <Text style={styles.back}>‹ Проекты</Text>
        </Pressable>
        <Text style={styles.title}>{selectedProject.name}</Text>
        {selectedProject.description ? <Text style={styles.subtitle}>{selectedProject.description}</Text> : null}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Text style={styles.sectionTitle}>Игры</Text>
        {gamesForSelectedProject.length === 0 ? (
          <Text style={styles.label}>Нет назначенных вам игр в этом проекте</Text>
        ) : (
          <View style={styles.cardsList}>
            {gamesForSelectedProject.map((game) => (
              <Pressable key={game.id} onPress={() => setSelectedGameId(game.id)}>
                <Card>
                  <Text style={styles.cardTitle}>{game.name}</Text>
                  <Text style={styles.label}>Полигон: {game.polygon?.name ?? '—'}</Text>
                </Card>
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Организатор</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}

      {projects.length === 0 ? (
        <Text style={styles.label}>Вы пока не назначены организатором ни на один проект или игру</Text>
      ) : (
        <View style={styles.cardsList}>
          {projects.map((project) => (
            <Pressable key={project.id} onPress={() => setSelectedProject(project)}>
              <Card>
                <Text style={styles.cardTitle}>{project.name}</Text>
                {project.description ? <Text style={styles.label}>{project.description}</Text> : null}
              </Card>
            </Pressable>
          ))}
        </View>
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
  back: {
    fontFamily: font.body,
    color: colors.textMuted,
    marginBottom: spacing.sm,
  },
  title: {
    fontFamily: font.heading,
    fontSize: 19,
    color: colors.text,
  },
  subtitle: {
    fontFamily: font.body,
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 4,
    marginBottom: spacing.sm,
  },
  sectionTitle: {
    fontFamily: font.heading,
    fontSize: 16,
    color: colors.text,
    marginTop: spacing.lg,
    marginBottom: spacing.sm + 2,
  },
  cardsList: {
    gap: 10,
  },
  cardTitle: {
    fontFamily: font.bodyBold,
    fontSize: 14,
    color: colors.text,
    flex: 1,
  },
  label: {
    fontFamily: font.body,
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 4,
  },
  error: {
    fontFamily: font.body,
    color: colors.danger,
    marginBottom: spacing.md,
  },
});
