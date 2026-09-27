import { MaterialCommunityIcons } from '@expo/vector-icons';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Button } from './Button';
import { colors, font, radii, spacing } from '../lib/theme';

type Props = {
  title: string;
  // Say where the data will come from ("Командир стороны выдаёт их во время
  // игры"), not just that there is none.
  message?: string;
  icon?: keyof typeof MaterialCommunityIcons.glyphMap;
  actionLabel?: string;
  onAction?: () => void;
  style?: StyleProp<ViewStyle>;
};

export function EmptyState({ title, message, icon = 'inbox-outline', actionLabel, onAction, style }: Props) {
  return (
    <View style={[styles.wrap, style]}>
      <View style={styles.icon}>
        <MaterialCommunityIcons name={icon} size={22} color={colors.textMuted} />
      </View>
      <Text style={styles.title}>{title}</Text>
      {message ? <Text style={styles.message}>{message}</Text> : null}
      {actionLabel && onAction ? (
        <Button title={actionLabel} variant="tonal" size="sm" onPress={onAction} style={styles.action} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    gap: spacing.sm - 2,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.cardBorder,
    borderRadius: radii.lg,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
  },
  icon: {
    width: 44,
    height: 44,
    borderRadius: radii.md,
    backgroundColor: colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  title: {
    fontFamily: font.bodySemiBold,
    fontSize: 15.5,
    color: colors.text,
    textAlign: 'center',
  },
  message: {
    fontFamily: font.body,
    fontSize: 13.5,
    lineHeight: 19,
    color: colors.textMuted,
    textAlign: 'center',
    maxWidth: 320,
  },
  action: {
    marginTop: spacing.sm,
  },
});
