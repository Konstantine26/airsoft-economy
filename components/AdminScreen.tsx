import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AdminUsersTab } from './AdminUsersTab';
import { AdminTeamsTab } from './AdminTeamsTab';
import { AdminProjectsTab } from './AdminProjectsTab';
import { AdminMigrationsTab } from './AdminMigrationsTab';
import { PolygonsScreen } from './PolygonsScreen';
import { Card } from './Card';
import { Chip } from './Chip';
import { colors, font, spacing } from '../lib/theme';

type SubTabKey = 'home' | 'users' | 'teams' | 'projects' | 'migrations';
type ProjectsSubTab = 'projects' | 'polygons';

const HOME_CARDS: { key: SubTabKey; label: string; description: string }[] = [
  { key: 'users', label: 'Пользователи', description: 'Роли и балансы участников' },
  { key: 'teams', label: 'Команды', description: 'Список команд, командиры, балансы' },
  { key: 'projects', label: 'Проекты и игры', description: 'Проекты, организаторы, игры, полигоны' },
  { key: 'migrations', label: 'Миграции', description: 'Какие supabase/*.sql применены на этом сервере' },
];

type Props = {
  activeProjectId: string | null;
  onProjectsChanged: () => void;
};

export function AdminScreen({ activeProjectId, onProjectsChanged }: Props) {
  const [tab, setTab] = useState<SubTabKey>('home');
  const [projectsSubTab, setProjectsSubTab] = useState<ProjectsSubTab>('projects');

  if (tab === 'home') {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.homeContent}>
        <View style={styles.cardsList}>
          {HOME_CARDS.map((c) => (
            <Pressable key={c.key} onPress={() => setTab(c.key)}>
              <Card>
                <Text style={styles.cardTitle}>{c.label}</Text>
                <Text style={styles.cardDescription}>{c.description}</Text>
              </Card>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    );
  }

  return (
    <View style={styles.container}>
      <Pressable onPress={() => setTab('home')}>
        <Text style={styles.back}>‹ Админ</Text>
      </Pressable>

      {tab === 'projects' ? (
        <View style={styles.subNav}>
          <Chip label="Проекты" selected={projectsSubTab === 'projects'} onPress={() => setProjectsSubTab('projects')} />
          <Chip label="Полигоны" selected={projectsSubTab === 'polygons'} onPress={() => setProjectsSubTab('polygons')} />
        </View>
      ) : null}

      <View style={styles.body}>
        {tab === 'users' ? <AdminUsersTab activeProjectId={activeProjectId} /> : null}
        {tab === 'teams' ? <AdminTeamsTab activeProjectId={activeProjectId} /> : null}
        {tab === 'projects' && projectsSubTab === 'projects' ? (
          <AdminProjectsTab onProjectsChanged={onProjectsChanged} />
        ) : null}
        {tab === 'projects' && projectsSubTab === 'polygons' ? <PolygonsScreen /> : null}
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
  homeContent: {
    padding: spacing.lg,
  },
  cardsList: {
    gap: 10,
  },
  cardTitle: {
    fontFamily: font.bodyBold,
    fontSize: 16,
    color: colors.text,
  },
  cardDescription: {
    fontFamily: font.body,
    fontSize: 12.5,
    color: colors.textMuted,
    marginTop: 4,
  },
  back: {
    fontFamily: font.body,
    color: colors.textMuted,
    padding: spacing.lg,
    paddingBottom: 0,
  },
  subNav: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  body: {
    flex: 1,
  },
});
