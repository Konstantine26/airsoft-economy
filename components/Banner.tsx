import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, font, radii, spacing } from '../lib/theme';

type Tone = 'info' | 'warning' | 'danger';

type Props = {
  message: string;
  tone?: Tone;
  icon?: keyof typeof MaterialCommunityIcons.glyphMap;
  actionLabel?: string;
  onAction?: () => void;
  style?: StyleProp<ViewStyle>;
};

const TONES: Record<Tone, { bg: string; fg: string; icon: keyof typeof MaterialCommunityIcons.glyphMap }> = {
  info: { bg: colors.accentSoft, fg: colors.accent, icon: 'information-outline' },
  warning: { bg: colors.liveSoft, fg: colors.live, icon: 'alert-outline' },
  danger: { bg: colors.dangerSoft, fg: colors.danger, icon: 'alert-circle-outline' },
};

// Inline, persistent notice about the state of the screen: "Нет сети ·
// данные от 14:02", "Проект в архиве". For a one-off result of an action
// use the toast instead.
export function Banner({ message, tone = 'info', icon, actionLabel, onAction, style }: Props) {
  const t = TONES[tone];
  return (
    <View style={[styles.banner, { backgroundColor: t.bg }, style]} accessibilityRole="alert">
      <MaterialCommunityIcons name={icon ?? t.icon} size={18} color={t.fg} />
      <Text style={[styles.message, { color: t.fg }]}>{message}</Text>
      {actionLabel && onAction ? (
        <Pressable onPress={onAction} hitSlop={12} accessibilityRole="button" accessibilityLabel={actionLabel}>
          <Text style={[styles.action, { color: t.fg }]}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radii.md,
    paddingVertical: 10,
    paddingHorizontal: spacing.md,
  },
  message: {
    flex: 1,
    fontFamily: font.bodyMedium,
    fontSize: 13.5,
    lineHeight: 18,
  },
  action: {
    fontFamily: font.bodySemiBold,
    fontSize: 13.5,
    textDecorationLine: 'underline',
  },
});
