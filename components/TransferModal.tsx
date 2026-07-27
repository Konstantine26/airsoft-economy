import { useState } from 'react';
import { Text, View, StyleSheet } from 'react-native';
import { supabase } from '../lib/supabase';
import { Sheet } from './Sheet';
import { Button } from './Button';
import { TextField } from './TextField';
import { colors, font, spacing } from '../lib/theme';
import type { Team } from '../lib/database.types';

type Props = {
  visible: boolean;
  projectId: string;
  fromTeam: Team;
  toTeam: Team;
  onClose: () => void;
  onSuccess: () => void;
};

export function TransferModal({ visible, projectId, fromTeam, toTeam, onClose, onSuccess }: Props) {
  const [amount, setAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setAmount('');
    setError(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSubmit = async () => {
    const numericAmount = Number(amount.replace(',', '.'));

    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      setError('Введите сумму больше нуля');
      return;
    }

    setSubmitting(true);
    setError(null);

    const { error: rpcError } = await supabase.rpc('transfer_funds', {
      p_project_id: projectId,
      p_from_team_id: fromTeam.id,
      p_to_team_id: toTeam.id,
      p_amount: numericAmount,
    });

    setSubmitting(false);

    if (rpcError) {
      setError(rpcError.message);
      return;
    }

    reset();
    onSuccess();
  };

  return (
    <Sheet visible={visible} onRequestClose={handleClose}>
      <Text style={styles.title}>
        «{fromTeam.name}» → «{toTeam.name}»
      </Text>

      <TextField
        style={styles.input}
        value={amount}
        onChangeText={setAmount}
        keyboardType="decimal-pad"
        placeholder="Сумма"
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.actions}>
        <Button title="Назад" variant="secondary" onPress={handleClose} style={styles.actionButton} />
        <Button title="Перевести" onPress={handleSubmit} loading={submitting} style={styles.actionButton} />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  title: {
    fontFamily: font.heading,
    fontSize: 18,
    color: colors.text,
    marginBottom: spacing.md + 2,
  },
  input: {
    marginBottom: spacing.md + 2,
  },
  error: {
    fontFamily: font.body,
    color: colors.danger,
    marginBottom: spacing.md,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
  },
  actionButton: {
    flex: 1,
  },
});
