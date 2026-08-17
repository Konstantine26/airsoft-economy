import { Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';
import { colors, font, radii } from '../lib/theme';

type Props = {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function Chip({ label, selected, onPress, disabled, style }: Props) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      android_ripple={{ color: colors.white14 }}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: !!selected, disabled: !!disabled }}
      style={({ pressed }) => [
        styles.chip,
        selected ? styles.selected : styles.unselected,
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
        style,
      ]}
    >
      <Text style={[styles.label, selected ? styles.labelSelected : styles.labelUnselected]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexShrink: 0,
    paddingVertical: 6,
    paddingHorizontal: 13,
    borderRadius: radii.pill,
    borderWidth: 1,
  },
  selected: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  unselected: {
    backgroundColor: colors.white10,
    borderColor: colors.cardBorder,
  },
  pressed: {
    opacity: 0.7,
  },
  disabled: {
    opacity: 0.4,
  },
  label: {
    fontFamily: font.bodySemiBold,
    fontSize: 12,
  },
  labelSelected: {
    color: colors.onAccent,
  },
  labelUnselected: {
    color: colors.textMuted,
  },
});
