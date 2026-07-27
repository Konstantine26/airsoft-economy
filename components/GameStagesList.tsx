import { StyleSheet, Text, View } from 'react-native';
import type { GameStage } from '../lib/database.types';
import { Card } from './Card';
import { colors, font, spacing } from '../lib/theme';

export function GameStagesList({ stages }: { stages: GameStage[] }) {
  if (stages.length === 0) return null;

  return (
    <View style={styles.list}>
      {stages.map((s, idx) => (
        <Card key={s.id}>
          <Text style={styles.title}>
            {idx + 1}. {s.title}
          </Text>
          {s.description ? <Text style={styles.description}>{s.description}</Text> : null}
        </Card>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: spacing.sm,
  },
  title: {
    fontFamily: font.bodySemiBold,
    fontSize: 14,
    color: colors.text,
  },
  description: {
    fontFamily: font.body,
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 4,
  },
});
