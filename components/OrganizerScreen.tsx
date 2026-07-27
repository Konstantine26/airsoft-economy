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
import { useAuth } from '../contexts/AuthContext';
import type {
  Game,
  GameParticipant,
  GameSide,
  Polygon,
  PolygonType,
  Profile,
  Project,
  Team,
} from '../lib/database.types';
import { Avatar } from './Avatar';
import { PolygonMapThumbnails } from './PolygonMapThumbnails';

const TYPE_LABEL: Record<PolygonType, string> = {
  built_up: 'Застройка',
  forest: 'Лес',
  field: 'Поле',
  sqb: 'SQB',
  mixed: 'Смешанный',
};

type GameWithRelations = Game & { project: Project | null; polygon: Polygon | null };
type ParticipantRow = GameParticipant & {
  team_name: string;
  full_name: string;
  avatar_url: string | null;
  effective_side_id: string | null;
};

export function OrganizerScreen() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [polygons, setPolygons] = useState<Polygon[]>([]);
  const [allGames, setAllGames] = useState<GameWithRelations[]>([]);

  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [selectedGame, setSelectedGame] = useState<GameWithRelations | null>(null);

  const [sides, setSides] = useState<GameSide[]>([]);
  const [participants, setParticipants] = useState<ParticipantRow[]>([]);
  const [newSideName, setNewSideName] = useState('');

  const [editingCard, setEditingCard] = useState(false);
  const [editName, setEditName] = useState('');
  const [editStartsAt, setEditStartsAt] = useState('');
  const [editPolygonId, setEditPolygonId] = useState<string | null>(null);

  const loadAccessible = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    setError(null);

    const [profilesRes, polygonsRes] = await Promise.all([
      supabase.from('profiles').select('*').order('full_name', { ascending: true }),
      supabase.from('polygons').select('*').order('name', { ascending: true }),
    ]);
    setProfiles(profilesRes.data ?? []);
    setPolygons(polygonsRes.data ?? []);

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

  const loadGameDetail = useCallback(async (game: GameWithRelations) => {
    setError(null);
    const [sidesRes, teamSidesRes, participantsRes] = await Promise.all([
      supabase.from('game_sides').select('*').eq('game_id', game.id).order('name', { ascending: true }),
      supabase.from('game_team_sides').select('team_id, side_id').eq('game_id', game.id),
      supabase
        .from('game_participants')
        .select('*, team:teams(name), profile:profiles(full_name, avatar_url)')
        .eq('game_id', game.id),
    ]);
    setSides(sidesRes.data ?? []);

    const teamSideMap = new Map<string, string>();
    for (const row of teamSidesRes.data ?? []) {
      teamSideMap.set(row.team_id, row.side_id);
    }

    const rows: ParticipantRow[] = ((participantsRes.data as any[]) ?? []).map((row) => ({
      ...row,
      team_name: row.team?.name ?? '',
      full_name: row.profile?.full_name || '(без имени)',
      avatar_url: row.profile?.avatar_url ?? null,
      effective_side_id: row.side_id ?? teamSideMap.get(row.team_id) ?? null,
    }));
    setParticipants(rows);
  }, []);

  const openGame = (game: GameWithRelations) => {
    setSelectedGame(game);
    setEditingCard(false);
    loadGameDetail(game);
  };

  const startEditCard = () => {
    if (!selectedGame) return;
    setEditName(selectedGame.name);
    setEditStartsAt(selectedGame.starts_at ? selectedGame.starts_at.slice(0, 16).replace('T', ' ') : '');
    setEditPolygonId(selectedGame.polygon_id);
    setEditingCard(true);
  };

  const saveCard = async () => {
    if (!selectedGame || !editName.trim() || !editPolygonId) return;
    setError(null);
    const startsAtDate = editStartsAt.trim() ? new Date(editStartsAt.trim()) : null;
    if (startsAtDate && Number.isNaN(startsAtDate.getTime())) {
      setError('Не удалось разобрать дату начала игры');
      return;
    }
    const updates = {
      name: editName.trim(),
      polygon_id: editPolygonId,
      starts_at: startsAtDate ? startsAtDate.toISOString() : null,
    };
    const { error } = await supabase.from('games').update(updates).eq('id', selectedGame.id);
    if (error) {
      setError(error.message);
      return;
    }
    const updatedPolygon = polygons.find((p) => p.id === editPolygonId) ?? null;
    const updated = { ...selectedGame, ...updates, polygon: updatedPolygon };
    setSelectedGame(updated);
    setAllGames((prev) => prev.map((g) => (g.id === updated.id ? updated : g)));
    setEditingCard(false);
  };

  const createSide = async () => {
    if (!selectedGame || !newSideName.trim()) return;
    setError(null);
    const { error } = await supabase.from('game_sides').insert({ game_id: selectedGame.id, name: newSideName.trim() });
    if (error) {
      setError(error.message);
      return;
    }
    setNewSideName('');
    loadGameDetail(selectedGame);
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

  const confirmParticipant = async (row: ParticipantRow) => {
    setError(null);
    const { error } = await supabase.from('game_participants').update({ status: 'confirmed' }).eq('id', row.id);
    if (error) {
      setError(error.message);
      return;
    }
    setParticipants((prev) => prev.map((p) => (p.id === row.id ? { ...p, status: 'confirmed' } : p)));
  };

  const removeParticipant = async (row: ParticipantRow) => {
    setError(null);
    const { error } = await supabase.from('game_participants').delete().eq('id', row.id);
    if (error) {
      setError(error.message);
      return;
    }
    setParticipants((prev) => prev.filter((p) => p.id !== row.id));
  };

  const moveParticipant = async (row: ParticipantRow, sideId: string | null) => {
    setError(null);
    const { error } = await supabase.from('game_participants').update({ side_id: sideId }).eq('id', row.id);
    if (error) {
      setError(error.message);
      return;
    }
    if (!selectedGame) return;
    loadGameDetail(selectedGame);
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  if (selectedGame) {
    const withoutSide = participants.filter((p) => !p.effective_side_id);

    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <Pressable onPress={() => setSelectedGame(null)}>
          <Text style={styles.back}>‹ {selectedProject?.name}</Text>
        </Pressable>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {editingCard ? (
          <>
            <Text style={styles.sectionTitle}>Карточка игры</Text>
            <TextInput style={styles.input} placeholder="Название" value={editName} onChangeText={setEditName} />
            <TextInput
              style={styles.input}
              placeholder="Дата начала (напр. 2026-08-01 10:00)"
              value={editStartsAt}
              onChangeText={setEditStartsAt}
            />
            <Text style={styles.label}>Полигон</Text>
            <View style={styles.chips}>
              {polygons.map((p) => (
                <Pressable
                  key={p.id}
                  style={[styles.chip, editPolygonId === p.id && styles.chipSelected]}
                  onPress={() => setEditPolygonId(p.id)}
                >
                  <Text style={editPolygonId === p.id ? styles.chipTextSelected : styles.chipText}>{p.name}</Text>
                </Pressable>
              ))}
            </View>
            <View style={styles.row}>
              <Pressable style={[styles.addButton, styles.flexButton]} onPress={saveCard}>
                <Text style={styles.addButtonText}>Сохранить</Text>
              </Pressable>
              <Pressable style={[styles.secondaryButton, styles.flexButton]} onPress={() => setEditingCard(false)}>
                <Text style={styles.secondaryButtonText}>Отмена</Text>
              </Pressable>
            </View>
          </>
        ) : (
          <>
            <Text style={styles.title}>{selectedGame.name}</Text>
            {selectedGame.starts_at ? (
              <Text style={styles.subtitle}>Начало: {new Date(selectedGame.starts_at).toLocaleString()}</Text>
            ) : null}
            <Pressable onPress={startEditCard}>
              <Text style={styles.editLink}>Редактировать карточку игры</Text>
            </Pressable>
          </>
        )}

        <Text style={styles.sectionTitle}>Полигон</Text>
        {selectedGame.polygon ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{selectedGame.polygon.name}</Text>
            <Text style={styles.label}>{locationLine(selectedGame.polygon)}</Text>
            <Text style={styles.label}>Тип: {TYPE_LABEL[selectedGame.polygon.type]}</Text>
            <PolygonMapThumbnails polygonId={selectedGame.polygon.id} />
          </View>
        ) : (
          <Text style={styles.label}>Полигон не выбран</Text>
        )}

        <Text style={styles.sectionTitle}>Стороны</Text>
        {sides.map((side) => {
          const roster = participants.filter((p) => p.effective_side_id === side.id);
          return (
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

              <Text style={styles.label}>Участники</Text>
              {roster.length === 0 ? (
                <Text style={styles.label}>Пока никого</Text>
              ) : (
                roster.map((row) => (
                  <ParticipantRowView
                    key={row.id}
                    row={row}
                    sides={sides}
                    onConfirm={() => confirmParticipant(row)}
                    onRemove={() => removeParticipant(row)}
                    onMove={(sideId) => moveParticipant(row, sideId)}
                  />
                ))
              )}
            </View>
          );
        })}

        {withoutSide.length > 0 ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Без стороны</Text>
            {withoutSide.map((row) => (
              <ParticipantRowView
                key={row.id}
                row={row}
                sides={sides}
                onConfirm={() => confirmParticipant(row)}
                onRemove={() => removeParticipant(row)}
                onMove={(sideId) => moveParticipant(row, sideId)}
              />
            ))}
          </View>
        ) : null}

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
        {selectedProject.description ? <Text style={styles.subtitle}>{selectedProject.description}</Text> : null}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Text style={styles.sectionTitle}>Игры</Text>
        {gamesForSelectedProject.length === 0 ? (
          <Text style={styles.label}>Нет назначенных вам игр в этом проекте</Text>
        ) : (
          gamesForSelectedProject.map((game) => (
            <Pressable key={game.id} style={styles.card} onPress={() => openGame(game)}>
              <Text style={styles.cardTitle}>{game.name}</Text>
              <Text style={styles.label}>Полигон: {game.polygon?.name ?? '—'}</Text>
            </Pressable>
          ))
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
        projects.map((project) => (
          <Pressable key={project.id} style={styles.card} onPress={() => setSelectedProject(project)}>
            <Text style={styles.cardTitle}>{project.name}</Text>
            {project.description ? <Text style={styles.label}>{project.description}</Text> : null}
          </Pressable>
        ))
      )}
    </ScrollView>
  );
}

