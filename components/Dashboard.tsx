import * as ImagePicker from 'expo-image-picker';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useCapabilities } from '../hooks/useCapabilities';
import { Avatar } from './Avatar';
import { Chip } from './Chip';
import { AdminScreen } from './AdminScreen';
import { BriefingScreen } from './BriefingScreen';
import { OrganizerScreen } from './OrganizerScreen';
import { TeamCommanderScreen } from './TeamCommanderScreen';
import { SideCommanderScreen } from './SideCommanderScreen';
import { ParticipantScreen } from './ParticipantScreen';
import { TeamsScreen } from './TeamsScreen';
import { WalletScreen } from './WalletScreen';
import { colors, font, spacing } from '../lib/theme';
import type { Project } from '../lib/database.types';

type TabKey = 'home' | 'briefing' | 'wallet' | 'economy' | 'team' | 'side' | 'organizer' | 'admin';

const AVATAR_BUCKET = 'avatars';

export function Dashboard() {
  const { profile, session, signOut, refreshProfile } = useAuth();
  const capabilities = useCapabilities();
  const [tab, setTab] = useState<TabKey>('home');
  const [economyProjects, setEconomyProjects] = useState<Project[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [activeGameId, setActiveGameId] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const activateGame = useCallback((game: { id: string; project_id: string }) => {
    setActiveGameId(game.id);
    setActiveProjectId(game.project_id);
    setTab('briefing');
  }, []);

  const changeAvatar = useCallback(async () => {
    if (!session) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Нет доступа к галерее');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled) return;

    setUploadingAvatar(true);
    try {
      const asset = result.assets[0];
      const arrayBuffer = await fetch(asset.uri).then((res) => res.arrayBuffer());
      const path = `${session.user.id}/avatar.jpg`;
      const { error: uploadError } = await supabase.storage
        .from(AVATAR_BUCKET)
        .upload(path, arrayBuffer, { contentType: asset.mimeType ?? 'image/jpeg', upsert: true });
      if (uploadError) throw uploadError;

      const publicUrl = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path).data.publicUrl;
      const avatarUrl = `${publicUrl}?v=${Date.now()}`;

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: avatarUrl })
        .eq('id', session.user.id);
      if (updateError) throw updateError;

      await refreshProfile();
    } catch (e) {
      Alert.alert('Не удалось загрузить фото', e instanceof Error ? e.message : undefined);
    } finally {
      setUploadingAvatar(false);
    }
  }, [session, refreshProfile]);

  const loadEconomyProjects = useCallback(async () => {
    const { data } = await supabase
      .from('projects')
      .select('*')
      .eq('economy_enabled', true)
      .order('name', { ascending: true });
    const rows = data ?? [];
    setEconomyProjects(rows);
    setActiveProjectId((prev) => (prev && rows.some((p) => p.id === prev) ? prev : (rows[0]?.id ?? null)));
  }, []);

  useEffect(() => {
    loadEconomyProjects();
  }, [loadEconomyProjects]);

  const tabs = useMemo(() => {
    const list: { key: TabKey; label: string }[] = [{ key: 'home', label: 'Главная' }];
    if (activeGameId) list.push({ key: 'briefing', label: 'Брифинг' });
    list.push({ key: 'wallet', label: 'Кошелёк' });
    const isOrganizerOrAdmin = profile?.role === 'admin' || capabilities.isOrganizer;
    if (isOrganizerOrAdmin) list.push({ key: 'economy', label: 'Экономика' });
    if (capabilities.commandedTeams.length > 0) list.push({ key: 'team', label: 'Моя команда' });
    if (capabilities.commandedSides.length > 0) list.push({ key: 'side', label: 'Моя сторона' });
    if (isOrganizerOrAdmin) list.push({ key: 'organizer', label: 'Организатор' });
    if (profile?.role === 'admin') list.push({ key: 'admin', label: 'Админ' });
    return list;
  }, [activeGameId, capabilities.commandedTeams, capabilities.commandedSides, capabilities.isOrganizer, profile]);

  if (!profile || capabilities.loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerIdentity}>
          <Pressable onPress={changeAvatar} disabled={uploadingAvatar}>
            {uploadingAvatar ? (
              <View style={[styles.avatarLoading, { width: 32, height: 32, borderRadius: 16 }]}>
                <ActivityIndicator size="small" color={colors.accent} />
              </View>
            ) : (
              <Avatar uri={profile.avatar_url} name={profile.full_name} size={32} />
            )}
          </Pressable>
          <Text style={styles.headerName}>{profile.full_name || 'Без имени'}</Text>
        </View>
        <Pressable onPress={signOut}>
          <Text style={styles.signOut}>Выйти</Text>
        </Pressable>
      </View>

      {economyProjects.length > 0 ? (
        <View style={styles.projectBar}>
          <Text style={styles.projectBarLabel}>Проект:</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.chips}>
              {economyProjects.map((project) => (
                <Chip
                  key={project.id}
                  label={project.name}
                  selected={activeProjectId === project.id}
                  onPress={() => setActiveProjectId(project.id)}
                />
              ))}
            </View>
          </ScrollView>
        </View>
      ) : null}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabBar} contentContainerStyle={styles.tabBarContent}>
        {tabs.map((t) => (
          <Chip key={t.key} label={t.label} selected={tab === t.key} onPress={() => setTab(t.key)} />
        ))}
      </ScrollView>

      <View style={styles.body}>
        {tab === 'home' ? (
          <ParticipantScreen
            ownMembership={capabilities.ownMembership}
            activeProjectId={activeProjectId}
            activeGameId={activeGameId}
            onActivateGame={activateGame}
          />
        ) : null}
        {tab === 'briefing' && activeGameId ? <BriefingScreen gameId={activeGameId} /> : null}
        {tab === 'wallet' ? <WalletScreen projectId={activeProjectId} /> : null}
        {tab === 'economy' ? <TeamsScreen projectId={activeProjectId} /> : null}
        {tab === 'team' ? (
          <TeamCommanderScreen teams={capabilities.commandedTeams} projectId={activeProjectId} />
        ) : null}
        {tab === 'side' ? <SideCommanderScreen sides={capabilities.commandedSides} /> : null}
        {tab === 'organizer' ? <OrganizerScreen /> : null}
        {tab === 'admin' ? (
          <AdminScreen activeProjectId={activeProjectId} onProjectsChanged={loadEconomyProjects} />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
  },
  headerIdentity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  headerName: {
    fontFamily: font.bodySemiBold,
    fontSize: 14,
    color: colors.text,
  },
  avatarLoading: {
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  signOut: {
    fontFamily: font.body,
    fontSize: 12.5,
    color: colors.danger,
  },
  projectBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
  },
  projectBarLabel: {
    fontFamily: font.body,
    fontSize: 12,
    color: colors.textMuted,
  },
  tabBar: {
    flexGrow: 0,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
  },
  tabBarContent: {
    flexDirection: 'row',
    paddingHorizontal: 14,
    paddingVertical: 9,
    gap: 7,
  },
  chips: {
    flexDirection: 'row',
    gap: 8,
  },
  body: {
    flex: 1,
  },
});
