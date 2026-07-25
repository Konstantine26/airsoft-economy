import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useCapabilities } from '../hooks/useCapabilities';
import { AdminScreen } from './AdminScreen';
import { OrganizerScreen } from './OrganizerScreen';
import { TeamCommanderScreen } from './TeamCommanderScreen';
import { SideCommanderScreen } from './SideCommanderScreen';
import { ParticipantScreen } from './ParticipantScreen';
import { TeamsScreen } from './TeamsScreen';
import { WalletScreen } from './WalletScreen';
import type { Project } from '../lib/database.types';

type TabKey = 'home' | 'wallet' | 'economy' | 'team' | 'side' | 'organizer' | 'admin';

export function Dashboard() {
  const { profile, signOut } = useAuth();
  const capabilities = useCapabilities();
  const [tab, setTab] = useState<TabKey>('home');
  const [economyProjects, setEconomyProjects] = useState<Project[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);

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
    list.push({ key: 'wallet', label: 'Кошелёк' });
    const isOrganizerOrAdmin = profile?.role === 'admin' || capabilities.isOrganizer;
    if (isOrganizerOrAdmin) list.push({ key: 'economy', label: 'Экономика' });
    if (capabilities.commandedTeams.length > 0) list.push({ key: 'team', label: 'Моя команда' });
    if (capabilities.commandedSides.length > 0) list.push({ key: 'side', label: 'Моя сторона' });
    if (isOrganizerOrAdmin) list.push({ key: 'organizer', label: 'Организатор' });
    if (profile?.role === 'admin') list.push({ key: 'admin', label: 'Админ' });
    return list;
  }, [capabilities.commandedTeams, capabilities.commandedSides, capabilities.isOrganizer, profile]);

  if (!profile || capabilities.loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerName}>{profile.full_name || 'Без имени'}</Text>
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
                <Pressable
                  key={project.id}
                  style={[styles.chip, activeProjectId === project.id && styles.chipSelected]}
                  onPress={() => setActiveProjectId(project.id)}
                >
                  <Text style={activeProjectId === project.id ? styles.chipTextSelected : styles.chipText}>
                    {project.name}
                  </Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>
        </View>
      ) : null}

      <View style={styles.tabBar}>
        {tabs.map((t) => (
          <Pressable
            key={t.key}
            style={[styles.tab, tab === t.key && styles.tabActive]}
            onPress={() => setTab(t.key)}
          >
            <Text style={tab === t.key ? styles.tabLabelActive : styles.tabLabel}>{t.label}</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.body}>
        {tab === 'home' ? (
          <ParticipantScreen ownMembership={capabilities.ownMembership} activeProjectId={activeProjectId} />
        ) : null}
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
    backgroundColor: '#fff',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#ddd',
  },
  headerName: {
    fontSize: 15,
    fontWeight: '600',
  },
  signOut: {
    color: '#c00',
  },
  projectBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 6,
    gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#ddd',
    backgroundColor: '#fafafa',
  },
  projectBarLabel: {
    fontSize: 12,
    color: '#666',
  },
  tabBar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#ddd',
  },
  tab: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#ccc',
  },
  tabActive: {
    backgroundColor: '#111',
    borderColor: '#111',
  },
  tabLabel: {
    color: '#111',
    fontSize: 13,
  },
  tabLabelActive: {
    color: '#fff',
    fontSize: 13,
  },
  chips: {
    flexDirection: 'row',
    gap: 8,
  },
  chip: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#ccc',
  },
  chipSelected: {
    backgroundColor: '#111',
    borderColor: '#111',
  },
  chipText: {
    color: '#111',
    fontSize: 12,
  },
  chipTextSelected: {
    color: '#fff',
    fontSize: 12,
  },
  body: {
    flex: 1,
  },
});
