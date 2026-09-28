import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Easing, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { hapticSelection, hapticSuccess } from '../lib/haptics';
import { colors, font, motion, radii, sizes } from '../lib/theme';

type Tone = 'primary' | 'success';

type Props = {
  // What happens, with the amount: "Отправить 500 ₽".
  title: string;
  onConfirm: () => void;
  tone?: Tone;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
};

const TONES: Record<Tone, { bg: string; fg: string }> = {
  primary: { bg: colors.accent, fg: colors.onAccent },
  success: { bg: colors.success, fg: colors.onSuccess },
};

// For money only: the action fires after holding the button for
// motion.hold ms, so a stray tap in a pocket or with a glove can't send
// anything. Releasing early cancels. Screen-reader users get a plain
// "activate" action instead, since they can't see the fill.
export function HoldToConfirmButton({ title, onConfirm, tone = 'primary', disabled, loading, style }: Props) {
  const progress = useRef(new Animated.Value(0)).current;
  const [holding, setHolding] = useState(false);
  const fired = useRef(false);
  const [width, setWidth] = useState(0);
  const inactive = disabled || loading;
  const t = TONES[tone];

  useEffect(() => {
    if (!loading) progress.setValue(0);
  }, [loading, progress]);

  const start = () => {
    if (inactive) return;
    fired.current = false;
    setHolding(true);
    hapticSelection();
    Animated.timing(progress, {
      toValue: 1,
      duration: motion.hold,
      easing: Easing.linear,
      useNativeDriver: false,
    }).start(({ finished }) => {
      if (finished && !fired.current) {
        fired.current = true;
        setHolding(false);
        hapticSuccess();
        onConfirm();
      }
    });
  };

  const cancel = () => {
    if (fired.current) return;
    setHolding(false);
    progress.stopAnimation();
    Animated.timing(progress, { toValue: 0, duration: motion.fast, useNativeDriver: false }).start();
  };

  const fillWidth = progress.interpolate({ inputRange: [0, 1], outputRange: [0, width] });

  return (
    <Pressable
      onPressIn={start}
      onPressOut={cancel}
      disabled={inactive}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint="Удерживайте, чтобы подтвердить"
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      accessibilityActions={[{ name: 'activate', label: title }]}
      onAccessibilityAction={(e) => {
        if (e.nativeEvent.actionName === 'activate' && !inactive) onConfirm();
      }}
      style={[styles.button, { backgroundColor: t.bg }, inactive && styles.disabled, style]}
    >
      <Animated.View pointerEvents="none" style={[styles.fill, { width: fillWidth }]} />
      {loading ? (
        <ActivityIndicator color={t.fg} />
      ) : (
        <View style={styles.content}>
          <Text style={[styles.title, { color: t.fg }]} numberOfLines={1}>
            {holding ? 'Держите…' : title}
          </Text>
          {!holding ? <Text style={[styles.hint, { color: t.fg }]}>удерживайте</Text> : null}
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: sizes.buttonLg + 4,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    paddingHorizontal: 16,
  },
  disabled: {
    opacity: 0.45,
  },
  fill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
  },
  content: {
    alignItems: 'center',
  },
  title: {
    fontFamily: font.bodySemiBold,
    fontSize: 16,
  },
  hint: {
    fontFamily: font.body,
    fontSize: 11.5,
    opacity: 0.75,
    marginTop: 1,
  },
});
