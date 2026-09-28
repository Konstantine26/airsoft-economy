import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useCapabilities } from '../hooks/useCapabilities';
import { Avatar } from './Avatar';
import { BottomTabBar, type BottomTabItem } from './BottomTabBar';
import { ContextSheet, projectInitials } from './ContextSheet';
import { MoreScreen, type MoreItem } from './MoreScreen';
import { ScreenHeader } from './ScreenHeader';
import { AdminScreen, type AdminTab } from './AdminScreen';
import { AdminMigrationsTab } from './AdminMigrationsTab';
import { OrganizerScreen } from './OrganizerScreen';
import { TeamCommanderScreen, type TeamCommanderTab } from './TeamCommanderScreen';
import { SideCommanderScreen, type SideCommanderTab } from './SideCommanderScreen';
import { PlayerHomeScreen } from './PlayerHomeScreen';
import { InGameScreen } from './InGameScreen';
import { GameCardScreen } from './GameCardScreen';
import { TasksSection } from './TasksSection';
import { LiveStrip } from './LiveStrip';
import { PlayerGamesScreen } from './PlayerGamesScreen';
import { PlayerTeamScreen } from './PlayerTeamScreen';
import { PlayerStatsScreen } from './PlayerStatsScreen';
import { TeamsScreen } from './TeamsScreen';
import { TraderScreen } from './TraderScreen';
import { WalletScreen } from './WalletScreen';
import { HelpScreen } from './HelpScreen';
import { NotificationsScreen } from './NotificationsScreen';
import { ProfileScreen } from './ProfileScreen';
import { OnboardingCarousel } from './OnboardingCarousel';
import { colors, font, radii, sizes, spacing } from '../lib/theme';
import { ROLE_META, type RoleKey } from '../lib/roles';
import { hasSeenOnboarding, markOnboardingSeen } from '../lib/onboardingStorage';
import { confirmAsync } from '../lib/confirm';
import { hapticHeavy, hapticWarning } from '../lib/haptics';
import { useSunMode } from '../lib/sunMode';
import { getActiveGame, setActiveGame as persistActiveGame, clearActiveGame as persistClearActiveGame, type ActiveGame } from '../lib/activeGameStorage';
import type { Project } from '../lib/database.types';

// Outside a game the player plans; inside one the tab bar switches to what
// matters on the field. Wallet and "Ещё" exist in both sets.
type PlayerTab = 'home' | 'games' | 'team' | 'wallet' | 'game' | 'tasks' | 'briefing';
type OrganizerTab = 'overview' | 'games' | 'economy';
type TraderTab = 'trade';
type MoreTab = 'more';
type AnyTab = PlayerTab | OrganizerTab | TeamCommanderTab | SideCommanderTab | TraderTab | AdminTab | MoreTab;

// Pages reached from "Ещё" that open inside the More tab, with a back
// button, instead of taking a slot in the tab bar.
type MoreSubpage = 'stats' | 'migrations';

const MORE: BottomTabItem<MoreTab> = { key: 'more', label: 'Ещё', icon: 'dots-horizontal' };

