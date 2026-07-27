import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { AdminUsersTab } from './AdminUsersTab';
import { AdminTeamsTab } from './AdminTeamsTab';
import { AdminProjectsTab } from './AdminProjectsTab';
import { PolygonsScreen } from './PolygonsScreen';
import { Chip } from './Chip';
import { colors, spacing } from '../lib/theme';

type SubTabKey = 'users' | 'teams' | 'polygons' | 'projects';

const SUB_TABS: { key: SubTabKey; label: string }[] = [
  { key: 'users', label: 'Пользователи' },
  { key: 'teams', label: 'Команды' },
  { key: 'polygons', label: 'Полигоны' },
  { key: 'projects', label: 'Проекты и игры' },
];

type Props = {
  activeProjectId: string | null;
  onProjectsChanged: () => void;
};

export function AdminScreen({ activeProjectId, onProjectsChanged }: Props) {
  const [tab, setTab] = useState<SubTabKey>('users');

  return (
    <View style={styles.container}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabBar} contentContainerStyle={styles.tabBarContent}>
        {SUB_TABS.map((t) => (
          <Chip key={t.key} label={t.label} selected={tab === t.key} onPress={() => setTab(t.key)} />
        ))}
      </ScrollView>

      <View style={styles.body}>
        {tab === 'users' ? <AdminUsersTab activeProjectId={activeProjectId} /> : null}
        {tab === 'teams' ? <AdminTeamsTab activeProjectId={activeProjectId} /> : null}
        {tab === 'polygons' ? <PolygonsScreen /> : null}
        {tab === 'projects' ? <AdminProjectsTab onProjectsChanged={onProjectsChanged} /> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  tabBar: {
    flexGrow: 0,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
  },
  tabBarContent: {
    flexDirection: 'row',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: 8,
  },
  body: {
    flex: 1,
  },
});
