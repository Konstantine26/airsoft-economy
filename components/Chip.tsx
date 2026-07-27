import { Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';
import { colors, font, radii } from '../lib/theme';

type Props = {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
};

export function Chip({ label, selected, onPress, style }: Props) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.chip, selected ? styles.selected : styles.unselected, style]}
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