const TABS: { [R in RoleKey]: BottomTabItem<AnyTab>[] } = {
  player: [
    { key: 'home', label: 'Главная', icon: 'home-outline', activeIcon: 'home' },
    { key: 'games', label: 'Игры', icon: 'calendar-month-outline', activeIcon: 'calendar-month' },
    { key: 'team', label: 'Команда', icon: 'account-group-outline', activeIcon: 'account-group' },
    { key: 'wallet', label: 'Кошелёк', icon: 'wallet-outline', activeIcon: 'wallet' },
    MORE,
  ],
  organizer: [
    { key: 'overview', label: 'Обзор', icon: 'view-dashboard-outline', activeIcon: 'view-dashboard' },
    { key: 'games', label: 'Игры', icon: 'calendar-month-outline', activeIcon: 'calendar-month' },
    { key: 'economy', label: 'Экономика', icon: 'cash-multiple' },
    MORE,
  ],
  teamCommander: [
    { key: 'team', label: 'Команда', icon: 'account-group-outline', activeIcon: 'account-group' },
    { key: 'requests', label: 'Заявки', icon: 'account-plus-outline', activeIcon: 'account-plus' },
    { key: 'games', label: 'Игры', icon: 'calendar-month-outline', activeIcon: 'calendar-month' },
    { key: 'budget', label: 'Бюджет', icon: 'wallet-outline', activeIcon: 'wallet' },
    MORE,
  ],
  sideCommander: [
    { key: 'side', label: 'Сторона', icon: 'flag-outline', activeIcon: 'flag' },
    { key: 'teams', label: 'Команды', icon: 'account-multiple-outline', activeIcon: 'account-multiple' },
    { key: 'tasks', label: 'Задания', icon: 'clipboard-list-outline', activeIcon: 'clipboard-list' },
    MORE,
  ],
  trader: [{ key: 'trade', label: 'Торговля', icon: 'storefront-outline', activeIcon: 'storefront' }, MORE],
  admin: [
    { key: 'projects', label: 'Проекты', icon: 'folder-outline', activeIcon: 'folder' },
    { key: 'users', label: 'Люди', icon: 'account-multiple-outline', activeIcon: 'account-multiple' },
    { key: 'teams', label: 'Команды', icon: 'account-group-outline', activeIcon: 'account-group' },
    { key: 'clubs', label: 'Клубы', icon: 'office-building-outline', activeIcon: 'office-building' },
    MORE,
  ],
};

const PLAYER_GAME_TABS: BottomTabItem<AnyTab>[] = [
  { key: 'game', label: 'Игра', icon: 'crosshairs-gps' },
  { key: 'tasks', label: 'Задания', icon: 'clipboard-text-outline', activeIcon: 'clipboard-text' },
  { key: 'wallet', label: 'Кошелёк', icon: 'wallet-outline', activeIcon: 'wallet' },
  { key: 'briefing', label: 'Брифинг', icon: 'map-outline', activeIcon: 'map' },
  MORE,
];

const playerTabsFor = (inGame: boolean) => (inGame ? PLAYER_GAME_TABS : TABS.player);

const INITIAL_TABS: Record<RoleKey, AnyTab> = {
  player: 'home',
  organizer: 'overview',
  teamCommander: 'team',
  sideCommander: 'side',
  trader: 'trade',
  admin: 'projects',
};

