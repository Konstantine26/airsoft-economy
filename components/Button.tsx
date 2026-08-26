import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, font, radii } from '../lib/theme';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'success';

type Props = {
  title: string;
  onPress: () => void;
  variant?: Variant;
  disabled?: boolean;
  loading?: boolean;
  // Increment this (e.g. via useSavePulse) right after a successful save to
  // flash a green checkmark over the button. A number, not a boolean, so a
  // second save in a row re-triggers the animation even if the first one
  // hasn't finished fading out yet.
  successPulse?: number;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
};

export function Button({ title, onPress, variant = 'primary', disabled, loading, successPulse, style, accessibilityLabel }: Props) {
  const isDisabled = disabled || loading;
  const [showCheck, setShowCheck] = useState(false);
  const anim = useRef(new Animated.Value(0)).current;
  const mounted = useRef(false);

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    if (successPulse === undefined) return;
    setShowCheck(true);
    anim.setValue(0);
    Animated.sequence([
      Animated.spring(anim, { toValue: 1, useNativeDriver: true, friction: 6, tension: 90 }),
      Animated.delay(600),
      Animated.timing(anim, { toValue: 0, duration: 180, useNativeDriver: true }),
    ]).start(() => setShowCheck(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [successPulse]);

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      android_ripple={{ color: colors.white14 }}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      style={({ pressed }) => [
        styles.base,
        variantStyles[variant],
        isDisabled && styles.disabled,
        pressed && !isDisabled && styles.pressed,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'primary' || variant === 'success' ? colors.onAccent : colors.text} />
      ) : showCheck ? (
        <Animated.View style={[styles.successBadge, { opacity: anim, transform: [{ scale: anim }] }]}>
          <MaterialCommunityIcons name="check" size={16} color={colors.onAccent} />
        </Animated.View>
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
  pressed: {
    opacity: 0.75,
  },
  successBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.success,
    alignItems: 'center',
    justifyContent: 'center',
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