function ParticipantRowView({
  row,
  sides,
  onConfirm,
  onRemove,
  onMove,
}: {
  row: ParticipantRow;
  sides: GameSide[];
  onConfirm: () => void;
  onRemove: () => void;
  onMove: (sideId: string | null) => void;
}) {
  return (
    <View style={styles.participantRow}>
      <View style={styles.row}>
        <Avatar uri={row.avatar_url} name={row.full_name} size={28} />
        <Text style={styles.participantName}>
          {row.full_name} · {row.team_name}
        </Text>
        <Text style={row.status === 'confirmed' ? styles.statusConfirmed : styles.statusPending}>
          {row.status === 'confirmed' ? 'Подтверждён' : 'На подтверждении'}
        </Text>
      </View>
      <View style={styles.chips}>
        {row.status === 'pending' ? (
          <Pressable style={styles.smallActionButton} onPress={onConfirm}>
            <Text style={styles.smallActionText}>Подтвердить</Text>
          </Pressable>
        ) : null}
        <Pressable style={styles.smallActionButtonDanger} onPress={onRemove}>
          <Text style={styles.smallActionTextDanger}>Удалить</Text>
        </Pressable>
      </View>
      <Text style={styles.label}>Переместить на сторону</Text>
      <View style={styles.chips}>
        {row.side_id !== null ? (
          <Pressable style={styles.chip} onPress={() => onMove(null)}>
            <Text style={styles.chipText}>По команде</Text>
          </Pressable>
        ) : null}
        {sides
          .filter((s) => s.id !== row.effective_side_id)
          .map((s) => (
            <Pressable key={s.id} style={styles.chip} onPress={() => onMove(s.id)}>
              <Text style={styles.chipText}>{s.name}</Text>
            </Pressable>
          ))}
      </View>
    </View>
  );
}

function locationLine(p: Polygon) {
  return [p.country, p.region, p.city, p.address].filter(Boolean).join(', ') || 'Расположение не указано';
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
    flex: 1,
  },
  label: {
    fontSize: 13,
    color: '#666',
    marginTop: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
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
    marginTop: 6,
  },
  error: {
    color: '#c00',
    marginBottom: 12,
  },
  participantRow: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#eee',
    paddingTop: 8,
    marginTop: 8,
  },
  participantName: {
    fontSize: 14,
    flex: 1,
  },
  statusPending: {
    fontSize: 12,
    color: '#a66a00',
    fontWeight: '600',
  },
  statusConfirmed: {
    fontSize: 12,
    color: '#0a7d2c',
    fontWeight: '600',
  },
  smallActionButton: {
    backgroundColor: '#0a7d2c',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  smallActionText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  smallActionButtonDanger: {
    borderWidth: 1,
    borderColor: '#c00',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  smallActionTextDanger: {
    color: '#c00',
    fontSize: 12,
    fontWeight: '600',
  },
});
