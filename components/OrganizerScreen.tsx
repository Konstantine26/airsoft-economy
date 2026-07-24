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
import type { Game, GameSide, Profile, Project } from '../lib/database.types';

export function OrganizerScreen() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [games, setGames] = useState<Game[]>([]);
  const [selectedGame, setSelectedGame] = useState<Game | null>(null);
  const [sides, setSides] = useState<GameSide[]>([]);

  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectDescription, setNewProjectDescription] = useState('');
  const [newGameName, setNewGameName] = useState('');
  const [newGamePolygon, setNewGamePolygon] = useState('');
  const [newSideName, setNewSideName] = useState('');

  const loadProjects = useCallback(async () => {
    const [projectsRes, profilesRes] = await Promise.all([
      supabase.from('projects').select('*').order('created_at', { ascending: false }),
      supabase.from('profiles').select('*').order('full_name', { ascending: true }),
    ]);
    setProjects(projectsRes.data ?? []);
    setProfiles(profilesRes.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  const loadGames = useCallback(async (project: Project) => {
    const { data } = await supabase
      .from('games')
      .select('*')
      .eq('project_id', project.id)
      .order('created_at', { ascending: false });
    setGames(data ?? []);
  }, []);

  const loadSides = useCallback(async (game: Game) => {
    const { data } = await supabase
      .from('game_sides')
      .select('*')
      .eq('game_id', game.id)
      .order('name', { ascending: true });
    setSides(data ?? []);
  }, []);

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

  const createGame = async () => {
    if (!selectedProject || !newGameName.trim() || !newGamePolygon.trim()) return;
    setError(null);
    const { data: userData } = await supabase.auth.getUser();
    const { error } = await supabase.from('games').insert({
      project_id: selectedProject.id,
      name: newGameName.trim(),
      polygon: newGamePolygon.trim(),
      created_by: userData.user?.id,
    });
    if (error) {
      setError(error.message);
      return;
    }
    setNewGameName('');
    setNewGamePolygon('');
    loadGames(selectedProject);
  };

  const createSide = async () => {
    if (!selectedGame || !newSideName.trim()) return;
    setError(null);
    const { error } = await supabase.from('game_sides').insert({
      game_id: selectedGame.id,
      name: newSideName.trim(),
    });
    if (error) {
      setError(error.message);
      return;
    }
    setNewSideName('');
    loadSides(selectedGame);
  };

  const setSideCommander = async (sideId: string, profileId: string | null) => {
    setError(null);
    const { error } = await supabase.from('game_sides').update({ commander_id: profileId }).eq('id', sideId);
    if (error) {
      setError(error.message);
      return;
    }
    setSides((prev) => prev.map((s) => (s.id === sideId ? { ...s, commander_id: profileId } : s)));
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  if (selectedGame) {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <Pressable onPress={() => setSelectedGame(null)}>
          <Text style={styles.back}>‹ {selectedProject?.name}</Text>
        </Pressable>
        <Text style={styles.title}>{selectedGame.name}</Text>
        <Text style={styles.subtitle}>Полигон: {selectedGame.polygon}</Text>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Text style={styles.sectionTitle}>Стороны</Text>
        {sides.map((side) => (
          <View key={side.id} style={styles.card}>
            <Text style={styles.cardTitle}>{side.name}</Text>
            <Text style={styles.label}>Командир стороны</Text>
            <View style={styles.chips}>
              <Pressable
                style={[styles.chip, !side.commander_id && styles.chipSelected]}
                onPress={() => setSideCommander(side.id, null)}
              >
                <Text style={!side.commander_id ? styles.chipTextSelected : styles.chipText}>—</Text>
              </Pressable>
              {profiles.map((p) => (
                <Pressable
                  key={p.id}
                  style={[styles.chip, side.commander_id === p.id && styles.chipSelected]}
                  onPress={() => setSideCommander(side.id, p.id)}
                >
                  <Text style={side.commander_id === p.id ? styles.chipTextSelected : styles.chipText}>
                    {p.full_name || '(без имени)'}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        ))}

        <Text style={styles.sectionTitle}>Новая сторона</Text>
        <TextInput
          style={styles.input}
          placeholder="Название (напр. Красные)"
          value={newSideName}
          onChangeText={setNewSideName}
        />
        <Pressable style={styles.addButton} onPress={createSide}>
          <Text style={styles.addButtonText}>Добавить сторону</Text>
        </Pressable>
      </ScrollView>
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

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Text style={styles.sectionTitle}>Игры</Text>
        {games.map((game) => (
          <Pressable
            key={game.id}
            style={styles.card}
            onPress={() => {
              setSelectedGame(game);
              loadSides(game);
            }}
          >
            <Text style={styles.cardTitle}>{game.name}</Text>
            <Text style={styles.label}>Полигон: {game.polygon}</Text>
          </Pressable>
        ))}

        <Text style={styles.sectionTitle}>Новая игра</Text>
        <TextInput
          style={styles.input}
          placeholder="Название игры"
          value={newGameName}
          onChangeText={setNewGameName}
        />
        <TextInput
          style={styles.input}
          placeholder="Полигон"
          value={newGamePolygon}
          onChangeText={setNewGamePolygon}
        />
        <Pressable style={styles.addButton} onPress={createGame}>
          <Text style={styles.addButtonText}>Добавить игру</Text>
        </Pressable>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Проекты</Text>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {projects.map((project) => (
        <Pressable
          key={project.id}
          style={styles.card}
          onPress={() => {
            setSelectedProject(project);
            loadGames(project);
          }}
        >
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
  addButton: {
    backgroundColor: '#111',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 20,
  },
  addButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  error: {
    color: '#c00',
    marginBottom: 12,
  },
});