export function Dashboard() {
  const { profile } = useAuth();
  const capabilities = useCapabilities();
  const { sun, palette } = useSunMode();
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [activeRole, setActiveRole] = useState<RoleKey | null>(null);
  // Each role remembers its own tab, so switching roles and back lands
  // where you left off.
  const [tabs, setTabs] = useState<Record<RoleKey, AnyTab>>(INITIAL_TABS);
  // Panes are mounted on first visit and then kept (hidden) so scroll
  // position, typed search and loaded lists survive tab switches.
  const [visited, setVisited] = useState<Set<string>>(() => new Set());
  const [moreSubpage, setMoreSubpage] = useState<MoreSubpage | null>(null);
  const [contextVisible, setContextVisible] = useState(false);
  const [helpVisible, setHelpVisible] = useState(false);
  const [profileVisible, setProfileVisible] = useState(false);
  const [notificationsVisible, setNotificationsVisible] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [joinRequestCount, setJoinRequestCount] = useState(0);
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
      if (cancelled) return;
      setActiveGame(game);
      // Restoring from local storage (app relaunch, or resuming a session
      // that started before this device last synced) never used to touch
      // the server -- active_game_id was only written inside startGame()
      // itself. Re-assert it here too so a stale/never-synced row doesn't
      // leave the organizer's "в игре" badge permanently wrong.
      supabase.from('profiles').update({ active_game_id: game?.gameId ?? null }).eq('id', profile.id);
    });
    return () => {
      cancelled = true;
    };
  }, [profile]);

  useEffect(() => {
    if (activeGame) setActiveProjectId(activeGame.projectId);
  }, [activeGame]);

  // A game restored from storage on launch (or ended elsewhere) must land
  // on a tab that exists in the matching tab set.
  useEffect(() => {
    const allowed = playerTabsFor(!!activeGame).map((t) => t.key);
    setTabs((prev) =>
      allowed.includes(prev.player) ? prev : { ...prev, player: activeGame ? 'game' : 'home' }
    );
  }, [activeGame]);

  const startGame = useCallback(
    (game: { id: string; project_id: string }) => {
      if (!profile) return;
      const next: ActiveGame = { gameId: game.id, projectId: game.project_id };
      hapticHeavy();
      setActiveGame(next);
      setTabs((prev) => ({ ...prev, player: 'game' }));
      persistActiveGame(profile.id, next);
      // Best-effort: lets the organizer see who has checked in
      // (GameManageScreen). The local state above is the source of truth
      // for resuming on this device, so a failure here isn't surfaced.
      supabase.from('profiles').update({ active_game_id: game.id }).eq('id', profile.id);
    },
    [profile]
  );

  const endGame = useCallback(() => {
    if (!profile) return;
    setActiveGame(null);
    setTabs((prev) => ({ ...prev, player: 'home' }));
    supabase.from('profiles').update({ active_game_id: null }).eq('id', profile.id);
    persistClearActiveGame(profile.id);
  }, [profile]);

  const confirmEndGame = useCallback(async () => {
    const ok = await confirmAsync(
      'Окончить игру?',
      'Экран вернётся в обычный режим, и снова можно будет выбрать другой проект.',
      'Окончить'
    );
    if (!ok) return;
    hapticWarning();
    endGame();
  }, [endGame]);

  const loadProjects = useCallback(async () => {
    const { data } = await supabase.from('projects').select('*').order('name', { ascending: true });
    const rows = data ?? [];
    setProjects(rows);
    setActiveProjectId((prev) => (prev && rows.some((p) => p.id === prev) ? prev : (rows[0]?.id ?? null)));
  }, []);

  const loadUnreadCount = useCallback(async () => {
    if (!profile) return;
    const { count } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .is('read_at', null);
    setUnreadCount(count ?? 0);
  }, [profile]);

  useEffect(() => {
    loadUnreadCount();
  }, [loadUnreadCount]);

  const closeNotifications = useCallback(() => {
    setNotificationsVisible(false);
    loadUnreadCount();
  }, [loadUnreadCount]);

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

  const activeTab = activeRole ? tabs[activeRole] : null;

  useEffect(() => {
    if (!activeRole || !activeTab) return;
    const key = paneKey(activeRole, activeTab);
    setVisited((prev) => (prev.has(key) ? prev : new Set(prev).add(key)));
  }, [activeRole, activeTab]);

  const selectTab = useCallback(
    (tab: AnyTab) => {
      if (!activeRole) return;
      // Tapping "Ещё" again pops back to its root, like a native tab bar.
      if (tab === 'more' && tabs[activeRole] === 'more') setMoreSubpage(null);
      setTabs((prev) => ({ ...prev, [activeRole]: tab }));
    },
    [activeRole, tabs]
  );

  const selectRole = useCallback((role: RoleKey) => {
    setActiveRole(role);
    setMoreSubpage(null);
  }, []);

  const activeProject = useMemo(() => projects.find((p) => p.id === activeProjectId) ?? null, [projects, activeProjectId]);
  const economyProjectId = activeProject?.economy_enabled ? activeProjectId : null;

  const projectSides = useMemo(
    () => capabilities.commandedSides.filter((s) => s.project_id === activeProjectId),
    [capabilities.commandedSides, activeProjectId]
  );

  if (!profile || capabilities.loading || !activeRole || !activeTab) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  const inGame = !!activeGame;
  const baseTabs = activeRole === 'player' ? playerTabsFor(inGame) : TABS[activeRole];
  const tabItems = baseTabs.map((item) =>
    activeRole === 'teamCommander' && item.key === 'requests' ? { ...item, badge: joinRequestCount } : item
  );
  const canSwitchContext = availableRoles.length > 1 || projects.length > 1;

  const moreItems: MoreItem[] = [];
  if (activeRole === 'player' && inGame) {
    moreItems.push({
      key: 'end-game',
      label: 'Окончить игру',
      icon: 'flag-checkered',
      subtitle: 'Вернуться в обычный режим',
      onPress: confirmEndGame,
    });
  }
  if (activeRole === 'player') {
    moreItems.push({
      key: 'stats',
      label: 'Статистика',
      icon: 'chart-box-outline',
      subtitle: 'Игры, задания, доходы и расходы',
      onPress: () => setMoreSubpage('stats'),
    });
  }
  if (activeRole === 'admin') {
    moreItems.push({
      key: 'migrations',
      label: 'Миграции',
      icon: 'database-cog-outline',
      subtitle: 'Какие supabase/*.sql применены на сервере',
      onPress: () => setMoreSubpage('migrations'),
    });
  }

  const showPane = (role: RoleKey, tab: AnyTab) => visited.has(paneKey(role, tab)) || (role === activeRole && tab === activeTab);
  const isActive = (role: RoleKey, tab?: AnyTab) =>
    role === activeRole && (tab === undefined ? activeTab !== 'more' : activeTab === tab);

  // "Солнце" lightens the whole chrome, but only on the game tab -- the
  // other tabs are still dark screens, and a light frame around them
  // would look broken.
  const sunChrome = sun && inGame && activeRole === 'player' && activeTab === 'game' ? palette : null;

  return (
    <View style={[styles.container, sunChrome && { backgroundColor: sunChrome.bg }]}>
      <View style={styles.header}>
        <Pressable
          onPress={() => setContextVisible(true)}
          disabled={!canSwitchContext}
          style={({ pressed }) => [
            styles.contextPill,
            sunChrome && { backgroundColor: sunChrome.card, borderColor: sunChrome.border },
            pressed && styles.pressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel={`${activeProject?.name ?? 'Без проекта'}, ${ROLE_META[activeRole].label}. Сменить проект или роль`}
        >
          <View style={styles.contextMark}>
            {activeProject ? (
              <Text style={styles.contextMarkText}>{projectInitials(activeProject.name)}</Text>
            ) : (
              <MaterialCommunityIcons name="sword-cross" size={15} color={colors.accent} />
            )}
          </View>
          <View style={styles.contextText}>
            <Text style={[styles.contextTitle, sunChrome && { color: sunChrome.text }]} numberOfLines={1}>
              {activeProject?.name ?? 'Airsoft Economy'}
            </Text>
            <Text style={[styles.contextSubtitle, sunChrome && { color: sunChrome.textMuted }]} numberOfLines={1}>
              {ROLE_META[activeRole].label}
              {activeProject?.archived_at ? ' · архив' : ''}
            </Text>
          </View>
          {canSwitchContext ? <MaterialCommunityIcons name="chevron-down" size={18} color={sunChrome?.textMuted ?? colors.textMuted} /> : null}
        </Pressable>

        <View style={styles.headerRight}>
          <Pressable
            onPress={() => setNotificationsVisible(true)}
            style={styles.iconButton}
            accessibilityRole="button"
            accessibilityLabel={unreadCount > 0 ? `Уведомления, непрочитанных: ${unreadCount}` : 'Уведомления'}
          >
            <MaterialCommunityIcons name="bell-outline" size={23} color={sunChrome?.textMuted ?? colors.textMuted} />
            {unreadCount > 0 ? (
              <View style={styles.notificationDot}>
                <Text style={styles.notificationDotText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
              </View>
            ) : null}
          </Pressable>
          <Pressable
            onPress={() => setProfileVisible(true)}
            style={styles.iconButton}
            accessibilityRole="button"
            accessibilityLabel="Открыть профиль"
          >
            <Avatar uri={profile.avatar_url} name={profile.full_name} size={32} />
          </Pressable>
        </View>
      </View>

      {activeGame ? <LiveStrip gameId={activeGame.gameId} /> : null}

      <View style={styles.body}>
        {/* Player */}
        {showPane('player', 'home') ? (
          <Pane active={isActive('player', 'home')}>
            <PlayerHomeScreen
              ownMembership={capabilities.ownMembership}
              activeProjectId={activeProjectId}
              onStartGame={startGame}
              onGoToGames={() => selectTab('games')}
              onOpenGame={openGame}
            />
          </Pane>
        ) : null}
        {activeGame && showPane('player', 'game') ? (
          <Pane active={isActive('player', 'game')}>
            <InGameScreen
              key={activeGame.gameId}
              gameId={activeGame.gameId}
              ownMembership={capabilities.ownMembership}
              onOpenTasks={() => selectTab('tasks')}
              onOpenBriefing={() => selectTab('briefing')}
            />
          </Pane>
        ) : null}
        {activeGame && showPane('player', 'tasks') ? (
          <Pane active={isActive('player', 'tasks')}>
            <ScrollView key={activeGame.gameId} style={styles.scroll} contentContainerStyle={styles.scrollContent}>
              <Text style={styles.screenTitle}>Задания</Text>
              <TasksSection gameId={activeGame.gameId} splitClaimable />
            </ScrollView>
          </Pane>
        ) : null}
        {activeGame && showPane('player', 'briefing') ? (
          <Pane active={isActive('player', 'briefing')}>
            <GameCardScreen
              key={activeGame.gameId}
              gameId={activeGame.gameId}
              ownMembership={capabilities.ownMembership}
              showRegistration={false}
            />
          </Pane>
        ) : null}
        {showPane('player', 'games') ? (
          <Pane active={isActive('player', 'games')}>
            <PlayerGamesScreen ownMembership={capabilities.ownMembership} activeProjectId={activeProjectId} onOpenGame={openGame} />
          </Pane>
        ) : null}
        {showPane('player', 'team') ? (
          <Pane active={isActive('player', 'team')}>
            <PlayerTeamScreen ownMembership={capabilities.ownMembership} activeProjectId={activeProjectId} />
          </Pane>
        ) : null}
        {showPane('player', 'wallet') ? (
          <Pane active={isActive('player', 'wallet')}>
            <WalletScreen projectId={economyProjectId} />
          </Pane>
        ) : null}

        {/* Organizer */}
        {showPane('organizer', 'overview') ? (
          <Pane active={isActive('organizer', 'overview')}>
            <OrganizerScreen view="overview" activeProjectId={activeProjectId} />
          </Pane>
        ) : null}
        {showPane('organizer', 'games') ? (
          <Pane active={isActive('organizer', 'games')}>
            <OrganizerScreen view="games" activeProjectId={activeProjectId} />
          </Pane>
        ) : null}
        {showPane('organizer', 'economy') ? (
          <Pane active={isActive('organizer', 'economy')}>
            <TeamsScreen projectId={economyProjectId} />
          </Pane>
        ) : null}

        {/* Roles with one screen that switches its own sections */}
        {availableRoles.includes('teamCommander') && hasVisitedRole(visited, 'teamCommander', activeRole) ? (
          <Pane active={isActive('teamCommander')}>
            <TeamCommanderScreen
              tab={tabs.teamCommander as TeamCommanderTab}
              teams={capabilities.commandedTeams}
              projectId={economyProjectId}
              activeProjectId={activeProjectId}
              onTeamDisbanded={capabilities.refresh}
              onRequestCountChange={setJoinRequestCount}
            />
          </Pane>
        ) : null}
        {availableRoles.includes('sideCommander') && hasVisitedRole(visited, 'sideCommander', activeRole) ? (
          <Pane active={isActive('sideCommander')}>
            <SideCommanderScreen key={activeProjectId ?? 'none'} tab={tabs.sideCommander as SideCommanderTab} sides={projectSides} />
          </Pane>
        ) : null}
        {showPane('trader', 'trade') ? (
          <Pane active={isActive('trader', 'trade')}>
            <TraderScreen traderGames={capabilities.traderGames} activeProjectId={activeProjectId} />
          </Pane>
        ) : null}
        {availableRoles.includes('admin') && hasVisitedRole(visited, 'admin', activeRole) ? (
          <Pane active={isActive('admin')}>
            <AdminScreen tab={tabs.admin as AdminTab} activeProjectId={economyProjectId} onProjectsChanged={loadProjects} />
          </Pane>
        ) : null}

        {/* Ещё -- shared by every role, rebuilt per role (its items differ) */}
        {activeTab === 'more' ? (
          <Pane active>
            {moreSubpage === 'stats' ? (
              <View style={styles.subpage}>
                <ScreenHeader title="Статистика" backLabel="Ещё" onBack={() => setMoreSubpage(null)} />
                <PlayerStatsScreen activeProjectId={activeProjectId} economyProjectId={economyProjectId} />
              </View>
            ) : moreSubpage === 'migrations' ? (
              <View style={styles.subpage}>
                <ScreenHeader title="Миграции" backLabel="Ещё" onBack={() => setMoreSubpage(null)} />
                <AdminMigrationsTab />
              </View>
            ) : (
              <MoreScreen
                roleItems={moreItems}
                unreadCount={unreadCount}
                inGame={inGame}
                onOpenProfile={() => setProfileVisible(true)}
                onOpenNotifications={() => setNotificationsVisible(true)}
                onOpenHelp={() => setHelpVisible(true)}
              />
            )}
          </Pane>
        ) : null}
      </View>

      <BottomTabBar
        items={tabItems}
        activeKey={activeTab}
        onChange={selectTab}
        tint={inGame && activeRole === 'player' ? palette.live : colors.accent}
        surface={sunChrome ? { bg: sunChrome.card, border: sunChrome.border, inactive: sunChrome.textDim } : undefined}
      />

      <ContextSheet
        visible={contextVisible}
        onClose={() => setContextVisible(false)}
        projects={projects}
        activeProjectId={activeProjectId}
        onSelectProject={setActiveProjectId}
        roles={availableRoles}
        activeRole={activeRole}
        onSelectRole={selectRole}
        lockedToProjectId={activeGame?.projectId ?? null}
      />
      <HelpScreen visible={helpVisible} onClose={() => setHelpVisible(false)} onReplayOnboarding={replayOnboarding} />
      <NotificationsScreen visible={notificationsVisible} onClose={closeNotifications} />
      <ProfileScreen visible={profileVisible} onClose={() => setProfileVisible(false)} />
      <OnboardingCarousel role={onboardingRole} onClose={closeOnboarding} />
    </View>
  );
}

function paneKey(role: RoleKey, tab: AnyTab) {
  return `${role}:${tab}`;
}

function hasVisitedRole(visited: Set<string>, role: RoleKey, activeRole: RoleKey) {
  if (role === activeRole) return true;
  for (const key of visited) if (key.startsWith(`${role}:`)) return true;
  return false;
}

// Keeps a visited tab mounted but out of layout, so coming back to it is
// instant and doesn't lose scroll position or half-typed input.
function Pane({ active, children }: { active: boolean; children: React.ReactNode }) {
  return <View style={[styles.pane, !active && styles.paneHidden]}>{children}</View>;
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
    alignItems: 'center',
    gap: spacing.sm,
    paddingLeft: spacing.md,
    paddingRight: spacing.xs,
    paddingVertical: 6,
  },
  pressed: {
    opacity: 0.7,
  },
  contextPill: {
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: sizes.hitMin,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radii.md,
    paddingLeft: 5,
    paddingRight: spacing.sm + 2,
    paddingVertical: 5,
  },
  contextMark: {
    width: 32,
    height: 32,
    borderRadius: radii.sm,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contextMarkText: {
    fontFamily: font.bodyBold,
    fontSize: 13,
    color: colors.accent,
  },
  contextText: {
    flexShrink: 1,
  },
  contextTitle: {
    fontFamily: font.bodySemiBold,
    fontSize: 14.5,
    color: colors.text,
  },
  contextSubtitle: {
    fontFamily: font.body,
    fontSize: 12,
    color: colors.textMuted,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 'auto',
  },
  iconButton: {
    width: sizes.hitMin,
    height: sizes.hitMin,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notificationDot: {
    position: 'absolute',
    top: 6,
    right: 4,
    minWidth: 17,
    height: 17,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: colors.bg,
    paddingHorizontal: 3,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notificationDotText: {
    fontFamily: font.bodyBold,
    fontSize: 9,
    color: colors.text,
  },
  body: {
    flex: 1,
  },
  pane: {
    flex: 1,
  },
  paneHidden: {
    display: 'none',
  },
  subpage: {
    flex: 1,
  },
  scroll: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  scrollContent: {
    padding: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  screenTitle: {
    fontFamily: font.heading,
    fontSize: 26,
    lineHeight: 32,
    color: colors.text,
    marginBottom: spacing.md,
  },
});
