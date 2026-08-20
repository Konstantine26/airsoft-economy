import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { supabase } from '../lib/supabase';
import { withRetry } from '../lib/retry';
import type { GameSide } from '../lib/database.types';
import { Button } from './Button';
import { Chip } from './Chip';
import { TextField } from './TextField';
import { colors, font, spacing } from '../lib/theme';

type Props = {
  gameId: string;
  sides: GameSide[];
};

export function GameAnnouncementForm({ gameId, sides }: Props) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [sideId, setSideId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentCount, setSentCount] = useState<number | null>(null);

  const send = async () => {
    if (!title.trim()) return;
    setSending(true);
    setError(null);
    setSentCount(null);
    const { data, error: rpcError } = await withRetry(() =>
      supabase.rpc('send_game_announcement', {
        p_game_id: gameId,
        p_title: title.trim(),
        p_body: body.trim() || null,
        p_side_id: sideId,
      })
    );
    setSending(false);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    setSentCount((data as number) ?? 0);
    setTitle('');
    setBody('');
  };

  return (
    <View>
      <Text style={styles.label}>Кому</Text>
      <View style={styles.chips}>
        <Chip label="Все стороны" selected={sideId === null} onPress={() => setSideId(null)} />
        {sides.map((side) => (
          <Chip key={side.id} label={side.name} selected={sideId === side.id} onPress={() => setSideId(side.id)} />
        ))}
      </View>

      <TextField
        style={styles.input}
        label="Заголовок"
        value={title}
        onChangeText={setTitle}
        placeholder="Например: сбор в 10:00 у штаба"
      />
      <TextField
        style={[styles.input, styles.textArea]}
        label="Текст (необязательно)"
        value={body}
        onChangeText={setBody}
        multiline
        numberOfLines={3}
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {sentCount !== null ? <Text style={styles.success}>Отправлено: {sentCount}</Text> : null}

      <Button
        title={sending ? 'Отправка…' : 'Отправить'}
        onPress={send}
        disabled={!title.trim() || sending}
        style={styles.sendButton}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    fontFamily: font.bodyMedium,
    fontSize: 12.5,
    color: colors.textMuted,
    marginBottom: 6,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: spacing.md,
  },
  input: {
    marginBottom: spacing.md,
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  error: {
    fontFamily: font.body,
    fontSize: 12.5,
    color: colors.danger,
    marginBottom: spacing.sm,
  },
  success: {
    fontFamily: font.body,
    fontSize: 12.5,
    color: colors.success,
    marginBottom: spacing.sm,
  },
  sendButton: {
    marginTop: spacing.sm,
  },
});
