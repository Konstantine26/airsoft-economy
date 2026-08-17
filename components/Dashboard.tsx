import * as ImagePicker from 'expo-image-picker';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useCapabilities } from '../hooks/useCapabilities';
import { Avatar } from './Avatar';
import { Chip } from './Chip';
import { TabBar, type TabBarItem } from './TabBar';
import { AdminScreen } from './AdminScreen';
import { OrganizerScreen } from './OrganizerScreen';
import { TeamCommanderScreen } from './TeamCommanderScreen';
import { SideCommanderScreen } from './SideCommanderScreen';
import { PlayerHomeScreen } from './PlayerHomeScreen';
import { PlayerGamesScreen } from './PlayerGamesScreen';
import { PlayerTeamScreen } from './PlayerTeamScreen';
import { TeamsScreen } from './TeamsScreen';
import { TraderScreen } from './TraderScreen';
import { WalletScreen } from './WalletScreen';
import { HelpScreen } from './HelpScreen';
import { OnboardingCarousel } from './OnboardingCarousel';
import { colors, font, spacing } from '../lib/theme';
import { ROLE_META, type RoleKey } from '../lib/roles';
import { hasSeenOnboarding, markOnboardingSeen } from '../lib/onboardingStorage';
import { getActiveGame, setActiveGame as persistActiveGame, clearActiveGame as persistClearActiveGame, type ActiveGame } from '../lib/activeGameStorage';
import type { Project } from '../lib/database.types';

type PlayerTab = 'home' | 'games' | 'team' | 'wallet';
type OrganizerTab = 'overview' | 'games' | 'economy';

const AVATAR_BUCKET = 'avatars';

