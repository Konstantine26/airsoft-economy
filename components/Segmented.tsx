import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { hapticSelection } from '../lib/haptics';
import { colors, font, radii, sizes } from '../lib/theme';

export type SegmentedItem<T extends string> = {
  key: T;
  label: string;
  // Shown after the label in the live accent, e.g. pending requests.
  count?: number;
};

type Props<T extends string> = {
  items: SegmentedItem<T>[];
  value: T;
  onChange: (key: T) => void;
  style?: StyleProp<ViewStyle>;
};

// Switches between modes of the same screen ("Мои · Доступные · Готово").
// Use Chip for picking a value or filtering, and the tab bar for moving
// between sections -- three controls that must not look alike.
export function Segmented<T extends string>({ items, value, onChange, style }: Props<T>) {
  return (
    <View style={[styles.track, style]} accessibilityRole="tablist">
      {items.map((item) => {
        const active = item.key === value;
        return (
          <Pressable
            key={item.key}
            onPress={() => {
              if (!active) hapticSelection();
              onChange(item.key);
            }}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={item.count ? `${item.label}, ${item.count}` : item.label}
            style={({ pressed }) => [styles.segment, active && styles.segmentActive, pressed && !active && styles.pressed]}
          >
            <Text style={[styles.label, active && styles.labelActive]} numberOfLines={1}>
              {item.label}
              {item.count ? <Text style={styles.count}>{` ${item.count}`}</Text> : null}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderRadius: radii.md,
    padding: 3,
    gap: 2,
  },
  segment: {
    flex: 1,
    minHeight: sizes.hitMin - 6,
    borderRadius: radii.sm + 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  segmentActive: {
    backgroundColor: colors.surface2,
  },
  pressed: {
    opacity: 0.7,
  },
  label: {
    fontFamily: font.bodySemiBold,
    fontSize: 13.5,
    color: colors.textMuted,
  },
  labelActive: {
    color: colors.text,
  },
  count: {
    color: colors.live,
  },
});
