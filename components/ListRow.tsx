import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, font, sizes, spacing } from '../lib/theme';

type Props = {
  title: string;
  subtitle?: string | null;
  // Avatar, icon tile, radio -- anything 36pt wide on the left.
  leading?: React.ReactNode;
  // Status pill, amount, row actions on the right.
  trailing?: React.ReactNode;
  onPress?: () => void;
  // Shows a chevron; defaults to true whenever the row is pressable.
  chevron?: boolean;
  divider?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
};

export function ListRow({
  title,
  subtitle,
  leading,
  trailing,
  onPress,
  chevron,
  divider = true,
  disabled,
  style,
  accessibilityLabel,
}: Props) {
  const showChevron = chevron ?? !!onPress;
  const body = (
    <>
      {leading ? <View style={styles.leading}>{leading}</View> : null}
      <View style={styles.text}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {trailing ? <View style={styles.trailing}>{trailing}</View> : null}
      {showChevron ? <MaterialCommunityIcons name="chevron-right" size={20} color={colors.textDim} /> : null}
    </>
  );

  const rowStyle = [styles.row, subtitle ? styles.twoLine : null, divider && styles.divider, disabled && styles.disabled, style];

  if (!onPress) {
    return <View style={rowStyle}>{body}</View>;
  }

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      android_ripple={{ color: colors.white14 }}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? (subtitle ? `${title}, ${subtitle}` : title)}
      accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => [...rowStyle, pressed && styles.pressed]}
    >
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: sizes.listRow,
    paddingVertical: spacing.sm,
  },
  twoLine: {
    minHeight: sizes.listRowTwoLine,
  },
  divider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.cardBorder,
  },
  disabled: {
    opacity: 0.5,
  },
  pressed: {
    opacity: 0.7,
  },
  leading: {
    minWidth: sizes.avatarRow,
    alignItems: 'center',
  },
  text: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  title: {
    fontFamily: font.bodySemiBold,
    fontSize: 15.5,
    color: colors.text,
  },
  subtitle: {
    fontFamily: font.body,
    fontSize: 13,
    color: colors.textMuted,
  },
  trailing: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
});
