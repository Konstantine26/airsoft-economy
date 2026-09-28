import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { decodeParticipantCode } from '../lib/participantCode';
import { callMoneyRpc, moneyErrorMessage, newRequestId } from '../lib/money';
import { formatMoney } from '../lib/format';
import { Sheet } from './Sheet';
import { Button } from './Button';
import { TextField } from './TextField';
import { ListRow } from './ListRow';
import { Avatar } from './Avatar';
import { AmountPad, parseAmount } from './AmountPad';
import { HoldToConfirmButton } from './HoldToConfirmButton';
import { colors, font, radii, spacing } from '../lib/theme';
import type { Profile, Team } from '../lib/database.types';

type Recipient = { kind: 'participant'; profile: Profile } | { kind: 'team'; team: Team };
type Step = 'choose' | 'entry' | 'scan' | 'amount' | 'done';

type Props = {
  visible: boolean;
  projectId: string;
  ownTeam: Team | null;
  onClose: () => void;
  onSuccess: () => void;
};

// Who → how much → hold to send. The amount screen always shows the
// recipient's name and what's left afterwards, so the player checks both
// before any money moves.
export function SendMoneyModal({ visible, projectId, ownTeam, onClose, onSuccess }: Props) {
  const { profile } = useAuth();
  const [step, setStep] = useState<Step>('choose');
  const [amount, setAmount] = useState('');
  const [numberInput, setNumberInput] = useState('');
  const [recipient, setRecipient] = useState<Recipient | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [sent, setSent] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [scanLocked, setScanLocked] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  // One key per (recipient, amount) intent -- see newRequestId().
  const intent = useRef<{ key: string; id: string } | null>(null);

  useEffect(() => {
    if (!visible || !profile) return;
    let cancelled = false;
    supabase
      .from('project_profile_balances')
      .select('balance')
      .eq('project_id', projectId)
      .eq('profile_id', profile.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setBalance(data?.balance ?? 0);
      });
    return () => {
      cancelled = true;
    };
  }, [visible, projectId, profile]);

  const reset = () => {
    setStep('choose');
    setAmount('');
    setNumberInput('');
    setRecipient(null);
    setError(null);
    setScanLocked(false);
    setSent(null);
    intent.current = null;
  };

  const handleClose = () => {
    const done = step === 'done';
    reset();
    if (done) onSuccess();
    else onClose();
  };

  const resolveParticipant = async (participantNumber: number) => {
    setError(null);
    const { data, error: queryError } = await supabase
      .from('profiles')
      .select('*')
      .eq('participant_number', participantNumber)
      .maybeSingle();

    if (queryError || !data) {
      setError(`Участник №${participantNumber} не найден. Проверьте номер`);
      setScanLocked(false);
      return;
    }
    if (data.id === profile?.id) {
      setError('Это ваш собственный номер');
      setScanLocked(false);
      return;
    }
    setRecipient({ kind: 'participant', profile: data });
    setStep('amount');
  };

  const handleManualSubmit = () => {
    const n = decodeParticipantCode(numberInput);
    if (n === null) {
      setError('Введите номер участника цифрами');
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

  const numericAmount = parseAmount(amount);
  const overBalance = balance != null && numericAmount > balance;

  const submit = async () => {
    if (!recipient || numericAmount <= 0 || overBalance) return;
    const intentKey = `${recipient.kind === 'team' ? recipient.team.id : recipient.profile.id}:${numericAmount}`;
    if (intent.current?.key !== intentKey) intent.current = { key: intentKey, id: newRequestId() };

    setSubmitting(true);
    setError(null);
    const { error: rpcError } =
      recipient.kind === 'team'
        ? await callMoneyRpc(
            'transfer_to_team',
            { p_project_id: projectId, p_to_team_id: recipient.team.id, p_amount: numericAmount },
            intent.current.id
          )
        : await callMoneyRpc(
            'transfer_to_participant',
            { p_project_id: projectId, p_to_profile_id: recipient.profile.id, p_amount: numericAmount },
            intent.current.id
          );
    setSubmitting(false);
    if (rpcError) {
      setError(moneyErrorMessage(rpcError));
      return;
    }
    intent.current = null;
    setSent(numericAmount);
    setStep('done');
  };

  const recipientName =
    recipient?.kind === 'team'
      ? `Команда «${recipient.team.name}»`
      : recipient
        ? recipient.profile.full_name || `Участник №${recipient.profile.participant_number}`
        : '';

  return (
    <Sheet visible={visible} onRequestClose={handleClose}>
      {step === 'choose' ? (
        <>
          <Text style={styles.title}>Перевод</Text>
          <Text style={styles.subtitle}>Кому отправить деньги?</Text>
          <View style={styles.group}>
            <ListRow
              title="Сканировать QR-код"
              subtitle="Быстрее всего — наведите камеру на QR участника"
              leading={<RowIcon name="qrcode-scan" />}
              onPress={() => setStep('scan')}
            />
            <ListRow
              title="По номеру участника"
              leading={<RowIcon name="numeric" />}
              onPress={() => setStep('entry')}
            />
            <ListRow
              title={ownTeam ? `В команду «${ownTeam.name}»` : 'В команду'}
              subtitle={ownTeam ? null : 'Вы не состоите в команде'}
              leading={<RowIcon name="account-group-outline" />}
              disabled={!ownTeam}
              divider={false}
              onPress={() => {
                if (!ownTeam) return;
                setRecipient({ kind: 'team', team: ownTeam });
                setStep('amount');
              }}
            />
          </View>
          <Button title="Отмена" variant="ghost" onPress={handleClose} />
        </>
      ) : null}

      {step === 'entry' ? (
        <>
          <Text style={styles.title}>Номер участника</Text>
          <TextField
            label="Номер участника"
            value={numberInput}
            onChangeText={setNumberInput}
            keyboardType="number-pad"
            placeholder="Например, 42"
            error={error}
            autoFocus
            onSubmitEditing={handleManualSubmit}
            containerStyle={styles.field}
          />
          <View style={styles.actions}>
            <Button title="Назад" variant="secondary" onPress={reset} style={styles.actionButton} />
            <Button title="Далее" onPress={handleManualSubmit} style={styles.actionButton} />
          </View>
        </>
      ) : null}

      {step === 'scan' ? (
        <>
          <Text style={styles.title}>Сканировать QR</Text>
          {!permission?.granted ? (
            <View style={styles.permission}>
              <Text style={styles.subtitle}>Чтобы сканировать QR-код участника, разрешите доступ к камере.</Text>
              <Button title="Разрешить камеру" icon="camera" onPress={requestPermission} />
            </View>
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

      {step === 'amount' && recipient ? (
        <>
          <View style={styles.recipient}>
            {recipient.kind === 'participant' ? (
              <Avatar uri={recipient.profile.avatar_url} name={recipient.profile.full_name} size={40} />
            ) : (
              <RowIcon name="account-group" />
            )}
            <View style={styles.recipientText}>
              <Text style={styles.recipientName} numberOfLines={1}>
                {recipientName}
              </Text>
              <Text style={styles.recipientMeta}>
                {recipient.kind === 'participant' ? `№${recipient.profile.participant_number}` : 'Командный бюджет'}
              </Text>
            </View>
            <Button title="Изменить" variant="ghost" size="sm" onPress={reset} />
          </View>

          <AmountPad value={amount} onChange={setAmount} available={balance} />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <HoldToConfirmButton
            title={numericAmount > 0 ? `Отправить ${formatMoney(numericAmount)}` : 'Введите сумму'}
            onConfirm={submit}
            loading={submitting}
            disabled={numericAmount <= 0 || overBalance}
            style={styles.confirm}
          />
        </>
      ) : null}

      {step === 'done' ? (
        <View style={styles.done}>
          <View style={styles.doneIcon}>
            <MaterialCommunityIcons name="check" size={34} color={colors.onSuccess} />
          </View>
          <Text style={styles.doneAmount}>{sent != null ? formatMoney(sent) : ''}</Text>
          <Text style={styles.doneText}>Отправлено · {recipientName}</Text>
          <Button title="Готово" onPress={handleClose} style={styles.doneButton} />
        </View>
      ) : null}
    </Sheet>
  );
}

function RowIcon({ name }: { name: keyof typeof MaterialCommunityIcons.glyphMap }) {
  return (
    <View style={styles.rowIcon}>
      <MaterialCommunityIcons name={name} size={20} color={colors.textMuted} />
    </View>
  );
}

const styles = StyleSheet.create({
  title: {
    fontFamily: font.heading,
    fontSize: 20,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  subtitle: {
    fontFamily: font.body,
    fontSize: 14.5,
    color: colors.textMuted,
    marginBottom: spacing.md,
  },
  group: {
    marginBottom: spacing.sm,
  },
  rowIcon: {
    width: 40,
    height: 40,
    borderRadius: radii.md,
    backgroundColor: colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  field: {
    marginTop: spacing.sm,
    marginBottom: spacing.md + 2,
  },
  permission: {
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  cameraBox: {
    height: 260,
    borderRadius: radii.lg,
    overflow: 'hidden',
    marginTop: spacing.sm,
    marginBottom: spacing.md,
    backgroundColor: colors.cardSoft,
  },
  camera: {
    flex: 1,
  },
  error: {
    fontFamily: font.bodyMedium,
    fontSize: 14,
    color: colors.danger,
    marginVertical: spacing.sm,
    textAlign: 'center',
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
  },
  actionButton: {
    flex: 1,
  },
  recipient: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface2,
    borderRadius: radii.md,
    paddingVertical: spacing.sm,
    paddingLeft: spacing.md,
    marginBottom: spacing.md,
  },
  recipientText: {
    flex: 1,
    minWidth: 0,
  },
  recipientName: {
    fontFamily: font.bodySemiBold,
    fontSize: 15.5,
    color: colors.text,
  },
  recipientMeta: {
    fontFamily: font.body,
    fontSize: 13,
    color: colors.textMuted,
  },
  confirm: {
    marginTop: spacing.md,
  },
  done: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.lg,
  },
  doneIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.success,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  doneAmount: {
    fontFamily: font.numeric,
    fontVariant: ['tabular-nums'],
    fontSize: 40,
    lineHeight: 44,
    color: colors.text,
  },
  doneText: {
    fontFamily: font.body,
    fontSize: 15,
    color: colors.textMuted,
    textAlign: 'center',
  },
  doneButton: {
    alignSelf: 'stretch',
    marginTop: spacing.md,
  },
});
