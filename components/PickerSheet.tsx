import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { Sheet } from './Sheet';
import { colors, font, radii, spacing } from '../lib/theme';

export type PickerOption = { id: string; label: string; sublabel?: string };

type Props = {
  visible: boolean;
  title: string;
  options: PickerOption[];
  selectedId: string | null;
  emptyText?: string;
  onSelect: (id: string) => void;
  onRequestClose: () => void;
};

export function PickerSheet({ visible, title, options, selectedId, emptyText, onSelect, onRequestClose }: Props) {
  return (
    <Sheet visible={visible} onRequestClose={onRequestClose} style={styles.sheet}>
      <Text style={styles.title}>{title}</Text>
      {options.length === 0 ? (
        <Text style={styles.empty}>{emptyText ?? 'Список пуст'}</Text>
      ) : (
        <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
          {options.map((option) => {
            const selected = option.id === selectedId;
            return (
              <Pressable
                key={option.id}
                onPress={() => {
                  onSelect(option.id);
                  onRequestClose();
                }}
                android_ripple={{ color: colors.white14 }}
                accessibilityRole="button"
                accessibilityLabel={option.label}
                accessibilityState={{ selected }}
                style={({ pressed }) => [styles.option, selected && styles.optionSelected, pressed && styles.pressed]}
              >
                <Text style={[styles.optionLabel, selected && styles.optionLabelSelected]}>{option.label}</Text>
                {option.sublabel ? <Text style={styles.optionSublabel}>{option.sublabel}</Text> : null}
                {selected ? <MaterialCommunityIcons name="check" size={18} color={colors.accent} /> : null}
              </Pressable>
            );
          })}
        </ScrollView>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  sheet: {
    maxHeight: '75%',
  },
  title: {
    fontFamily: font.heading,
    fontSize: 17,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  empty: {
    fontFamily: font.body,
    fontSize: 13,
    color: colors.textMuted,
    paddingVertical: spacing.md,
  },
  list: {
    gap: 4,
    paddingBottom: spacing.sm,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 12,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.md,
  },
  optionSelected: {
    backgroundColor: colors.accentSoft,
  },
  pressed: {
    opacity: 0.7,
  },
  optionLabel: {
    fontFamily: font.body,
    fontSize: 14.5,
    color: colors.text,
    flex: 1,
  },
  optionLabelSelected: {
    fontFamily: font.bodySemiBold,
    color: colors.accent,
  },
  optionSublabel: {
    fontFamily: font.body,
    fontSize: 12,
    color: colors.textDim,
  },
});
