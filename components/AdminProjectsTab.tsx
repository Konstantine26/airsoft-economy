import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { supabase } from '../lib/supabase';
import type { Game, Polygon, Profile, Project } from '../lib/database.types';
import { GAME_TYPES, GAME_TYPE_LABEL, type GameType } from '../lib/gameTypes';
import { Card } from './Card';
import { Chip } from './Chip';
import { Button } from './Button';
import { TextField } from './TextField';
import { GameManageScreen } from './GameManageScreen';
import { colors, font, radii, spacing } from '../lib/theme';

type GameWithPolygon = Game & { polygon: Polygon | null };

type Props = {
  onProjectsChanged: () => void;
};

export function AdminProjectsTab({ onProjectsChanged }: Props) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [polygons, setPolygons] = useState<Polygon[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [games, setGames] = useState<GameWithPolygon[]>([]);
  const [projectOrganizerIds, setProjectOrganizerIds] = useState<Set<string>>(new Set());
  const [gameOrganizerIds, setGameOrganizerIds] = useState<Record<string, Set<string>>>({});
  const [manageGameId, setManageGameId] = useState<string | null>(null);

  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectDescription, setNewProjectDescription] = useState('');
  const [newProjectEconomyEnabled, setNewProjectEconomyEnabled] = useState(false);
  const [newProjectGameType, setNewProjectGameType] = useState<GameType | null>(null);
  const [editingProject, setEditingProject] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editEconomyEnabled, setEditEconomyEnabled] = useState(false);
  const [editDefaultGameType, setEditDefaultGameType] = useState<GameType | null>(null);

  const [newGameName, setNewGameName] = useState('');
  const [newGamePolygonId, setNewGamePolygonId] = useState<string | null>(null);
  const [newGameStartsAt, setNewGameStartsAt] = useState('');
  const [newGameEndsAt, setNewGameEndsAt] = useState('');
  const [newGameDescription, setNewGameDescription] = useState('');
  const [newGameType, setNewGameType] = useState<GameType | null>(null);

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
    setNewGameName('');
    setNewGamePolygonId(null);
    setNewGameStartsAt('');
    setNewGameEndsAt('');
    setNewGameDescription('');
    setNewGameType(project.default_game_type);

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
      economy_enabled: newProjectEconomyEnabled,
      default_game_type: newProjectGameType,
      created_by: userData.user?.id,
    });
    if (error) {
      setError(error.message);
      return;
    }
    setNewProjectName('');
    setNewProjectDescription('');
    setNewProjectEconomyEnabled(false);
    setNewProjectGameType(null);
    loadProjects();
    onProjectsChanged();
  };

  const startEditProject = () => {
    if (!selectedProject) return;
    setEditName(selectedProject.name);
    setEditDescription(selectedProject.description ?? '');
    setEditEconomyEnabled(selectedProject.economy_enabled);
    setEditDefaultGameType(selectedProject.default_game_type);
    setEditingProject(true);
  };

  const saveEditProject = async () => {
    if (!selectedProject || !editName.trim()) return;
    setError(null);
    const updates = {
      name: editName.trim(),
      description: editDescription.trim() || null,
      economy_enabled: editEconomyEnabled,
      default_game_type: editDefaultGameType,
    };
    const { error } = await supabase.from('projects').update(updates).eq('id', selectedProject.id);
    if (error) {
      setError(error.message);
      return;
    }
    const updated = { ...selectedProject, ...updates };
    setSelectedProject(updated);
    setProjects((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
    setEditingProject(false);
    onProjectsChanged();
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
    onProjectsChanged();
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
    const endsAtDate = newGameEndsAt.trim() ? new Date(newGameEndsAt.trim()) : null;
    if (endsAtDate && Number.isNaN(endsAtDate.getTime())) {
      setError('Не удалось разобрать дату окончания игры');
      return;
    }
    const { data: userData } = await supabase.auth.getUser();
    const { data: createdGame, error } = await supabase
      .from('games')
      .insert({
        project_id: selectedProject.id,
        name: newGameName.trim(),
        polygon_id: newGamePolygonId,
        starts_at: startsAtDate ? startsAtDate.toISOString() : null,
        ends_at: endsAtDate ? endsAtDate.toISOString() : null,
        description: newGameDescription.trim() || null,
        game_type: newGameType,
        created_by: userData.user?.id,
      })
      .select('id')
      .single();
    if (error) {
      setError(error.message);
      return;
    }
    if (createdGame) {
      await supabase.from('game_sides').insert([
        { game_id: createdGame.id, name: 'Белые' },
        { game_id: createdGame.id, name: 'Красные' },
      ]);
    }
    setNewGameName('');
    setNewGamePolygonId(null);
    setNewGameStartsAt('');
    setNewGameEndsAt('');
    setNewGameDescription('');
    setNewGameType(selectedProject.default_game_type);
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
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (manageGameId) {
    return (
      <GameManageScreen
        gameId={manageGameId}
        onBack={() => {
          setManageGameId(null);
          if (selectedProject) openProject(selectedProject);
        }}
        onDeleted={() => {
          setManageGameId(null);
          if (selectedProject) openProject(selectedProject);
          loadProjects();
          onProjectsChanged();
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

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {editingProject ? (
          <>
            <TextField style={styles.input} label="Название" value={editName} onChangeText={setEditName} />
            <TextField
              style={styles.input}
              label="Описание"
              value={editDescription}
              onChangeText={setEditDescription}
            />
            <Pressable
              style={styles.checkboxRow}
              onPress={() => setEditEconomyEnabled((v) => !v)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: editEconomyEnabled }}
              accessibilityLabel="Ведение экономики"
            >
              <View style={[styles.checkbox, editEconomyEnabled && styles.checkboxChecked]} />
              <Text style={styles.checkboxLabel}>Ведение экономики</Text>
            </Pressable>
            <Text style={styles.label}>Тип игры по умолчанию</Text>
            <Text style={styles.label}>Автоматически проставляется в каждую новую игру проекта</Text>
            <View style={styles.chips}>
              <Chip label="—" selected={!editDefaultGameType} onPress={() => setEditDefaultGameType(null)} />
              {GAME_TYPES.map((t) => (
                <Chip
                  key={t}
                  label={GAME_TYPE_LABEL[t]}
                  selected={editDefaultGameType === t}
                  onPress={() => setEditDefaultGameType(t)}
                />
              ))}
            </View>
            <View style={styles.row}>
              <Button title="Сохранить" onPress={saveEditProject} style={styles.flexButton} />
              <Button title="Отмена" variant="secondary" onPress={() => setEditingProject(false)} style={styles.flexButton} />
            </View>
          </>
        ) : (
          <>
            <Text style={styles.title}>{selectedProject.name}</Text>
            {selectedProject.description ? (
              <Text style={styles.subtitle}>{selectedProject.description}</Text>
            ) : null}
            <Text style={styles.label}>
              Ведение экономики: {selectedProject.economy_enabled ? 'включено' : 'выключено'}
            </Text>
            <Text style={styles.label}>
              Тип игры по умолчанию:{' '}
              {selectedProject.default_game_type ? GAME_TYPE_LABEL[selectedProject.default_game_type] : 'не задан'}
            </Text>
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
            <Chip
              key={p.id}
              label={p.full_name || '(без имени)'}
              selected={projectOrganizerIds.has(p.id)}
              onPress={() => toggleProjectOrganizer(p.id)}
            />
          ))}
        </View>

        <Text style={styles.sectionTitle}>Игры</Text>
        <View style={styles.list}>
          {games.map((game) => (
            <Card key={game.id}>
              <View style={styles.row}>
                <Text style={styles.cardTitle}>{game.name}</Text>
                <Pressable onPress={() => setManageGameId(game.id)}>
                  <Text style={styles.editLink}>Управлять</Text>
                </Pressable>
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
                    <Chip
                      key={p.id}
                      label={p.full_name || '(без имени)'}
                      selected={selected}
                      onPress={() => toggleGameOrganizer(game.id, p.id)}
                    />
                  );
                })}
              </View>
            </Card>
          ))}
        </View>

        <Text style={styles.sectionTitle}>Новая игра</Text>
        <TextField style={styles.input} label="Название игры" value={newGameName} onChangeText={setNewGameName} />
        <TextField
          style={styles.input}
          label="Дата начала"
          placeholder="Необязательно, напр. 2026-08-01 10:00"
          value={newGameStartsAt}
          onChangeText={setNewGameStartsAt}
        />
        <TextField
          style={styles.input}
          label="Дата окончания"
          placeholder="Необязательно, напр. 2026-08-01 18:00"
          value={newGameEndsAt}
          onChangeText={setNewGameEndsAt}
        />
        <TextField
          style={[styles.input, styles.textArea]}
          label="Описание сценария"
          placeholder="Необязательно"
          value={newGameDescription}
          onChangeText={setNewGameDescription}
          multiline
          numberOfLines={4}
        />
        <Text style={styles.label}>Тип игры</Text>
        <View style={styles.chips}>
          <Chip label="—" selected={!newGameType} onPress={() => setNewGameType(null)} />
          {GAME_TYPES.map((t) => (
            <Chip key={t} label={GAME_TYPE_LABEL[t]} selected={newGameType === t} onPress={() => setNewGameType(t)} />
          ))}
        </View>
        <Text style={styles.label}>Полигон</Text>
        {polygons.length === 0 ? (
          <Text style={styles.label}>Нет ни одного полигона — сначала создайте его во вкладке «Полигоны».</Text>
        ) : (
          <View style={styles.chips}>
            {polygons.map((p) => (
              <Chip key={p.id} label={p.name} selected={newGamePolygonId === p.id} onPress={() => setNewGamePolygonId(p.id)} />
            ))}
          </View>
        )}
        <Button title="Добавить игру" onPress={createGame} style={styles.addButtonSpacing} />
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.list}>
        {projects.map((project) => (
          <Pressable key={project.id} onPress={() => openProject(project)}>
            <Card>
              <Text style={styles.cardTitle}>{project.name}</Text>
              {project.description ? <Text style={styles.label}>{project.description}</Text> : null}
              <Text style={styles.label}>
                Экономика: {project.economy_enabled ? 'включена' : 'выключена'}
              </Text>
            </Card>
          </Pressable>
        ))}
      </View>

      <Text style={styles.sectionTitle}>Новый проект</Text>
      <TextField
        style={styles.input}
        label="Название проекта"
        value={newProjectName}
        onChangeText={setNewProjectName}
      />
      <TextField
        style={styles.input}
        label="Описание"
        placeholder="Необязательно"
        value={newProjectDescription}
        onChangeText={setNewProjectDescription}
      />
      <Pressable
        style={styles.checkboxRow}
        onPress={() => setNewProjectEconomyEnabled((v) => !v)}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: newProjectEconomyEnabled }}
        accessibilityLabel="Ведение экономики"
      >
        <View style={[styles.checkbox, newProjectEconomyEnabled && styles.checkboxChecked]} />
        <Text style={styles.checkboxLabel}>Ведение экономики</Text>
      </Pressable>
      <Text style={styles.label}>Тип игры по умолчанию</Text>
      <Text style={styles.label}>Автоматически проставляется в каждую новую игру проекта</Text>
      <View style={styles.chips}>
        <Chip label="—" selected={!newProjectGameType} onPress={() => setNewProjectGameType(null)} />
        {GAME_TYPES.map((t) => (
          <Chip
            key={t}
            label={GAME_TYPE_LABEL[t]}
            selected={newProjectGameType === t}
            onPress={() => setNewProjectGameType(t)}
          />
        ))}
      </View>
      <Button title="Добавить проект" onPress={createProject} style={styles.addButtonSpacing} />
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
    marginBottom: 4,
  },
  list: {
    gap: spacing.sm,
  },
  cardTitle: {
    fontFamily: font.bodySemiBold,
    fontSize: 14,
    color: colors.text,
    flex: 1,
  },
  label: {
    fontFamily: font.body,
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 4,
    marginBottom: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: spacing.sm,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 6,
  },
  input: {
    marginBottom: spacing.sm + 2,
  },
  textArea: {
    minHeight: 90,
    textAlignVertical: 'top',
  },
  flexButton: {
    flex: 1,
  },
  addButtonSpacing: {
    marginTop: spacing.sm,
    marginBottom: spacing.xl,
  },
  editLink: {
    fontFamily: font.bodySemiBold,
    color: colors.accent,
    fontSize: 13,
  },
  deleteLink: {
    fontFamily: font.body,
    color: colors.danger,
    fontSize: 13,
  },
  error: {
    fontFamily: font.body,
    color: colors.danger,
    marginBottom: spacing.md,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: spacing.sm + 2,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: radii.sm / 2,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.card,
  },
  checkboxChecked: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  checkboxLabel: {
    fontFamily: font.body,
    fontSize: 14,
    color: colors.text,
  },
});
