import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { AdminUsersTab } from './AdminUsersTab';
import { AdminTeamsTab } from './AdminTeamsTab';
import { AdminProjectsTab } from './AdminProjectsTab';
import { AdminClubsTab } from './AdminClubsTab';
import { AdminMigrationsTab } from './AdminMigrationsTab';
import { PolygonsScreen } from './PolygonsScreen';
import { Segmented, type SegmentedItem } from './Segmented';
import { colors, spacing } from '../lib/theme';

export type AdminTab = 'projects' | 'users' | 'teams' | 'clubs' | 'migrations';
type ProjectsSubTab = 'projects' | 'polygons';

const PROJECTS_SEGMENTS: SegmentedItem<ProjectsSubTab>[] = [
  { key: 'projects', label: 'Проекты и игры' },
  { key: 'polygons', label: 'Полигоны' },
];

type Props = {
  // Picked from the app's bottom tab bar ("Миграции" lives under "Ещё").
  tab: AdminTab;
  activeProjectId: string | null;
  onProjectsChanged: () => void;
};

export function AdminScreen({ tab, activeProjectId, onProjectsChanged }: Props) {
  const [projectsSubTab, setProjectsSubTab] = useState<ProjectsSubTab>('projects');

  return (
    <View style={styles.container}>
      {tab === 'projects' ? (
        <Segmented items={PROJECTS_SEGMENTS} value={projectsSubTab} onChange={setProjectsSubTab} style={styles.segmented} />
      ) : null}

      <View style={styles.body}>
        {tab === 'users' ? <AdminUsersTab activeProjectId={activeProjectId} /> : null}
        {tab === 'teams' ? <AdminTeamsTab activeProjectId={activeProjectId} /> : null}
        {tab === 'projects' && projectsSubTab === 'projects' ? (
          <AdminProjectsTab onProjectsChanged={onProjectsChanged} />
        ) : null}
        {tab === 'projects' && projectsSubTab === 'polygons' ? <PolygonsScreen /> : null}
        {tab === 'clubs' ? <AdminClubsTab /> : null}
        {tab === 'migrations' ? <AdminMigrationsTab /> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  segmented: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
  },
  body: {
    flex: 1,
  },
});
