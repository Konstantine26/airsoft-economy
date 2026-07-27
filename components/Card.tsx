import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, radii, spacing } from '../lib/theme';

type Props = {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  soft?: boolean;
};

export function Card({ children, style, soft }: Props) {
  return <View style={[styles.card, soft && styles.soft, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radii.lg,
    padding: spacing.md,
  },
  soft: {
    backgroundColor: colors.cardSoft,
  },
});
