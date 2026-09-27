import { MaterialCommunityIcons } from '@expo/vector-icons';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, font, motion, radii, spacing } from '../lib/theme';

type ToastTone = 'success' | 'info' | 'danger';

export type ToastOptions = {
  message: string;
  tone?: ToastTone;
  // "Отменить" for reversible actions that ran immediately (took a task,
  // rejected a request). Never offer undo for money -- that is confirmed
  // up front instead.
  actionLabel?: string;
  onAction?: () => void;
};

type ToastState = ToastOptions & { id: number };

const ToastContext = createContext<(options: ToastOptions) => void>(() => {});

export function useToast() {
  return useContext(ToastContext);
}

const ICONS: Record<ToastTone, { name: keyof typeof MaterialCommunityIcons.glyphMap; color: string }> = {
  success: { name: 'check-circle', color: colors.success },
  info: { name: 'information', color: colors.accent },
  danger: { name: 'alert-circle', color: colors.danger },
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const nextId = useRef(0);

  const show = useCallback((options: ToastOptions) => {
    nextId.current += 1;
    setToast({ ...options, id: nextId.current });
    AccessibilityInfo.announceForAccessibility(options.message);
  }, []);

  return (
    <ToastContext.Provider value={show}>
      <View style={styles.root}>
        {children}
        {toast ? <ToastView key={toast.id} toast={toast} onDone={() => setToast(null)} /> : null}
      </View>
    </ToastContext.Provider>
  );
}

function ToastView({ toast, onDone }: { toast: ToastState; onDone: () => void }) {
  const anim = useRef(new Animated.Value(0)).current;
  const tone = toast.tone ?? 'success';
  const hasAction = !!(toast.actionLabel && toast.onAction);

  const hide = useCallback(() => {
    Animated.timing(anim, { toValue: 0, duration: motion.fast, useNativeDriver: true }).start(onDone);
  }, [anim, onDone]);

  useEffect(() => {
    Animated.timing(anim, { toValue: 1, duration: motion.base, useNativeDriver: true }).start();
    const timer = setTimeout(hide, hasAction ? 5000 : 3500);
    return () => clearTimeout(timer);
  }, [anim, hide, hasAction]);

  const translateY = useMemo(() => anim.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }), [anim]);

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[styles.wrap, { bottom: spacing.lg, opacity: anim, transform: [{ translateY }] }]}
    >
      <View style={styles.toast} accessibilityLiveRegion="polite">
        <MaterialCommunityIcons name={ICONS[tone].name} size={20} color={ICONS[tone].color} />
        <Text style={styles.message} numberOfLines={2}>
          {toast.message}
        </Text>
        {hasAction ? (
          <Pressable
            onPress={() => {
              toast.onAction?.();
              hide();
            }}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={toast.actionLabel}
          >
            <Text style={styles.action}>{toast.actionLabel}</Text>
          </Pressable>
        ) : null}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  wrap: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    alignItems: 'center',
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    width: '100%',
    maxWidth: 480,
    minHeight: 52,
    backgroundColor: colors.toast,
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    boxShadow: '0px 8px 24px rgba(0, 0, 0, 0.4)',
  },
  message: {
    flex: 1,
    fontFamily: font.bodyMedium,
    fontSize: 14.5,
    color: colors.text,
  },
  action: {
    fontFamily: font.bodySemiBold,
    fontSize: 14.5,
    color: colors.accent,
  },
});
