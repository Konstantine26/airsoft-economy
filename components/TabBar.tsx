import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, font } from '../lib/theme';

export type TabBarItem<T extends string> = {
  key: T;
  label: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
};

type Props<T extends string> = {
  items: TabBarItem<T>[];
  activeKey: T;
  onChange: (key: T) => void;
};

export function TabBar<T extends string>({ items, activeKey, onChange }: Props<T>) {
  return (
    <View style={styles.wrap}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.content}>
        {items.map((item) => {
          const active = item.key === activeKey;
          return (
            <Pressable
              key={item.key}
              onPress={() => onChange(item.key)}
              android_ripple={{ color: colors.white14 }}
              accessibilityRole="button"
              accessibilityLabel={item.label}
              accessibilityState={{ selected: active }}
              style={({ pressed }) => [styles.tab, active && styles.tabActive, pressed && styles.tabPressed]}
            >
              <MaterialCommunityIcons name={item.icon} size={16} color={active ? colors.accent : colors.textMuted} />
              <Text style={[styles.label, active && styles.labelActive]}>{item.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
      <LinearGradient
        pointerEvents="none"
        colors={[colors.bg, `${colors.bg}00`]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.fadeLeft}
      />
      <LinearGradient
        pointerEvents="none"
        colors={[`${colors.bg}00`, colors.bg]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.fadeRight}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
    position: 'relative',
  },
  content: {
    flexDirection: 'row',
    paddingHorizontal: 14,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: colors.accent,
  },
  tabPressed: {
    opacity: 0.7,
  },
  label: {
    fontFamily: font.bodySemiBold,
    fontSize: 12.5,
    color: colors.textMuted,
  },
  labelActive: {
    color: colors.accent,
  },
  fadeLeft: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 1,
    width: 18,
  },
  fadeRight: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 1,
    width: 18,
  },
});
