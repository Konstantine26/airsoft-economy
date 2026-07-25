import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { supabase } from '../lib/supabase';
import type { Game, Polygon, Project, Team, TeamMember } from '../lib/database.types';
import { PolygonMapThumbnails } from './PolygonMapThumbnails';

type Props = {
  ownMembership: (TeamMember & { team: Team }) | null;
  activeProjectId: string | null;
};

export function ParticipantScreen({ ownMembership, activeProjectId }: Props) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [games, setGames] = useState<(Game & { polygon: Polygon | null })[]>([]);
  const [roster, setRoster] = useState<string[]>([]);
  const [teamBalance, setTeamBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProjects = useCallback(async () => {
    const { data } = await supabase.from('projects').select('*').order('created_at', { ascending: false });
    setProjects(data ?? []);
    setLoading(false);
  }, []);

  const loadRoster = useCallback(async () => {
    if (!ownMembership) return;
    const { data } = await supabase
      .from('team_members')
      .select('profile:profiles(full_name)')
      .eq('team_id', ownMembership.team_id);
    setRoster((data ?? []).map((row: any) => row.profile?.full_name || '(без имени)'));
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
    loadProjects();
    loadRoster();
    loadTeamBalance();
  }, [loadProjects, loadRoster, loadTeamBalance]);

  const openProject = async (project: Project) => {
    setSelectedProject(project);
    const { data } = await supabase
      .from('games')
      .select('*, polygon:polygons(*)')
      .eq('project_id', project.id)
      .order('created_at', { ascending: false });
    setGames((data as (Game & { polygon: Polygon | null })[]) ?? []);
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  if (selectedProject) {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <Pressable onPress={() => setSelectedProject(null)}>
          <Text style={styles.back}>‹ Проекты</Text>
        </Pressable>
        <Text style={styles.title}>{selectedProject.name}</Text>
        {selectedProject.description ? (
          <Text style={styles.subtitle}>{selectedProject.description}</Text>
        ) : null}

        <Text style={styles.sectionTitle}>Игры</Text>
        {games.length === 0 ? (
          <Text style={styles.label}>Игр пока нет</Text>
        ) : (
          games.map((game) => (
            <View key={game.id} style={styles.card}>
              <Text style={styles.cardTitle}>{game.name}</Text>
              <Text style={styles.label}>Полигон: {game.polygon?.name ?? '—'}</Text>
              {game.polygon_id ? <PolygonMapThumbnails polygonId={game.polygon_id} /> : null}
            </View>
          ))
        )}
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Моя команда</Text>
      {ownMembership ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{ownMembership.team.name}</Text>
          <Text style={styles.label}>
            {teamBalance !== null ? `Баланс: ${teamBalance.toFixed(2)} ₽` : 'Нет проекта с включённой экономикой'}
          </Text>
          {roster.map((name, idx) => (
            <Text key={idx} style={styles.participant}>
              {name}
            </Text>
          ))}
        </View>
      ) : (
        <Text style={styles.label}>Вы пока не состоите ни в одной команде</Text>
      )}

      <Text style={styles.sectionTitle}>Проекты</Text>
      {projects.map((project) => (
        <Pressable key={project.id} style={styles.card} onPress={() => openProject(project)}>
          <Text style={styles.cardTitle}>{project.name}</Text>
          {project.description ? <Text style={styles.label}>{project.description}</Text> : null}
        </Pressable>
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
  back: {
    color: '#666',
    marginBottom: 8,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 17,
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
  },
  label: {
    fontSize: 13,
    color: '#666',
    marginTop: 4,
  },
  participant: {
    fontSize: 14,
    color: '#333',
    paddingVertical: 2,
  },
});
