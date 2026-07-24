import { useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { supabase } from '../lib/supabase';
import type { Team } from '../lib/database.types';

type Props = {
  visible: boolean;
  teams: Team[];
  onClose: () => void;
  onSuccess: () => void;
};

export function TransferModal({ visible, teams, onClose, onSuccess }: Props) {
  const [fromTeamId, setFromTeamId] = useState<string | null>(null);
  const [toTeamId, setToTeamId] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setFromTeamId(null);
    setToTeamId(null);
    setAmount('');
    setError(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSubmit = async () => {
    const numericAmount = Number(amount.replace(',', '.'));

    if (!fromTeamId || !toTeamId) {
      setError('Выберите обе команды');
      return;
    }
    if (fromTeamId === toTeamId) {
      setError('Команды должны отличаться');
      return;
    }
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      setError('Введите сумму больше нуля');
      return;
    }

    setSubmitting(true);
    setError(null);

    const { error: rpcError } = await supabase.rpc('transfer_funds', {
      p_from_team_id: fromTeamId,
      p_to_team_id: toTeamId,
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
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={styles.title}>Перевод между командами</Text>

          <Text style={styles.label}>Откуда</Text>
          <View style={styles.chips}>
            {teams.map((team) => (
              <Pressable
                key={team.id}
                style={[styles.chip, fromTeamId === team.id && styles.chipSelected]}
                onPress={() => setFromTeamId(team.id)}
              >
                <Text style={fromTeamId === team.id ? styles.chipTextSelected : styles.chipText}>
                  {team.name}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.label}>Куда</Text>
          <View style={styles.chips}>
            {teams.map((team) => (
              <Pressable
                key={team.id}
                style={[styles.chip, toTeamId === team.id && styles.chipSelected]}
                onPress={() => setToTeamId(team.id)}
              >
                <Text style={toTeamId === team.id ? styles.chipTextSelected : styles.chipText}>
                  {team.name}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.label}>Сумма</Text>
          <TextInput
            style={styles.input}
            value={amount}
            onChangeText={setAmount}
            keyboardType="decimal-pad"
            placeholder="0.00"
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <View style={styles.actions}>
            <Pressable style={styles.cancelButton} onPress={handleClose}>
              <Text style={styles.cancelButtonText}>Отмена</Text>
            </Pressable>
            <Pressable
              style={[styles.submitButton, submitting && styles.submitButtonDisabled]}
              onPress={handleSubmit}
              disabled={submitting}
            >
              <Text style={styles.submitButtonText}>
                {submitting ? 'Отправка...' : 'Перевести'}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
    paddingBottom: 32,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 16,
  },
  label: {
    fontSize: 13,
    color: '#666',
    marginTop: 12,
    marginBottom: 6,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#ccc',
  },
  chipSelected: {
    backgroundColor: '#111',
    borderColor: '#111',
  },
  chipText: {
    color: '#111',
  },
  chipTextSelected: {
    color: '#fff',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 16,
  },
  error: {
    color: '#c00',
    marginTop: 12,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 14,
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#ccc',
  },
  cancelButtonText: {
    fontWeight: '600',
  },
  submitButton: {
    flex: 1,
    paddingVertical: 14,
    alignItems: 'center',
    borderRadius: 10,
    backgroundColor: '#111',
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
});
