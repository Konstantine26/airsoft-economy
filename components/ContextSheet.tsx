import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Banner } from './Banner';
import { ListRow } from './ListRow';
import { Sheet } from './Sheet';
import { ROLE_META, type RoleKey } from '../lib/roles';
import { colors, font, radii, spacing } from '../lib/theme';
import type { Project } from '../lib/database.types';

type Props = {
  visible: boolean;
  onClose: () => void;
  projects: Project[];
  activeProjectId: string | null;
  onSelectProject: (id: string) => void;
  roles: RoleKey[];
  activeRole: RoleKey;
  onSelectRole: (role: RoleKey) => void;
  // Set while a game is running: every other project is locked.
  lockedToProjectId: string | null;
};

// Replaces the old role tabs + project chip row: both are "where am I"
// context, not sections, so they are picked here once instead of taking up
// two rows above every screen.
export function ContextSheet({
  visible,
  onClose,
  projects,
  activeProjectId,
  onSelectProject,
  roles,
  activeRole,
  onSelectRole,
  lockedToProjectId,
}: Props) {
  const sorted = [...projects].sort((a, b) => Number(!!a.archived_at) - Number(!!b.archived_at));

  return (
    <Sheet visible={visible} onRequestClose={onClose} style={styles.sheet}>
      <Text style={styles.title}>Проект и роль</Text>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {lockedToProjectId ? (
          <Banner tone="warning" icon="lock-outline" message="Идёт игра — проект сменить нельзя. Роль переключается свободно." />
        ) : null}

        {projects.length > 0 ? (
          <View>
            <Text style={styles.section}>Проект</Text>
            {sorted.map((project, i) => {
              const locked = !!lockedToProjectId && project.id !== lockedToProjectId;
              return (
                <ListRow
                  key={project.id}
                  title={project.name}
                  subtitle={project.archived_at ? 'В архиве · только просмотр' : project.economy_enabled ? 'Экономика включена' : null}
                  leading={<ProjectMark name={project.name} archived={!!project.archived_at} />}
                  trailing={<Radio selected={project.id === activeProjectId} />}
                  chevron={false}
                  divider={i < sorted.length - 1}
                  disabled={locked}
                  onPress={() => {
                    onSelectProject(project.id);
                    onClose();
                  }}
                />
              );
            })}
          </View>
        ) : null}

        {roles.length > 1 ? (
          <View>
            <Text style={styles.section}>Моя роль</Text>
            {roles.map((role, i) => (
              <ListRow
                key={role}
                title={ROLE_META[role].label}
                leading={
                  <View style={styles.roleIcon}>
                    <MaterialCommunityIcons name={ROLE_META[role].icon} size={18} color={colors.textMuted} />
                  </View>
                }
                trailing={<Radio selected={role === activeRole} />}
                chevron={false}
                divider={i < roles.length - 1}
                onPress={() => {
                  onSelectRole(role);
                  onClose();
                }}
              />
            ))}
          </View>
        ) : null}
      </ScrollView>
    </Sheet>
  );
}

export function projectInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const letters = words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? '?').slice(0, 2);
  return letters.toUpperCase();
}

function ProjectMark({ name, archived }: { name: string; archived: boolean }) {
  if (archived) {
    return (
      <View style={styles.roleIcon}>
        <MaterialCommunityIcons name="archive-outline" size={18} color={colors.textMuted} />
      </View>
    );
  }
  return (
    <View style={[styles.roleIcon, styles.projectMark]}>
      <Text style={styles.projectMarkText}>{projectInitials(name)}</Text>
    </View>
  );
}

function Radio({ selected }: { selected: boolean }) {
  return <View style={[styles.radio, selected && styles.radioOn]} accessibilityState={{ selected }} />;
}

const styles = StyleSheet.create({
  sheet: {
    maxHeight: '85%',
  },
  title: {
    fontFamily: font.heading,
    fontSize: 20,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  content: {
    gap: spacing.lg,
    paddingBottom: spacing.sm,
  },
  section: {
    fontFamily: font.bodySemiBold,
    fontSize: 12,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: colors.textDim,
    marginBottom: 2,
  },
  roleIcon: {
    width: 36,
    height: 36,
    borderRadius: radii.sm + 2,
    backgroundColor: colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  projectMark: {
    backgroundColor: colors.accentSoft,
  },
  projectMarkText: {
    fontFamily: font.bodyBold,
    fontSize: 13,
    color: colors.accent,
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.cardBorder,
  },
  radioOn: {
    borderWidth: 7,
    borderColor: colors.accent,
  },
});
