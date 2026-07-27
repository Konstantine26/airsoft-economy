import { ActivityIndicator, Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';
import { colors, font, radii } from '../lib/theme';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'success';

type Props = {
  title: string;
  onPress: () => void;
  variant?: Variant;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function Button({ title, onPress, variant = 'primary', disabled, loading, style }: Props) {
  const isDisabled = disabled || loading;
  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={[styles.base, variantStyles[variant], isDisabled && styles.disabled, style]}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'primary' || variant === 'success' ? colors.onAccent : colors.text} />
      ) : (
        <Text style={[styles.label, labelStyles[variant]]}>{title}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radii.md,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontFamily: font.heading,
    fontSize: 15,
  },
  disabled: {
    opacity: 0.5,
  },
});

const variantStyles = StyleSheet.create({
  primary: {
    backgroundColor: colors.accent,
  },
  secondary: {
    backgroundColor: colors.white10,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  danger: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.danger,
  },
  ghost: {
    backgroundColor: 'transparent',
  },
  success: {
    backgroundColor: colors.success,
  },
});

const labelStyles = StyleSheet.create({
  primary: {
    color: colors.onAccent,
  },
  secondary: {
    color: colors.text,
  },
  danger: {
    color: colors.danger,
  },
  ghost: {
    color: colors.accent,
  },
  success: {
    color: colors.onAccent,
  },
});
