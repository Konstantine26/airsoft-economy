import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { supabase } from '../lib/supabase';
import type { Club, Profile } from '../lib/database.types';
import { Card } from './Card';
import { Chip } from './Chip';
import { Button } from './Button';
import { TextField } from './TextField';
import { colors, font, spacing } from '../lib/theme';

export function AdminClubsTab() {
  const [clubs, setClubs] = useState<Club[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedClub, setSelectedClub] = useState<Club | null>(null);
  const [clubAdminIds, setClubAdminIds] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState(false);

  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');

  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleteCounts, setDeleteCounts] = useState<{ projects: number; polygons: number } | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadClubs = useCallback(async () => {
    setLoading(true);
    const [clubsRes, profilesRes] = await Promise.all([
      supabase.from('clubs').select('*').order('name', { ascending: true }),
      supabase.from('profiles').select('*').order('full_name', { ascending: true }),
    ]);
    if (clubsRes.error) setError(clubsRes.error.message);
    setClubs(clubsRes.data ?? []);
    setProfiles(profilesRes.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadClubs();
  }, [loadClubs]);

  const openClub = async (club: Club) => {
    setError(null);
    setSelectedClub(club);
    setEditing(false);
    setConfirmingDelete(false);
    setDeleteConfirmText('');
    setDeleteCounts(null);
    const { data } = await supabase.from('club_admins').select('profile_id').eq('club_id', club.id);
    setClubAdminIds(new Set((data ?? []).map((r) => r.profile_id)));
  };

  const createClub = async () => {
    if (!newName.trim()) return;
    setError(null);
    const { data: userData } = await supabase.auth.getUser();
    const { error } = await supabase.from('clubs').insert({
      name: newName.trim(),
      description: newDescription.trim() || null,
      created_by: userData.user?.id,
    });
    if (error) {
      setError(error.message);
      return;
    }
    setNewName('');
    setNewDescription('');
    loadClubs();
  };

  const startEditing = () => {
    if (!selectedClub) return;
    setEditName(selectedClub.name);
    setEditDescription(selectedClub.description ?? '');
    setEditing(true);
  };

  const saveEdit = async () => {
    if (!selectedClub || !editName.trim()) return;
    setError(null);
    const updates = { name: editName.trim(), description: editDescription.trim() || null };
    const { error } = await supabase.from('clubs').update(updates).eq('id', selectedClub.id);
    if (error) {
      setError(error.message);
      return;
    }
    const updated = { ...selectedClub, ...updates };
    setSelectedClub(updated);
    setClubs((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
    setEditing(false);
  };

  const toggleArchived = async (club: Club) => {
    setError(null);
    const nextArchivedAt = club.archived_at ? null : new Date().toISOString();
    const { error } = await supabase.from('clubs').update({ archived_at: nextArchivedAt }).eq('id', club.id);
    if (error) {
      setError(error.message);
      return;
    }
    const updated = { ...club, archived_at: nextArchivedAt };
    setSelectedClub(updated);
    setClubs((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
  };

  const startDeleteConfirm = async (club: Club) => {
    setError(null);
    const [projectsRes, polygonsRes] = await Promise.all([
      supabase.from('projects').select('id', { count: 'exact', head: true }).eq('club_id', club.id),
      supabase.from('polygons').select('id', { count: 'exact', head: true }).eq('club_id', club.id),
    ]);
    setDeleteCounts({ projects: projectsRes.count ?? 0, polygons: polygonsRes.count ?? 0 });
    setDeleteConfirmText('');
    setConfirmingDelete(true);
  };

  // Postgres cascades the DB rows (projects.club_id/polygons.club_id are
  // "on delete cascade", so every game/task/transaction/etc already chained
  // off a project, plus polygon_maps, disappear on their own) -- but it
  // never touches Supabase Storage, so the actual files have to be removed
  // by hand first or they'd leak forever.
  const deleteClub = async (club: Club) => {
    setError(null);
    setDeleting(true);
    try {
      const { data: projects } = await supabase.from('projects').select('id').eq('club_id', club.id);
      const projectIds = (projects ?? []).map((p) => p.id);

      const { data: polygons } = await supabase.from('polygons').select('id').eq('club_id', club.id);
      const polygonIds = (polygons ?? []).map((p) => p.id);

      let gameIds: string[] = [];
      if (projectIds.length > 0) {
        const { data: games } = await supabase.from('games').select('id').in('project_id', projectIds);
        gameIds = (games ?? []).map((g) => g.id);
      }

      if (gameIds.length > 0) {
        const { data: gameAttachments } = await supabase
          .from('game_attachments')
          .select('storage_path')
          .in('game_id', gameIds);
        const gamePaths = (gameAttachments ?? []).map((a) => a.storage_path);
        if (gamePaths.length > 0) await supabase.storage.from('game-attachments').remove(gamePaths);

        const { data: tasks } = await supabase.from('tasks').select('id').in('game_id', gameIds);
        const taskIds = (tasks ?? []).map((t) => t.id);
        if (taskIds.length > 0) {
          const { data: taskAttachments } = await supabase
            .from('task_attachments')
            .select('storage_path')
            .in('task_id', taskIds);
          const taskPaths = (taskAttachments ?? []).map((a) => a.storage_path);
          if (taskPaths.length > 0) await supabase.storage.from('task-attachments').remove(taskPaths);
        }
      }

      if (polygonIds.length > 0) {
        const { data: polygonMaps } = await supabase
          .from('polygon_maps')
          .select('storage_path')
          .in('polygon_id', polygonIds);
        const mapPaths = (polygonMaps ?? []).map((m) => m.storage_path);
        if (mapPaths.length > 0) await supabase.storage.from('polygon-maps').remove(mapPaths);
      }

      const { error } = await supabase.from('clubs').delete().eq('id', club.id);
      if (error) {
        setError(error.message);
        return;
      }
      setSelectedClub(null);
      setConfirmingDelete(false);
      loadClubs();
    } finally {
      setDeleting(false);
    }
  };

  const toggleClubAdmin = async (profileId: string) => {
    if (!selectedClub) return;
    setError(null);
    if (clubAdminIds.has(profileId)) {
      const { error } = await supabase
        .from('club_admins')
        .delete()
        .eq('club_id', selectedClub.id)
        .eq('profile_id', profileId);
      if (error) {
        setError(error.message);
        return;
      }
      setClubAdminIds((prev) => {
        const next = new Set(prev);
        next.delete(profileId);
        return next;
      });
    } else {
      const { error } = await supabase.from('club_admins').insert({ club_id: selectedClub.id, profile_id: profileId });
      if (error) {
        setError(error.message);
        return;
      }
      setClubAdminIds((prev) => new Set(prev).add(profileId));
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (selectedClub) {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <Pressable onPress={() => setSelectedClub(null)}>
          <Text style={styles.back}>‹ Клубы</Text>
        </Pressable>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {editing ? (
          <>
            <TextField style={styles.input} label="Название" value={editName} onChangeText={setEditName} />
            <TextField style={styles.input} label="Описание" value={editDescription} onChangeText={setEditDescription} />
            <View style={styles.row}>
              <Button title="Сохранить" onPress={saveEdit} style={styles.flexButton} />
              <Button title="Отмена" variant="secondary" onPress={() => setEditing(false)} style={styles.flexButton} />
            </View>
          </>
        ) : (
          <>
            <Text style={styles.title}>{selectedClub.name}</Text>
            {selectedClub.description ? <Text style={styles.subtitle}>{selectedClub.description}</Text> : null}
            <Text style={styles.label}>
              {selectedClub.archived_at
                ? `В архиве с ${new Date(selectedClub.archived_at).toLocaleDateString()}`
                : 'Не в архиве'}
            </Text>
            <View style={styles.row}>
              <Pressable onPress={startEditing}>
                <Text style={styles.editLink}>Редактировать</Text>
              </Pressable>
              <Pressable onPress={() => toggleArchived(selectedClub)}>
                <Text style={styles.editLink}>{selectedClub.archived_at ? 'Вернуть из архива' : 'Архивировать'}</Text>
              </Pressable>
              {!confirmingDelete ? (
                <Pressable onPress={() => startDeleteConfirm(selectedClub)}>
                  <Text style={styles.deleteLink}>Удалить клуб</Text>
                </Pressable>
              ) : null}
            </View>

            {confirmingDelete ? (
              <Card style={styles.dangerCard}>
                <Text style={styles.dangerTitle}>Удаление необратимо</Text>
                <Text style={styles.label}>
                  Будет удалено безвозвратно: {deleteCounts?.projects ?? 0} проект(ов) — со всеми играми,
                  заявками, заданиями и историей операций внутри, {deleteCounts?.polygons ?? 0} полигон(ов)
                  — со всеми картами. Команды и игроки клуба не затрагиваются.
                </Text>
                <Text style={styles.label}>Чтобы подтвердить, введите название клуба полностью: «{selectedClub.name}»</Text>
                <TextField style={styles.input} value={deleteConfirmText} onChangeText={setDeleteConfirmText} />
                <View style={styles.row}>
                  <Button
                    title={deleting ? 'Удаление…' : 'Подтвердить удаление'}
                    variant="danger"
                    disabled={deleteConfirmText.trim() !== selectedClub.name || deleting}
                    onPress={() => deleteClub(selectedClub)}
                    style={styles.flexButton}
                  />
                  <Button
                    title="Отмена"
                    variant="secondary"
                    onPress={() => {
                      setConfirmingDelete(false);
                      setDeleteConfirmText('');
                    }}
                    style={styles.flexButton}
                  />
                </View>
              </Card>
            ) : null}
          </>
        )}

        <Text style={styles.sectionTitle}>Администраторы клуба</Text>
        <Text style={styles.label}>
          Пока только список на будущее — сам по себе он ещё нигде не проверяется и не даёт
          прав, отдельных от обычного «Админ» (см. дорожную карту).
        </Text>
        <View style={styles.chips}>
          {profiles.map((p) => (
            <Chip
              key={p.id}
              label={p.full_name || '(без имени)'}
              selected={clubAdminIds.has(p.id)}
              onPress={() => toggleClubAdmin(p.id)}
            />
          ))}
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.list}>
        {clubs.map((club) => (
          <Pressable key={club.id} onPress={() => openClub(club)}>
            <Card>
              <Text style={styles.cardTitle}>
                {club.name}
                {club.archived_at ? ' 🗄️' : ''}
              </Text>
              {club.description ? <Text style={styles.label}>{club.description}</Text> : null}
            </Card>
          </Pressable>
        ))}
      </View>

      <Text style={styles.sectionTitle}>Новый клуб</Text>
      <TextField style={styles.input} label="Название клуба" value={newName} onChangeText={setNewName} />
      <TextField
        style={styles.input}
        label="Описание"
        placeholder="Необязательно"
        value={newDescription}
        onChangeText={setNewDescription}
      />
      <Button title="Добавить клуб" onPress={createClub} style={styles.addButtonSpacing} />
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
  dangerCard: {
    marginTop: spacing.sm,
    borderColor: colors.danger,
  },
  dangerTitle: {
    fontFamily: font.bodySemiBold,
    fontSize: 14,
    color: colors.danger,
    marginBottom: 4,
  },
});
