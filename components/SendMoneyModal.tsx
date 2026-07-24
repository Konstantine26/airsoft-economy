import { useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { supabase } from '../lib/supabase';
import { decodeParticipantCode } from '../lib/participantCode';
import type { Profile, Team } from '../lib/database.types';

type Mode = 'choose' | 'team-amount' | 'participant-entry' | 'participant-scan' | 'participant-confirm';

type Props = {
  visible: boolean;
  ownTeam: Team | null;
  onClose: () => void;
  onSuccess: () => void;
};

export function SendMoneyModal({ visible, ownTeam, onClose, onSuccess }: Props) {
  const [mode, setMode] = useState<Mode>('choose');
  const [amount, setAmount] = useState('');
  const [numberInput, setNumberInput] = useState('');
  const [recipient, setRecipient] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [scanLocked, setScanLocked] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();

  const reset = () => {
    setMode('choose');
    setAmount('');
    setNumberInput('');
    setRecipient(null);
    setError(null);
    setScanLocked(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const resolveParticipant = async (participantNumber: number) => {
    setError(null);
    const { data, error: queryError } = await supabase
      .from('profiles')
      .select('*')
      .eq('participant_number', participantNumber)
      .maybeSingle();

    if (queryError || !data) {
      setError('Участник с таким номером не найден');
      setScanLocked(false);
      return;
    }

    setRecipient(data);
    setMode('participant-confirm');
  };

  const handleManualSubmit = () => {
    const n = decodeParticipantCode(numberInput);
    if (n === null) {
      setError('Введите корректный номер участника');
      return;
    }
    resolveParticipant(n);
  };

  const handleBarcodeScanned = (result: { data: string }) => {
    if (scanLocked) return;
    const n = decodeParticipantCode(result.data);
    if (n === null) return;
    setScanLocked(true);
    resolveParticipant(n);
  };

  const submitTeamTransfer = async () => {
    if (!ownTeam) return;
    const numericAmount = Number(amount.replace(',', '.'));
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      setError('Введите сумму больше нуля');
      return;
    }
    setSubmitting(true);
    setError(null);
    const { error: rpcError } = await supabase.rpc('transfer_to_team', {
      p_to_team_id: ownTeam.id,
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

  const submitParticipantTransfer = async () => {
    if (!recipient) return;
    const numericAmount = Number(amount.replace(',', '.'));
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      setError('Введите сумму больше нуля');
      return;
    }
    setSubmitting(true);
    setError(null);
    const { error: rpcError } = await supabase.rpc('transfer_to_participant', {
      p_to_profile_id: recipient.id,
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
          {mode === 'choose' ? (
            <>
              <Text style={styles.title}>Отправить деньги</Text>
              <Pressable
                style={[styles.optionButton, !ownTeam && styles.optionButtonDisabled]}
                disabled={!ownTeam}
                onPress={() => setMode('team-amount')}
              >
                <Text style={styles.optionButtonText}>
                  {ownTeam ? `В команду «${ownTeam.name}»` : 'Вы не в команде'}
                </Text>
              </Pressable>
              <Pressable style={styles.optionButton} onPress={() => setMode('participant-entry')}>
                <Text style={styles.optionButtonText}>Участнику по номеру</Text>
              </Pressable>
              <Pressable style={styles.optionButton} onPress={() => setMode('participant-scan')}>
                <Text style={styles.optionButtonText}>Участнику по QR-коду</Text>
              </Pressable>
              <Pressable style={styles.cancelButton} onPress={handleClose}>
                <Text style={styles.cancelButtonText}>Отмена</Text>
              </Pressable>
            </>
          ) : null}

          {mode === 'team-amount' ? (
            <>
              <Text style={styles.title}>В команду «{ownTeam?.name}»</Text>
              <TextInput
                style={styles.input}
                value={amount}
                onChangeText={setAmount}
                keyboardType="decimal-pad"
                placeholder="Сумма"
              />
              {error ? <Text style={styles.error}>{error}</Text> : null}
              <View style={styles.actions}>
                <Pressable style={styles.cancelButton} onPress={reset}>
                  <Text style={styles.cancelButtonText}>Назад</Text>
                </Pressable>
                <Pressable style={styles.submitButton} onPress={submitTeamTransfer} disabled={submitting}>
                  {submitting ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.submitButtonText}>Отправить</Text>
                  )}
                </Pressable>
              </View>
            </>
          ) : null}

          {mode === 'participant-entry' ? (
            <>
              <Text style={styles.title}>Номер участника</Text>
              <TextInput
                style={styles.input}
                value={numberInput}
                onChangeText={setNumberInput}
                keyboardType="number-pad"
                placeholder="Например, 42"
              />
              {error ? <Text style={styles.error}>{error}</Text> : null}
              <View style={styles.actions}>
                <Pressable style={styles.cancelButton} onPress={reset}>
                  <Text style={styles.cancelButtonText}>Назад</Text>
                </Pressable>
                <Pressable style={styles.submitButton} onPress={handleManualSubmit}>
                  <Text style={styles.submitButtonText}>Далее</Text>
                </Pressable>
              </View>
            </>
          ) : null}

          {mode === 'participant-scan' ? (
            <>
              <Text style={styles.title}>Сканировать QR</Text>
              {!permission?.granted ? (
                <>
                  <Text style={styles.label}>Нужен доступ к камере</Text>
                  <Pressable style={styles.submitButton} onPress={requestPermission}>
                    <Text style={styles.submitButtonText}>Разрешить</Text>
                  </Pressable>
                </>
              ) : (
                <View style={styles.cameraBox}>
                  <CameraView
                    style={styles.camera}
                    barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                    onBarcodeScanned={handleBarcodeScanned}
                  />
                </View>
              )}
              {error ? <Text style={styles.error}>{error}</Text> : null}
              <Pressable style={styles.cancelButton} onPress={reset}>
                <Text style={styles.cancelButtonText}>Назад</Text>
              </Pressable>
            </>
          ) : null}

          {mode === 'participant-confirm' && recipient ? (
            <>
              <Text style={styles.title}>{recipient.full_name || `Участник #${recipient.participant_number}`}</Text>
              <Text style={styles.label}>Номер участника: {recipient.participant_number}</Text>
              <TextInput
                style={styles.input}
                value={amount}
                onChangeText={setAmount}
                keyboardType="decimal-pad"
                placeholder="Сумма"
              />
              {error ? <Text style={styles.error}>{error}</Text> : null}
              <View style={styles.actions}>
                <Pressable style={styles.cancelButton} onPress={reset}>
                  <Text style={styles.cancelButtonText}>Назад</Text>
                </Pressable>
                <Pressable
                  style={styles.submitButton}
                  onPress={submitParticipantTransfer}
                  disabled={submitting}
                >
                  {submitting ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.submitButtonText}>Отправить</Text>
                  )}
                </Pressable>
              </View>
            </>
          ) : null}
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
    minHeight: 260,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 16,
  },
  label: {
    fontSize: 13,
    color: '#666',
    marginBottom: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 16,
    marginBottom: 12,
  },
  optionButton: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 10,
  },
  optionButtonDisabled: {
    opacity: 0.5,
  },
  optionButtonText: {
    fontSize: 15,
    fontWeight: '600',
  },
  cameraBox: {
    height: 300,
    borderRadius: 10,
    overflow: 'hidden',
    marginBottom: 12,
  },
  camera: {
    flex: 1,
  },
  error: {
    color: '#c00',
    marginBottom: 12,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
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
  submitButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
});
