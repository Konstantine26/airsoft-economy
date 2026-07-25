import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { AdminUsersTab } from './AdminUsersTab';
import { AdminTeamsTab } from './AdminTeamsTab';
import { AdminProjectsTab } from './AdminProjectsTab';
import { PolygonsScreen } from './PolygonsScreen';

type SubTabKey = 'users' | 'teams' | 'polygons' | 'projects';

const SUB_TABS: { key: SubTabKey; label: string }[] = [
  { key: 'users', label: 'Пользователи' },
  { key: 'teams', label: 'Команды' },
  { key: 'polygons', label: 'Полигоны' },
  { key: 'projects', label: 'Проекты и игры' },
];

export function AdminScreen() {
  const [tab, setTab] = useState<SubTabKey>('users');

  return (
    <View style={styles.container}>
      <View style={styles.tabBar}>
        {SUB_TABS.map((t) => (
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
        {tab === 'users' ? <AdminUsersTab /> : null}
        {tab === 'teams' ? <AdminTeamsTab /> : null}
        {tab === 'polygons' ? <PolygonsScreen /> : null}
        {tab === 'projects' ? <AdminProjectsTab /> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
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
