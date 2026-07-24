import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { useCapabilities } from '../hooks/useCapabilities';
import { AdminScreen } from './AdminScreen';
import { OrganizerScreen } from './OrganizerScreen';
import { TeamCommanderScreen } from './TeamCommanderScreen';
import { SideCommanderScreen } from './SideCommanderScreen';
import { ParticipantScreen } from './ParticipantScreen';
import { TeamsScreen } from './TeamsScreen';

type TabKey = 'home' | 'economy' | 'team' | 'side' | 'organizer' | 'admin';

export function Dashboard() {
  const { profile, signOut } = useAuth();
  const capabilities = useCapabilities();
  const [tab, setTab] = useState<TabKey>('home');

  const tabs = useMemo(() => {
    const list: { key: TabKey; label: string }[] = [{ key: 'home', label: 'Главная' }];
    list.push({ key: 'economy', label: 'Экономика' });
    if (capabilities.commandedTeams.length > 0) list.push({ key: 'team', label: 'Моя команда' });
    if (capabilities.commandedSides.length > 0) list.push({ key: 'side', label: 'Моя сторона' });
    if (profile?.role === 'organizer' || profile?.role === 'admin') {
      list.push({ key: 'organizer', label: 'Организатор' });
    }
    if (profile?.role === 'admin') list.push({ key: 'admin', label: 'Админ' });
    return list;
  }, [capabilities.commandedTeams, capabilities.commandedSides, profile]);

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
        {tab === 'home' ? <ParticipantScreen ownMembership={capabilities.ownMembership} /> : null}
        {tab === 'economy' ? <TeamsScreen /> : null}
        {tab === 'team' ? <TeamCommanderScreen teams={capabilities.commandedTeams} /> : null}
        {tab === 'side' ? <SideCommanderScreen sides={capabilities.commandedSides} /> : null}
        {tab === 'organizer' ? <OrganizerScreen /> : null}
        {tab === 'admin' ? <AdminScreen /> : null}
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
  body: {
    flex: 1,
  },
});
