import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { supabase } from '../lib/supabase';
import { decodeParticipantCode } from '../lib/participantCode';
import { Sheet } from './Sheet';
import { Button } from './Button';
import { TextField } from './TextField';
import { colors, font, radii, spacing } from '../lib/theme';
import type { Profile, Team } from '../lib/database.types';

type Mode = 'choose' | 'team-amount' | 'participant-entry' | 'participant-scan' | 'participant-confirm';

type Props = {
  visible: boolean;
  projectId: string;
  ownTeam: Team | null;
  onClose: () => void;
  onSuccess: () => void;
};

export function SendMoneyModal({ visible, projectId, ownTeam, onClose, onSuccess }: Props) {
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
      p_project_id: projectId,
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
      p_project_id: projectId,
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
    <Sheet visible={visible} onRequestClose={handleClose}>
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
          <Pressable style={styles.cancelLink} onPress={handleClose}>
            <Text style={styles.cancelLinkText}>Отмена</Text>
          </Pressable>
        </>
      ) : null}

      {mode === 'team-amount' ? (
        <>
          <Text style={styles.title}>В команду «{ownTeam?.name}»</Text>
          <TextField
            style={styles.input}
            label="Сумма, ₽"
            value={amount}
            onChangeText={setAmount}
            keyboardType="decimal-pad"
            placeholder="0.00"
            error={error}
          />
          <View style={styles.actions}>
            <Button title="Назад" variant="secondary" onPress={reset} style={styles.actionButton} />
            <Button title="Отправить" onPress={submitTeamTransfer} loading={submitting} style={styles.actionButton} />
          </View>
        </>
      ) : null}

      {mode === 'participant-entry' ? (
        <>
          <Text style={styles.title}>Номер участника</Text>
          <TextField
            style={styles.input}
            label="Номер участника"
            value={numberInput}
            onChangeText={setNumberInput}
            keyboardType="number-pad"
            placeholder="Например, 42"
            error={error}
          />
          <View style={styles.actions}>
            <Button title="Назад" variant="secondary" onPress={reset} style={styles.actionButton} />
            <Button title="Далее" onPress={handleManualSubmit} style={styles.actionButton} />
          </View>
        </>
      ) : null}

      {mode === 'participant-scan' ? (
        <>
          <Text style={styles.title}>Сканировать QR</Text>
          {!permission?.granted ? (
            <>
              <Text style={styles.label}>Нужен доступ к камере</Text>
              <Button title="Разрешить" onPress={requestPermission} style={styles.permissionButton} />
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
          <Button title="Назад" variant="secondary" onPress={reset} />
        </>
      ) : null}

      {mode === 'participant-confirm' && recipient ? (
        <>
          <Text style={styles.title}>{recipient.full_name || `Участник #${recipient.participant_number}`}</Text>
          <Text style={styles.label}>Номер участника: {recipient.participant_number}</Text>
          <TextField
            style={styles.input}
            label="Сумма, ₽"
            value={amount}
            onChangeText={setAmount}
            keyboardType="decimal-pad"
            placeholder="0.00"
            error={error}
          />
          <View style={styles.actions}>
            <Button title="Назад" variant="secondary" onPress={reset} style={styles.actionButton} />
            <Button
              title="Отправить"
              onPress={submitParticipantTransfer}
              loading={submitting}
              style={styles.actionButton}
            />
          </View>
        </>
      ) : null}
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
  label: {
    fontFamily: font.body,
    fontSize: 12.5,
    color: colors.textMuted,
    marginBottom: spacing.md,
  },
  input: {
    marginBottom: spacing.md + 2,
  },
  optionButton: {
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radii.md,
    paddingVertical: 13,
    alignItems: 'center',
    marginBottom: 9,
  },
  optionButtonDisabled: {
    opacity: 0.5,
  },
  optionButtonText: {
    fontFamily: font.bodySemiBold,
    fontSize: 14,
    color: colors.text,
  },
  cameraBox: {
    height: 220,
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: spacing.md,
    backgroundColor: colors.cardSoft,
  },
  camera: {
    flex: 1,
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
  cancelLink: {
    marginTop: 4,
  },
  cancelLinkText: {
    fontFamily: font.body,
    textAlign: 'center',
    fontSize: 13.5,
    color: colors.textMuted,
  },
  permissionButton: {
    marginBottom: spacing.md,
  },
});
