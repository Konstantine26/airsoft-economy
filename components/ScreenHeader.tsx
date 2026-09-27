import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, font, sizes, spacing } from '../lib/theme';

type Props = {
  title: string;
  // Label of the screen we came from ("Ещё"), shown next to the chevron like
  // the iOS back button.
  backLabel?: string;
  onBack?: () => void;
  right?: React.ReactNode;
};

export function ScreenHeader({ title, backLabel, onBack, right }: Props) {
  return (
    <View style={styles.wrap}>
      {onBack ? (
        <Pressable
          onPress={onBack}
          style={({ pressed }) => [styles.back, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel={backLabel ? `Назад: ${backLabel}` : 'Назад'}
        >
          <MaterialCommunityIcons name="chevron-left" size={28} color={colors.accent} />
          {backLabel ? <Text style={styles.backLabel}>{backLabel}</Text> : null}
        </Pressable>
      ) : null}
      <View style={styles.titleRow}>
        <Text style={styles.title} numberOfLines={2}>
          {title}
        </Text>
        {right}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
    paddingBottom: spacing.sm,
  },
  back: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    minHeight: sizes.hitMin,
    marginLeft: -10,
    paddingRight: spacing.sm,
  },
  pressed: {
    opacity: 0.6,
  },
  backLabel: {
    fontFamily: font.bodyMedium,
    fontSize: 16,
    color: colors.accent,
    marginLeft: -2,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  title: {
    flex: 1,
    fontFamily: font.heading,
    fontSize: 26,
    lineHeight: 32,
    color: colors.text,
  },
});
