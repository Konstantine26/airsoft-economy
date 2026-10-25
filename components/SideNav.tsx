import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { hapticSelection } from '../lib/haptics';
import { colors, font, radii, sizes, spacing } from '../lib/theme';
import type { BottomTabItem } from './BottomTabBar';

type Props<T extends string> = {
  items: BottomTabItem<T>[];
  activeKey: T;
  onChange: (key: T) => void;
  tint?: string;
  surface?: { bg: string; border: string; inactive: string; text: string };
  // Context pill (project + role) pinned above the sections.
  header: React.ReactNode;
  // Notifications / profile, pinned to the bottom.
  footer: React.ReactNode;
};

// Wide-screen counterpart of BottomTabBar: the same sections, as a
// labelled column on the left, with the header's context and account
// controls folded into its top and bottom.
export function SideNav<T extends string>({ items, activeKey, onChange, tint = colors.accent, surface, header, footer }: Props<T>) {
  return (
    <View style={[styles.nav, surface && { backgroundColor: surface.bg, borderRightColor: surface.border }]}>
      <View style={styles.header}>{header}</View>
      <View style={styles.items} accessibilityRole="tablist">
        {items.map((item) => {
          const active = item.key === activeKey;
          const color = active ? tint : (surface?.inactive ?? colors.textMuted);
          const badge = item.badge && item.badge > 0 ? (item.badge > 99 ? '99+' : String(item.badge)) : null;
          return (
            <Pressable
              key={item.key}
              onPress={() => {
                if (!active) hapticSelection();
                onChange(item.key);
              }}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              accessibilityLabel={badge ? `${item.label}, ${badge}` : item.label}
              style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
                styles.item,
                hovered && !active && { backgroundColor: colors.white10 },
                active && { backgroundColor: tint === colors.accent ? colors.accentSoft : colors.liveSoft },
                pressed && styles.pressed,
              ]}
            >
              <MaterialCommunityIcons name={active && item.activeIcon ? item.activeIcon : item.icon} size={22} color={color} />
              <Text
                style={[styles.label, { color: active ? tint : (surface?.text ?? colors.text) }, active && styles.labelActive]}
                numberOfLines={1}
              >
                {item.label}
              </Text>
              {badge ? (
                <View style={[styles.badge, { backgroundColor: tint === colors.accent ? colors.danger : tint }]}>
                  <Text style={[styles.badgeText, tint !== colors.accent && { color: colors.onLive }]}>{badge}</Text>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </View>
      <View style={[styles.footer, surface && { borderTopColor: surface.border }]}>{footer}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  nav: {
    width: 260,
    backgroundColor: colors.cardSoft,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: colors.cardBorder,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
  },
  header: {
    marginBottom: spacing.lg,
  },
  items: {
    flex: 1,
    gap: 2,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: sizes.hitMin,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
  },
  pressed: {
    opacity: 0.7,
  },
  label: {
    flex: 1,
    fontFamily: font.bodyMedium,
    fontSize: 15,
  },
  labelActive: {
    fontFamily: font.bodySemiBold,
  },
  badge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    fontFamily: font.bodyBold,
    fontSize: 11,
    color: colors.text,
  },
  footer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.cardBorder,
    paddingTop: spacing.sm,
    gap: 2,
  },
});
