import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, font, radii, spacing } from '../lib/theme';

type Props = {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  label: string;
  value: string;
  placeholder?: string;
  required?: boolean;
  onPress: () => void;
};

export function FieldRow({ icon, label, value, placeholder, required, onPress }: Props) {
  const hasValue = value.trim().length > 0;
  return (
    <Pressable
      onPress={onPress}
      android_ripple={{ color: colors.white14 }}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${hasValue ? value : (placeholder ?? 'не выбрано')}`}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <View style={styles.iconWrap}>
        <MaterialCommunityIcons name={icon} size={18} color={colors.textMuted} />
      </View>
      <View style={styles.textWrap}>
        <Text style={styles.label}>
          {label}
          {required ? ' *' : ''}
        </Text>
        <Text style={[styles.value, !hasValue && styles.placeholder]} numberOfLines={1}>
          {hasValue ? value : (placeholder ?? 'Не выбрано')}
        </Text>
      </View>
      <MaterialCommunityIcons name="chevron-down" size={20} color={colors.textDim} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 2,
    paddingVertical: spacing.sm + 2,
  },
  pressed: {
    opacity: 0.7,
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: radii.md,
    backgroundColor: colors.cardSoft,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textWrap: {
    flex: 1,
  },
  label: {
    fontFamily: font.body,
    fontSize: 11.5,
    color: colors.textDim,
    marginBottom: 2,
  },
  value: {
    fontFamily: font.bodySemiBold,
    fontSize: 14.5,
    color: colors.text,
  },
  placeholder: {
    fontFamily: font.body,
    color: colors.textMuted,
  },
});