export function Dashboard() {
  const { profile, session, signOut, refreshProfile } = useAuth();
  const capabilities = useCapabilities();
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [activeRole, setActiveRole] = useState<RoleKey | null>(null);
  const [playerTab, setPlayerTab] = useState<PlayerTab>('home');
  const [organizerTab, setOrganizerTab] = useState<OrganizerTab>('overview');
  const [helpVisible, setHelpVisible] = useState(false);
  const [onboardingRole, setOnboardingRole] = useState<RoleKey | null>(null);
  const [activeGame, setActiveGame] = useState<ActiveGame | null>(null);

  const openGame = useCallback((game: { id: string; project_id: string }) => {
    setActiveProjectId(game.project_id);
  }, []);

  useEffect(() => {
    if (!profile) {
      setActiveGame(null);
      return;
    }
    let cancelled = false;
    getActiveGame(profile.id).then((game) => {
      if (!cancelled) setActiveGame(game);
    });
    return () => {
      cancelled = true;
    };
  }, [profile]);

  useEffect(() => {
    if (activeGame) setActiveProjectId(activeGame.projectId);
  }, [activeGame]);

  const startGame = useCallback(
    (game: { id: string; project_id: string }) => {
      if (!profile) return;
      const next: ActiveGame = { gameId: game.id, projectId: game.project_id };
      setActiveGame(next);
      persistActiveGame(profile.id, next);
    },
    [profile]
  );

  const endGame = useCallback(() => {
    if (!profile) return;
    setActiveGame(null);
    persistClearActiveGame(profile.id);
  }, [profile]);

  const changeAvatar = useCallback(async () => {
    if (!session) return;
    setAvatarError(null);
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setAvatarError('Нет доступа к галерее');
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
      setAvatarError(e instanceof Error ? e.message : 'Не удалось загрузить фото');
    } finally {
      setUploadingAvatar(false);
    }
  }, [session, refreshProfile]);

  const loadProjects = useCallback(async () => {
    const { data } = await supabase.from('projects').select('*').order('name', { ascending: true });
    const rows = data ?? [];
    setProjects(rows);
    setActiveProjectId((prev) => (prev && rows.some((p) => p.id === prev) ? prev : (rows[0]?.id ?? null)));
  }, []);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  const availableRoles = useMemo(() => {
    const roles: RoleKey[] = ['player'];
    if (capabilities.isTrader) roles.push('trader');
    if (capabilities.commandedTeams.length > 0) roles.push('teamCommander');
    if (capabilities.commandedSides.length > 0) roles.push('sideCommander');
    if (capabilities.isOrganizer) roles.push('organizer');
    if (profile?.role === 'admin') roles.push('admin');
    return roles;
  }, [profile, capabilities.isOrganizer, capabilities.commandedSides, capabilities.commandedTeams, capabilities.isTrader]);

  useEffect(() => {
    setActiveRole((prev) => (prev && availableRoles.includes(prev) ? prev : (availableRoles[0] ?? null)));
  }, [availableRoles]);

  useEffect(() => {
    if (!profile || !activeRole) return;
    let cancelled = false;
    hasSeenOnboarding(profile.id, activeRole).then((seen) => {
      if (!cancelled && !seen) setOnboardingRole(activeRole);
    });
    return () => {
      cancelled = true;
    };
  }, [profile, activeRole]);

  const closeOnboarding = useCallback(() => {
    if (profile && onboardingRole) {
      markOnboardingSeen(profile.id, onboardingRole);
    }
    setOnboardingRole(null);
  }, [profile, onboardingRole]);

  const replayOnboarding = useCallback((role: RoleKey) => {
    setHelpVisible(false);
    setOnboardingRole(role);
  }, []);

  const activeProject = useMemo(() => projects.find((p) => p.id === activeProjectId) ?? null, [projects, activeProjectId]);
  const economyProjectId = activeProject?.economy_enabled ? activeProjectId : null;

  const projectSides = useMemo(
    () => capabilities.commandedSides.filter((s) => s.project_id === activeProjectId),
    [capabilities.commandedSides, activeProjectId]
  );

  const roleItems = useMemo<TabBarItem<RoleKey>[]>(
    () => availableRoles.map((role) => ({ key: role, label: ROLE_META[role].label, icon: ROLE_META[role].icon })),
    [availableRoles]
  );

  if (!profile || capabilities.loading || !activeRole) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.brand}>
          <View style={styles.brandGlyph}>
            <Text style={styles.brandGlyphIcon}>⚔️</Text>
          </View>
          <Text style={styles.brandName}>Airsoft Economy</Text>
        </View>

        <View style={styles.headerRight}>
          <Pressable
            onPress={() => setHelpVisible(true)}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel="Открыть справку"
          >
            <MaterialCommunityIcons name="help-circle-outline" size={19} color={colors.textDim} />
          </Pressable>
          <View style={styles.notificationSlot} accessible={false}>
            <MaterialCommunityIcons name="bell-outline" size={18} color={colors.textDim} />
          </View>
          <Pressable
            onPress={changeAvatar}
            disabled={uploadingAvatar}
            accessibilityRole="button"
            accessibilityLabel="Сменить фото профиля"
          >
            {uploadingAvatar ? (
              <View style={[styles.avatarLoading, { width: 30, height: 30, borderRadius: 15 }]}>
                <ActivityIndicator size="small" color={colors.accent} />
              </View>
            ) : (
              <Avatar uri={profile.avatar_url} name={profile.full_name} size={30} />
            )}
          </Pressable>
          <Pressable onPress={signOut} accessibilityRole="button" accessibilityLabel="Выйти из аккаунта">
            <Text style={styles.signOut}>Выйти</Text>
          </Pressable>
        </View>
      </View>

      {avatarError ? (
        <View style={styles.avatarErrorBanner}>
          <Text style={styles.avatarErrorText}>{avatarError}</Text>
        </View>
      ) : null}

      {roleItems.length > 1 ? <TabBar items={roleItems} activeKey={activeRole} onChange={setActiveRole} /> : null}

      {projects.length > 0 ? (
        <View style={styles.projectBar}>
          <Text style={styles.projectBarLabel}>Проект:</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.chips}>
              {projects.map((project) => (
                <Chip
                  key={project.id}
                  label={project.name}
                  selected={activeProjectId === project.id}
                  onPress={() => setActiveProjectId(project.id)}
                  disabled={!!activeGame && project.id !== activeGame.projectId}
                />
              ))}
            </View>
          </ScrollView>
        </View>
      ) : null}

      <View style={styles.body}>
        {activeRole === 'player' ? (
          <>
            <View style={styles.subNav}>
              <Chip label="Главная" selected={playerTab === 'home'} onPress={() => setPlayerTab('home')} />
              <Chip label="Игры" selected={playerTab === 'games'} onPress={() => setPlayerTab('games')} />
              <Chip label="Моя команда" selected={playerTab === 'team'} onPress={() => setPlayerTab('team')} />
              <Chip label="Деньги" selected={playerTab === 'wallet'} onPress={() => setPlayerTab('wallet')} />
            </View>
            {playerTab === 'home' ? (
              <PlayerHomeScreen
                ownMembership={capabilities.ownMembership}
                activeProjectId={activeProjectId}
                activeGame={activeGame}
                onStartGame={startGame}
                onEndGame={endGame}
                onGoToGames={() => setPlayerTab('games')}
                onOpenGame={openGame}
              />
            ) : null}
            {playerTab === 'games' ? (
              <PlayerGamesScreen
                ownMembership={capabilities.ownMembership}
                activeProjectId={activeProjectId}
                onOpenGame={openGame}
              />
            ) : null}
            {playerTab === 'team' ? (
              <PlayerTeamScreen ownMembership={capabilities.ownMembership} activeProjectId={activeProjectId} />
            ) : null}
            {playerTab === 'wallet' ? <WalletScreen projectId={economyProjectId} /> : null}
          </>
        ) : null}

        {activeRole === 'organizer' ? (
          <>
            <View style={styles.subNav}>
              <Chip label="Обзор" selected={organizerTab === 'overview'} onPress={() => setOrganizerTab('overview')} />
              <Chip label="Игры" selected={organizerTab === 'games'} onPress={() => setOrganizerTab('games')} />
              <Chip label="Экономика проекта" selected={organizerTab === 'economy'} onPress={() => setOrganizerTab('economy')} />
            </View>
            {organizerTab === 'overview' || organizerTab === 'games' ? (
              <OrganizerScreen view={organizerTab} activeProjectId={activeProjectId} />
            ) : null}
            {organizerTab === 'economy' ? <TeamsScreen projectId={economyProjectId} /> : null}
          </>
        ) : null}

        {activeRole === 'teamCommander' ? (
          <TeamCommanderScreen
            teams={capabilities.commandedTeams}
            projectId={economyProjectId}
            activeProjectId={activeProjectId}
          />
        ) : null}
        {activeRole === 'sideCommander' ? <SideCommanderScreen sides={projectSides} /> : null}
        {activeRole === 'trader' ? (
          <TraderScreen traderGames={capabilities.traderGames} activeProjectId={activeProjectId} />
        ) : null}
        {activeRole === 'admin' ? (
          <AdminScreen activeProjectId={economyProjectId} onProjectsChanged={loadProjects} />
        ) : null}
      </View>

      <HelpScreen visible={helpVisible} onClose={() => setHelpVisible(false)} onReplayOnboarding={replayOnboarding} />
      <OnboardingCarousel role={onboardingRole} onClose={closeOnboarding} />
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
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 1,
  },
  brandGlyph: {
    width: 26,
    height: 26,
    borderRadius: 7,
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: colors.accentBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandGlyphIcon: {
    fontSize: 12,
  },
  brandName: {
    fontFamily: font.heading,
    fontSize: 15,
    color: colors.text,
    flexShrink: 1,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flexShrink: 0,
  },
  notificationSlot: {
    padding: 2,
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
  avatarErrorBanner: {
    paddingHorizontal: 18,
    paddingVertical: 8,
    backgroundColor: colors.overlayStrong,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
  },
  avatarErrorText: {
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
  chips: {
    flexDirection: 'row',
    gap: 8,
  },
  subNav: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  body: {
    flex: 1,
  },
});
