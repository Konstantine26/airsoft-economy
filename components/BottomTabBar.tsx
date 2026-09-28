import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { hapticSelection } from '../lib/haptics';
import { colors, font, sizes, spacing } from '../lib/theme';

export type BottomTabItem<T extends string> = {
  key: T;
  label: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  // Filled variant shown while the tab is active, when the icon set has one.
  activeIcon?: keyof typeof MaterialCommunityIcons.glyphMap;
  badge?: number;
};

type Props<T extends string> = {
  items: BottomTabItem<T>[];
  activeKey: T;
  onChange: (key: T) => void;
  // Tint for the active tab; the in-game tab bar uses the live colour.
  tint?: string;
  // Overrides for the in-game "Солнце" palette.
  surface?: { bg: string; border: string; inactive: string };
};

// Section navigation for the current role. It sits at the bottom so it is
// always under the thumb; the role and project live in the header's
// context pill instead of here.
export function BottomTabBar<T extends string>({ items, activeKey, onChange, tint = colors.accent, surface }: Props<T>) {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        styles.bar,
        { paddingBottom: Math.max(insets.bottom, spacing.sm) },
        surface && { backgroundColor: surface.bg, borderTopColor: surface.border },
      ]}
      accessibilityRole="tablist"
    >
      {items.map((item) => {
        const active = item.key === activeKey;
        const color = active ? tint : (surface?.inactive ?? colors.textDim);
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
            style={({ pressed }) => [styles.tab, pressed && styles.pressed]}
          >
            <View>
              <MaterialCommunityIcons name={active && item.activeIcon ? item.activeIcon : item.icon} size={25} color={color} />
              {badge ? (
                <View
                  style={[
                    styles.badge,
                    { backgroundColor: tint === colors.accent ? colors.danger : tint },
                    surface && { borderColor: surface.bg },
                  ]}
                >
                  <Text style={[styles.badgeText, tint !== colors.accent && { color: colors.onLive }]}>{badge}</Text>
                </View>
              ) : null}
            </View>
            <Text style={[styles.label, { color }]} numberOfLines={1}>
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    backgroundColor: colors.bg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.cardBorder,
    paddingTop: 6,
    paddingHorizontal: spacing.xs,
  },
  tab: {
    flex: 1,
    minHeight: sizes.button,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  pressed: {
    opacity: 0.6,
  },
  label: {
    fontFamily: font.bodySemiBold,
    fontSize: 11,
  },
  badge: {
    position: 'absolute',
    top: -4,
    left: 15,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    borderWidth: 2,
    borderColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    fontFamily: font.bodyBold,
    fontSize: 9.5,
    color: colors.text,
  },
});
