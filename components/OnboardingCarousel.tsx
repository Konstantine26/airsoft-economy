import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, font, radii, spacing } from '../lib/theme';
import { ROLE_META, type RoleKey } from '../lib/roles';
import { ONBOARDING_SLIDES } from '../lib/onboardingContent';
import { Button } from './Button';

type Props = {
  role: RoleKey | null;
  onClose: () => void;
};

export function OnboardingCarousel({ role, onClose }: Props) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    setIndex(0);
  }, [role]);

  if (!role) return null;

  const slides = ONBOARDING_SLIDES[role];
  const slide = slides[index];
  const isLast = index === slides.length - 1;
  const meta = ROLE_META[role];

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.header}>
            <View style={styles.roleTag}>
              <MaterialCommunityIcons name={meta.icon} size={14} color={colors.accent} />
              <Text style={styles.roleTagText}>Быстрый старт · {meta.label}</Text>
            </View>
            <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Пропустить обучение" hitSlop={8}>
              <Text style={styles.skip}>Пропустить</Text>
            </Pressable>
          </View>

          <View style={styles.dots}>
            {slides.map((_, i) => (
              <Pressable key={i} onPress={() => setIndex(i)} hitSlop={6}>
                <View style={[styles.dot, i === index && styles.dotActive]} />
              </Pressable>
            ))}
          </View>

          <Text style={styles.title}>{slide.title}</Text>
          <View style={styles.bullets}>
            {slide.bullets.map((b, i) => (
              <View key={i} style={styles.bulletRow}>
                <View style={styles.bulletMark} />
                <Text style={styles.bulletText}>{b}</Text>
              </View>
            ))}
          </View>

          <View style={styles.footer}>
            {index > 0 ? (
              <Pressable
                onPress={() => setIndex((i) => Math.max(0, i - 1))}
                accessibilityRole="button"
                accessibilityLabel="Назад"
                style={styles.backBtn}
              >
                <MaterialCommunityIcons name="chevron-left" size={22} color={colors.textMuted} />
              </Pressable>
            ) : (
              <View style={styles.backBtn} />
            )}
            <Button
              title={isLast ? 'Начать' : 'Далее'}
              onPress={() => (isLast ? onClose() : setIndex((i) => i + 1))}
              style={styles.nextBtn}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: colors.overlayStrong,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radii.xl,
    padding: spacing.xl,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  roleTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 1,
  },
  roleTagText: {
    fontFamily: font.bodySemiBold,
    fontSize: 11.5,
    color: colors.accent,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  skip: {
    fontFamily: font.body,
    fontSize: 12.5,
    color: colors.textMuted,
  },
  dots: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: spacing.lg,
  },
  dot: {
    width: 20,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.white10,
  },
  dotActive: {
    backgroundColor: colors.accent,
  },
  title: {
    fontFamily: font.heading,
    fontSize: 22,
    color: colors.text,
    marginBottom: spacing.md,
  },
  bullets: {
    gap: 10,
    marginBottom: spacing.xl,
  },
  bulletRow: {
    flexDirection: 'row',
    gap: 10,
  },
  bulletMark: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.accent,
    marginTop: 7,
    flexShrink: 0,
  },
  bulletText: {
    fontFamily: font.body,
    fontSize: 14.5,
    lineHeight: 21,
    color: colors.text,
    flex: 1,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  backBtn: {
    width: 40,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nextBtn: {
    flex: 1,
  },
});
