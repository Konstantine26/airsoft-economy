import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { formatMoney } from '../lib/format';
import { hapticSelection } from '../lib/haptics';
import { colors, font, radii, spacing } from '../lib/theme';

type Props = {
  // Raw typed value, e.g. "1250" or "12,5" -- parse with parseAmount().
  value: string;
  onChange: (value: string) => void;
  // Shows "Доступно … · останется …" and turns red when exceeded.
  available?: number | null;
  quickAmounts?: number[];
};

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', ',', '0', 'back'] as const;
const MAX_DIGITS = 9;

export function parseAmount(value: string): number {
  const n = Number(value.replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

// Big-number amount entry with its own keypad: 56pt keys work in gloves,
// and the system keyboard would cover the recipient and the total.
export function AmountPad({ value, onChange, available, quickAmounts = [100, 300, 500, 1000] }: Props) {
  const amount = parseAmount(value);
  const over = available != null && amount > available;

  const press = (key: (typeof KEYS)[number]) => {
    hapticSelection();
    if (key === 'back') {
      onChange(value.slice(0, -1));
      return;
    }
    if (key === ',') {
      if (value.includes(',')) return;
      onChange(value === '' ? '0,' : `${value},`);
      return;
    }
    const [whole, fraction] = value.split(',');
    if (fraction !== undefined && fraction.length >= 2) return;
    if (fraction === undefined && whole.length >= MAX_DIGITS) return;
    onChange(value === '0' ? key : value + key);
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.display} accessibilityLiveRegion="polite" accessibilityLabel={`Сумма ${formatMoney(amount)}`}>
        <Text style={[styles.amount, !value && styles.amountEmpty, over && styles.amountOver]} numberOfLines={1} adjustsFontSizeToFit>
          {value ? `${value} ₽` : '0 ₽'}
        </Text>
        {available != null ? (
          <Text style={[styles.available, over && styles.availableOver]}>
            {over
              ? `Не хватает ${formatMoney(amount - available)} · доступно ${formatMoney(available)}`
              : `Доступно ${formatMoney(available)}${amount > 0 ? ` · останется ${formatMoney(available - amount)}` : ''}`}
          </Text>
        ) : null}
      </View>

      <View style={styles.quick}>
        {quickAmounts.map((q) => (
          <Pressable
            key={q}
            onPress={() => {
              hapticSelection();
              onChange(String(q));
            }}
            style={({ pressed }) => [styles.quickChip, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel={`${q} рублей`}
          >
            <Text style={styles.quickText}>{q}</Text>
          </Pressable>
        ))}
        {available != null && available > 0 ? (
          <Pressable
            onPress={() => {
              hapticSelection();
              onChange(String(available).replace('.', ','));
            }}
            style={({ pressed }) => [styles.quickChip, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Вся сумма"
          >
            <Text style={styles.quickText}>Всё</Text>
          </Pressable>
        ) : null}
      </View>

      <View style={styles.keys}>
        {KEYS.map((key) => (
          <Pressable
            key={key}
            onPress={() => press(key)}
            onLongPress={key === 'back' ? () => onChange('') : undefined}
            style={({ pressed }) => [styles.key, pressed && styles.keyPressed]}
            accessibilityRole="button"
            accessibilityLabel={key === 'back' ? 'Стереть' : key === ',' ? 'Запятая' : key}
          >
            {key === 'back' ? (
              <MaterialCommunityIcons name="backspace-outline" size={24} color={colors.text} />
            ) : (
              <Text style={styles.keyText}>{key}</Text>
            )}
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.md,
  },
  display: {
    alignItems: 'center',
    gap: 4,
  },
  amount: {
    fontFamily: font.numeric,
    fontVariant: ['tabular-nums'],
    fontSize: 52,
    lineHeight: 58,
    color: colors.text,
  },
  amountEmpty: {
    color: colors.textDim,
  },
  amountOver: {
    color: colors.danger,
  },
  available: {
    fontFamily: font.body,
    fontSize: 13.5,
    color: colors.textMuted,
    textAlign: 'center',
  },
  availableOver: {
    color: colors.danger,
  },
  quick: {
    flexDirection: 'row',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  quickChip: {
    minHeight: 36,
    paddingHorizontal: 14,
    borderRadius: radii.pill,
    backgroundColor: colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickText: {
    fontFamily: font.bodySemiBold,
    fontSize: 14,
    color: colors.text,
  },
  pressed: {
    opacity: 0.7,
  },
  keys: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  key: {
    width: '33.333%',
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.md,
  },
  keyPressed: {
    backgroundColor: colors.surface2,
  },
  keyText: {
    fontFamily: font.bodyMedium,
    fontSize: 26,
    color: colors.text,
  },
});
