import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { supabase } from '../lib/supabase';
import type { Game, Polygon, Profile, Project } from '../lib/database.types';

type GameWithPolygon = Game & { polygon: Polygon | null };

export function AdminProjectsTab() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [polygons, setPolygons] = useState<Polygon[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [games, setGames] = useState<GameWithPolygon[]>([]);
  const [projectOrganizerIds, setProjectOrganizerIds] = useState<Set<string>>(new Set());
  const [gameOrganizerIds, setGameOrganizerIds] = useState<Record<string, Set<string>>>({});

  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectDescription, setNewProjectDescription] = useState('');
  const [editingProject, setEditingProject] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');

  const [newGameName, setNewGameName] = useState('');
  const [newGamePolygonId, setNewGamePolygonId] = useState<string | null>(null);
  const [newGameStartsAt, setNewGameStartsAt] = useState('');

  const loadProjects = useCallback(async () => {
    setLoading(true);
    const [projectsRes, profilesRes, polygonsRes] = await Promise.all([
      supabase.from('projects').select('*').order('created_at', { ascending: false }),
      supabase.from('profiles').select('*').order('full_name', { ascending: true }),
      supabase.from('polygons').select('*').order('name', { ascending: true }),
    ]);
    if (projectsRes.error) setError(projectsRes.error.message);
    setProjects(projectsRes.data ?? []);
    setProfiles(profilesRes.data ?? []);
    setPolygons(polygonsRes.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  const openProject = async (project: Project) => {
    setError(null);
    setSelectedProject(project);
    setEditingProject(false);

    const [gamesRes, projectOrgRes] = await Promise.all([
      supabase
        .from('games')
        .select('*, polygon:polygons(*)')
        .eq('project_id', project.id)
        .order('created_at', { ascending: false }),
      supabase.from('project_organizers').select('profile_id').eq('project_id', project.id),
    ]);

    const loadedGames = (gamesRes.data as GameWithPolygon[]) ?? [];
    setGames(loadedGames);
    setProjectOrganizerIds(new Set((projectOrgRes.data ?? []).map((r) => r.profile_id)));

    if (loadedGames.length > 0) {
      const { data: gameOrgRows } = await supabase
        .from('game_organizers')
        .select('game_id, profile_id')
        .in('game_id', loadedGames.map((g) => g.id));
      const byGame: Record<string, Set<string>> = {};
      for (const row of gameOrgRows ?? []) {
        if (!byGame[row.game_id]) byGame[row.game_id] = new Set();
        byGame[row.game_id].add(row.profile_id);
      }
      setGameOrganizerIds(byGame);
    } else {
      setGameOrganizerIds({});
    }
  };

  const createProject = async () => {
    if (!newProjectName.trim()) return;
    setError(null);
    const { data: userData } = await supabase.auth.getUser();
    const { error } = await supabase.from('projects').insert({
      name: newProjectName.trim(),
      description: newProjectDescription.trim() || null,
      created_by: userData.user?.id,
    });
    if (error) {
      setError(error.message);
      return;
    }
    setNewProjectName('');
    setNewProjectDescription('');
    loadProjects();
  };

  const startEditProject = () => {
    if (!selectedProject) return;
    setEditName(selectedProject.name);
    setEditDescription(selectedProject.description ?? '');
    setEditingProject(true);
  };

  const saveEditProject = async () => {
    if (!selectedProject || !editName.trim()) return;
    setError(null);
    const updates = { name: editName.trim(), description: editDescription.trim() || null };
    const { error } = await supabase.from('projects').update(updates).eq('id', selectedProject.id);
    if (error) {
      setError(error.message);
      return;
    }
    const updated = { ...selectedProject, ...updates };
    setSelectedProject(updated);
    setProjects((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
    setEditingProject(false);
  };

  const deleteProject = async (project: Project) => {
    setError(null);
    const { error } = await supabase.from('projects').delete().eq('id', project.id);
    if (error) {
      setError(error.message);
      return;
    }
    setSelectedProject(null);
    loadProjects();
  };

  const toggleProjectOrganizer = async (profileId: string) => {
    if (!selectedProject) return;
    setError(null);
    if (projectOrganizerIds.has(profileId)) {
      const { error } = await supabase
        .from('project_organizers')
        .delete()
        .eq('project_id', selectedProject.id)
        .eq('profile_id', profileId);
      if (error) {
        setError(error.message);
        return;
      }
      setProjectOrganizerIds((prev) => {
        const next = new Set(prev);
        next.delete(profileId);
        return next;
      });
    } else {
      const { error } = await supabase
        .from('project_organizers')
        .insert({ project_id: selectedProject.id, profile_id: profileId });
      if (error) {
        setError(error.message);
        return;
      }
      setProjectOrganizerIds((prev) => new Set(prev).add(profileId));
    }
  };

  const toggleGameOrganizer = async (gameId: string, profileId: string) => {
    setError(null);
    const current = gameOrganizerIds[gameId] ?? new Set<string>();
    if (current.has(profileId)) {
      const { error } = await supabase
        .from('game_organizers')
        .delete()
        .eq('game_id', gameId)
        .eq('profile_id', profileId);
      if (error) {
        setError(error.message);
        return;
      }
      setGameOrganizerIds((prev) => {
        const next = new Set(prev[gameId] ?? []);
        next.delete(profileId);
        return { ...prev, [gameId]: next };
      });
    } else {
      const { error } = await supabase.from('game_organizers').insert({ game_id: gameId, profile_id: profileId });
      if (error) {
        setError(error.message);
        return;
      }
      setGameOrganizerIds((prev) => {
        const next = new Set(prev[gameId] ?? []);
        next.add(profileId);
        return { ...prev, [gameId]: next };
      });
    }
  };

  const createGame = async () => {
    if (!selectedProject || !newGameName.trim() || !newGamePolygonId) return;
    setError(null);
    const startsAtDate = newGameStartsAt.trim() ? new Date(newGameStartsAt.trim()) : null;
    if (startsAtDate && Number.isNaN(startsAtDate.getTime())) {
      setError('Не удалось разобрать дату начала игры');
      return;
    }
    const { data: userData } = await supabase.auth.getUser();
    const { error } = await supabase.from('games').insert({
      project_id: selectedProject.id,
      name: newGameName.trim(),
      polygon_id: newGamePolygonId,
      starts_at: startsAtDate ? startsAtDate.toISOString() : null,
      created_by: userData.user?.id,
    });
    if (error) {
      setError(error.message);
      return;
    }
    setNewGameName('');
    setNewGamePolygonId(null);
    setNewGameStartsAt('');
    openProject(selectedProject);
  };

  const deleteGame = async (game: Game) => {
    if (!selectedProject) return;
    setError(null);
    const { error } = await supabase.from('games').delete().eq('id', game.id);
    if (error) {
      setError(error.message);
      return;
    }
    openProject(selectedProject);
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

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {editingProject ? (
          <>
            <TextInput style={styles.input} placeholder="Название" value={editName} onChangeText={setEditName} />
            <TextInput
              style={styles.input}
              placeholder="Описание"
              value={editDescription}
              onChangeText={setEditDescription}
            />
            <View style={styles.row}>
              <Pressable style={[styles.addButton, styles.flexButton]} onPress={saveEditProject}>
                <Text style={styles.addButtonText}>Сохранить</Text>
              </Pressable>
              <Pressable style={[styles.secondaryButton, styles.flexButton]} onPress={() => setEditingProject(false)}>
                <Text style={styles.secondaryButtonText}>Отмена</Text>
              </Pressable>
            </View>
          </>
        ) : (
          <>
            <Text style={styles.title}>{selectedProject.name}</Text>
            {selectedProject.description ? (
              <Text style={styles.subtitle}>{selectedProject.description}</Text>
            ) : null}
            <View style={styles.row}>
              <Pressable onPress={startEditProject}>
                <Text style={styles.editLink}>Редактировать</Text>
              </Pressable>
              <Pressable onPress={() => deleteProject(selectedProject)}>
                <Text style={styles.deleteLink}>Удалить проект</Text>
              </Pressable>
            </View>
          </>
        )}

        <Text style={styles.sectionTitle}>Организаторы проекта</Text>
        <Text style={styles.label}>Становятся организаторами всех игр этого проекта</Text>
        <View style={styles.chips}>
          {profiles.map((p) => (
            <Pressable
              key={p.id}
              style={[styles.chip, projectOrganizerIds.has(p.id) && styles.chipSelected]}
              onPress={() => toggleProjectOrganizer(p.id)}
            >
              <Text style={projectOrganizerIds.has(p.id) ? styles.chipTextSelected : styles.chipText}>
                {p.full_name || '(без имени)'}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.sectionTitle}>Игры</Text>
        {games.map((game) => (
          <View key={game.id} style={styles.card}>
            <View style={styles.row}>
              <Text style={styles.cardTitle}>{game.name}</Text>
              <Pressable onPress={() => deleteGame(game)}>
                <Text style={styles.deleteLink}>Удалить</Text>
              </Pressable>
            </View>
            <Text style={styles.label}>Полигон: {game.polygon?.name ?? '—'}</Text>
            <Text style={styles.label}>Организаторы игры</Text>
            <View style={styles.chips}>
              {profiles.map((p) => {
                const selected = gameOrganizerIds[game.id]?.has(p.id) ?? false;
                return (
                  <Pressable
                    key={p.id}
                    style={[styles.chip, selected && styles.chipSelected]}
                    onPress={() => toggleGameOrganizer(game.id, p.id)}
                  >
                    <Text style={selected ? styles.chipTextSelected : styles.chipText}>
                      {p.full_name || '(без имени)'}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ))}

        <Text style={styles.sectionTitle}>Новая игра</Text>
        <TextInput style={styles.input} placeholder="Название игры" value={newGameName} onChangeText={setNewGameName} />
        <TextInput
          style={styles.input}
          placeholder="Дата начала (необязательно, напр. 2026-08-01 10:00)"
          value={newGameStartsAt}
          onChangeText={setNewGameStartsAt}
        />
        <Text style={styles.label}>Полигон</Text>
        {polygons.length === 0 ? (
          <Text style={styles.label}>Нет ни одного полигона — сначала создайте его во вкладке «Полигоны».</Text>
        ) : (
          <View style={styles.chips}>
            {polygons.map((p) => (
              <Pressable
                key={p.id}
                style={[styles.chip, newGamePolygonId === p.id && styles.chipSelected]}
                onPress={() => setNewGamePolygonId(p.id)}
              >
                <Text style={newGamePolygonId === p.id ? styles.chipTextSelected : styles.chipText}>{p.name}</Text>
              </Pressable>
            ))}
          </View>
        )}
        <Pressable style={styles.addButton} onPress={createGame}>
          <Text style={styles.addButtonText}>Добавить игру</Text>
        </Pressable>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {error ? <Text style={styles.error}>{error}</Text> : null}

      {projects.map((project) => (
        <Pressable key={project.id} style={styles.card} onPress={() => openProject(project)}>
          <Text style={styles.cardTitle}>{project.name}</Text>
          {project.description ? <Text style={styles.label}>{project.description}</Text> : null}
        </Pressable>
      ))}

      <Text style={styles.sectionTitle}>Новый проект</Text>
      <TextInput
        style={styles.input}
        placeholder="Название проекта"
        value={newProjectName}
        onChangeText={setNewProjectName}
      />
      <TextInput
        style={styles.input}
        placeholder="Описание (необязательно)"
        value={newProjectDescription}
        onChangeText={setNewProjectDescription}
      />
      <Pressable style={styles.addButton} onPress={createProject}>
        <Text style={styles.addButtonText}>Добавить проект</Text>
      </Pressable>
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
    marginBottom: 4,
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
    flex: 1,
  },
  label: {
    fontSize: 13,
    color: '#666',
    marginTop: 4,
    marginBottom: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 8,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 6,
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
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    marginBottom: 10,
  },
  flexButton: {
    flex: 1,
  },
  addButton: {
    backgroundColor: '#111',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 20,
    marginTop: 10,
  },
  addButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 20,
  },
  secondaryButtonText: {
    color: '#111',
    fontWeight: '600',
  },
  editLink: {
    color: '#111',
    fontWeight: '600',
    fontSize: 13,
  },
  deleteLink: {
    color: '#c00',
    fontSize: 13,
  },
  error: {
    color: '#c00',
    marginBottom: 12,
  },
});
