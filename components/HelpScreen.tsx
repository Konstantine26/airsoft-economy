import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, font, radii, spacing } from '../lib/theme';
import { ROLE_META, ROLE_ORDER, type RoleKey } from '../lib/roles';
import { GLOSSARY, HELP_SECTIONS, INTRO_PARAGRAPHS } from '../lib/helpContent';
import { Chip } from './Chip';
import { Card } from './Card';
import { Button } from './Button';

type SectionKey = 'intro' | RoleKey | 'glossary';

type Props = {
  visible: boolean;
  onClose: () => void;
  onReplayOnboarding: (role: RoleKey) => void;
};

export function HelpScreen({ visible, onClose, onReplayOnboarding }: Props) {
  const insets = useSafeAreaInsets();
  const [section, setSection] = useState<SectionKey>('intro');

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Справка</Text>
          <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Закрыть справку" hitSlop={8}>
            <MaterialCommunityIcons name="close" size={22} color={colors.textMuted} />
          </Pressable>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.navScroll} contentContainerStyle={styles.nav}>
          <Chip label="Начало" selected={section === 'intro'} onPress={() => setSection('intro')} />
          {ROLE_ORDER.map((role) => (
            <Chip key={role} label={ROLE_META[role].label} selected={section === role} onPress={() => setSection(role)} />
          ))}
          <Chip label="Термины" selected={section === 'glossary'} onPress={() => setSection('glossary')} />
        </ScrollView>

        <ScrollView style={styles.body} contentContainerStyle={[styles.bodyContent, { paddingBottom: 24 + insets.bottom }]}>
          {section === 'intro' ? (
            <>
              <Text style={styles.sectionTitle}>Как устроено приложение</Text>
              {INTRO_PARAGRAPHS.map((p, i) => (
                <Text key={i} style={styles.paragraph}>{p}</Text>
              ))}
            </>
          ) : null}

          {section === 'glossary' ? (
            <>
              <Text style={styles.sectionTitle}>Термины</Text>
              <View style={{ gap: 12 }}>
                {GLOSSARY.map((g) => (
                  <Card key={g.term} soft>
                    <Text style={styles.termTitle}>{g.term}</Text>
                    <Text style={styles.termDesc}>{g.desc}</Text>
                  </Card>
                ))}
              </View>
            </>
          ) : null}

          {section !== 'intro' && section !== 'glossary' ? (
            <RoleSection role={section} onReplayOnboarding={onReplayOnboarding} />
          ) : null}
        </ScrollView>
      </View>
    </Modal>
  );
}

function RoleSection({ role, onReplayOnboarding }: { role: RoleKey; onReplayOnboarding: (role: RoleKey) => void }) {
  const meta = ROLE_META[role];
  const info = HELP_SECTIONS[role];

  return (
    <>
      <View style={styles.roleHead}>
        <View style={styles.roleBadge}>
          <MaterialCommunityIcons name={meta.icon} size={18} color={colors.accent} />
        </View>
        <Text style={styles.sectionTitle}>{meta.label}</Text>
      </View>

      <Text style={styles.grantText}>{info.grantedBy}</Text>

      <Button title="Показать обучение" variant="secondary" onPress={() => onReplayOnboarding(role)} style={{ marginTop: 12, marginBottom: 20 }} />

      <View style={{ gap: 8, marginBottom: 24 }}>
        {info.tabs.map((t) => (
          <Card key={t.name} soft>
            <Text style={styles.tabName}>{t.name}</Text>
            <Text style={styles.tabDesc}>{t.desc}</Text>
          </Card>
        ))}
      </View>

      <Text style={styles.scenariosLabel}>Типичные сценарии</Text>
      <View style={{ gap: 10 }}>
        {info.scenarios.map((s) => (
          <Card key={s.title}>
            <Text style={styles.scenarioTitle}>{s.title}</Text>
            <View style={{ gap: 6, marginTop: 8 }}>
              {s.steps.map((step, i) => (
                <View key={i} style={styles.stepRow}>
                  <Text style={styles.stepNum}>{i + 1}</Text>
                  <Text style={styles.stepText}>{step}</Text>
                </View>
              ))}
            </View>
            {s.note ? <Text style={styles.scenarioNote}>{s.note}</Text> : null}
          </Card>
        ))}
      </View>

      <View style={styles.warningBox}>
        <MaterialCommunityIcons name="alert-outline" size={16} color={colors.crown} />
        <Text style={styles.warningText}>{info.warning}</Text>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
  },
  headerTitle: {
    fontFamily: font.heading,
    fontSize: 18,
    color: colors.text,
  },
  navScroll: {
    flexGrow: 0,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
  },
  nav: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  body: {
    flex: 1,
  },
  bodyContent: {
    padding: spacing.lg,
  },
  sectionTitle: {
    fontFamily: font.heading,
    fontSize: 19,
    color: colors.text,
    marginBottom: 10,
  },
  paragraph: {
    fontFamily: font.body,
    fontSize: 14,
    lineHeight: 21,
    color: colors.textMuted,
    marginBottom: 10,
  },
  roleHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 4,
  },
  roleBadge: {
    width: 32,
    height: 32,
    borderRadius: radii.sm,
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: colors.accentSoftBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  grantText: {
    fontFamily: font.body,
    fontSize: 13,
    lineHeight: 19,
    color: colors.textMuted,
  },
  tabName: {
    fontFamily: font.bodyBold,
    fontSize: 13.5,
    color: colors.accent,
    marginBottom: 3,
  },
  tabDesc: {
    fontFamily: font.body,
    fontSize: 12.5,
    color: colors.textMuted,
  },
  termTitle: {
    fontFamily: font.bodyBold,
    fontSize: 13.5,
    color: colors.text,
    marginBottom: 3,
  },
  termDesc: {
    fontFamily: font.body,
    fontSize: 12.5,
    lineHeight: 18,
    color: colors.textMuted,
  },
  scenariosLabel: {
    fontFamily: font.bodySemiBold,
    fontSize: 11.5,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    color: colors.textDim,
    marginBottom: 10,
  },
  scenarioTitle: {
    fontFamily: font.bodyBold,
    fontSize: 14.5,
    color: colors.text,
  },
  stepRow: {
    flexDirection: 'row',
    gap: 8,
  },
  stepNum: {
    fontFamily: font.bodyBold,
    fontSize: 12,
    color: colors.accent,
    width: 16,
  },
  stepText: {
    fontFamily: font.body,
    fontSize: 13.5,
    lineHeight: 19,
    color: colors.text,
    flex: 1,
  },
  scenarioNote: {
    fontFamily: font.body,
    fontSize: 12,
    lineHeight: 17,
    color: colors.textDim,
    marginTop: 10,
  },
  warningBox: {
    flexDirection: 'row',
    gap: 10,
    padding: 12,
    borderRadius: radii.md,
    backgroundColor: 'rgba(245, 166, 35, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(245, 166, 35, 0.35)',
    marginTop: 20,
  },
  warningText: {
    fontFamily: font.body,
    fontSize: 12.5,
    lineHeight: 18,
    color: colors.crown,
    flex: 1,
  },
});
