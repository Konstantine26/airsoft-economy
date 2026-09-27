import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, font, radii } from '../lib/theme';

export type StatusTone = 'success' | 'pending' | 'danger' | 'accent' | 'live' | 'muted';

type Props = {
  label: string;
  tone?: StatusTone;
  // A leading dot for states ("Подтверждён", "В игре"); leave it off for
  // plain tags ("Взято в работу").
  dot?: boolean;
  style?: StyleProp<ViewStyle>;
};

const TONES: Record<StatusTone, { bg: string; fg: string }> = {
  success: { bg: colors.successSoft, fg: colors.success },
  pending: { bg: colors.liveSoft, fg: colors.live },
  danger: { bg: colors.dangerSoft, fg: colors.danger },
  accent: { bg: colors.accentSoft, fg: colors.accent },
  live: { bg: colors.live, fg: colors.onLive },
  muted: { bg: colors.surface2, fg: colors.textMuted },
};

export function StatusPill({ label, tone = 'muted', dot, style }: Props) {
  const { bg, fg } = TONES[tone];
  return (
    <View style={[styles.pill, { backgroundColor: bg }, style]} accessibilityRole="text" accessibilityLabel={label}>
      {dot ? <View style={[styles.dot, { backgroundColor: fg }]} /> : null}
      <Text style={[styles.label, { color: fg }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    height: 26,
    paddingHorizontal: 10,
    borderRadius: radii.pill,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  label: {
    fontFamily: font.bodySemiBold,
    fontSize: 12.5,
  },
});
