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

  const deleteClub = async (club: Club) => {
    setError(null);
    const { error } = await supabase.from('clubs').delete().eq('id', club.id);
    if (error) {
      setError(error.message);
      return;
    }
    setSelectedClub(null);
    loadClubs();
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
            <View style={styles.row}>
              <Pressable onPress={startEditing}>
                <Text style={styles.editLink}>Редактировать</Text>
              </Pressable>
              <Pressable onPress={() => deleteClub(selectedClub)}>
                <Text style={styles.deleteLink}>Удалить клуб</Text>
              </Pressable>
            </View>
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
              <Text style={styles.cardTitle}>{club.name}</Text>
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
});
