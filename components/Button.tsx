import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, font, motion, radii, sizes } from '../lib/theme';

type Variant = 'primary' | 'secondary' | 'tonal' | 'danger' | 'ghost' | 'success' | 'live';
type Size = 'sm' | 'md' | 'lg';

type Props = {
  title: string;
  onPress: () => void;
  variant?: Variant;
  // md (48) by default; lg (52) for the one main action on a screen; sm (36)
  // for inline row actions -- its hit area is still padded out to 44.
  size?: Size;
  icon?: keyof typeof MaterialCommunityIcons.glyphMap;
  disabled?: boolean;
  loading?: boolean;
  // Increment this (e.g. via useSavePulse) right after a successful save to
  // flash a green checkmark over the button. A number, not a boolean, so a
  // second save in a row re-triggers the animation even if the first one
  // hasn't finished fading out yet.
  successPulse?: number;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  accessibilityHint?: string;
};

const FILLED: Variant[] = ['primary', 'success', 'live'];

export function Button({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  icon,
  disabled,
  loading,
  successPulse,
  style,
  accessibilityLabel,
  accessibilityHint,
}: Props) {
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

  const labelColor = labelColors[variant];
  const iconSize = size === 'sm' ? 16 : 18;
  const hitSlop = size === 'sm' ? (sizes.hitMin - sizes.buttonSm) / 2 : undefined;

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      hitSlop={hitSlop}
      android_ripple={{ color: colors.white14 }}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      style={({ pressed }) => [
        styles.base,
        sizeStyles[size],
        variantStyles[variant],
        isDisabled && styles.disabled,
        pressed && !isDisabled && styles.pressed,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={FILLED.includes(variant) ? labelColor : colors.text} />
      ) : showCheck ? (
        <Animated.View style={[styles.successBadge, { opacity: anim, transform: [{ scale: anim }] }]}>
          <MaterialCommunityIcons name="check" size={16} color={colors.onSuccess} />
        </Animated.View>
      ) : (
        <View style={styles.content}>
          {icon ? <MaterialCommunityIcons name={icon} size={iconSize} color={labelColor} /> : null}
          <Text style={[styles.label, size === 'sm' && styles.labelSm, { color: labelColor }]} numberOfLines={1}>
            {title}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radii.md,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  label: {
    fontFamily: font.bodySemiBold,
    fontSize: 15,
  },
  labelSm: {
    fontSize: 13.5,
  },
  disabled: {
    opacity: 0.45,
  },
  pressed: {
    opacity: 0.9,
    transform: [{ scale: motion.pressScale }],
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

const sizeStyles = StyleSheet.create({
  sm: {
    minHeight: sizes.buttonSm,
    borderRadius: radii.sm + 2,
    paddingHorizontal: 12,
  },
  md: {
    minHeight: sizes.button,
  },
  lg: {
    minHeight: sizes.buttonLg,
  },
});

const variantStyles = StyleSheet.create({
  primary: {
    backgroundColor: colors.accent,
  },
  secondary: {
    backgroundColor: colors.surface2,
  },
  tonal: {
    backgroundColor: colors.accentSoft,
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
  live: {
    backgroundColor: colors.live,
  },
});

const labelColors: Record<Variant, string> = {
  primary: colors.onAccent,
  secondary: colors.text,
  tonal: colors.accent,
  danger: colors.danger,
  ghost: colors.accent,
  success: colors.onSuccess,
  live: colors.onLive,
};
