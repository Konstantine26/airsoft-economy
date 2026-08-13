import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { supabase } from '../lib/supabase';
import { encodeParticipantCode } from '../lib/participantCode';
import { useAuth } from '../contexts/AuthContext';
import { useCapabilities } from '../hooks/useCapabilities';
import { SendMoneyModal } from './SendMoneyModal';
import { Button } from './Button';
import { Card } from './Card';
import { colors, font, spacing } from '../lib/theme';
import { formatMoney } from '../lib/format';
import type { PersonalTransaction, PersonalTransactionKind } from '../lib/database.types';

type JournalRow = PersonalTransaction & {
  from_profile: { full_name: string } | null;
  to_profile: { full_name: string } | null;
  from_team: { name: string } | null;
  to_team: { name: string } | null;
};

const KIND_LABEL: Record<PersonalTransactionKind, string> = {
  deposit: 'Пополнение',
  team_to_participant: 'От команды',
  participant_to_team: 'В команду',
  participant_to_participant: 'Перевод',
  task_reward: 'Награда за задание',
};

type Props = {
  projectId: string | null;
};

export function WalletScreen({ projectId }: Props) {
  const { profile, session } = useAuth();
  const capabilities = useCapabilities();
  const [balance, setBalance] = useState(0);
  const [journal, setJournal] = useState<JournalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showQr, setShowQr] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);

  const load = useCallback(async () => {
    if (!session || !projectId) {
      setBalance(0);
      setJournal([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const [balanceRes, journalRes] = await Promise.all([
      supabase
        .from('project_profile_balances')
        .select('*')
        .eq('project_id', projectId)
        .eq('profile_id', session.user.id)
        .maybeSingle(),
      supabase
        .from('personal_transactions')
        .select(
          '*, from_profile:profiles!personal_transactions_from_profile_id_fkey(full_name), to_profile:profiles!personal_transactions_to_profile_id_fkey(full_name), from_team:teams!personal_transactions_from_team_id_fkey(name), to_team:teams!personal_transactions_to_team_id_fkey(name)'
        )
        .eq('project_id', projectId)
        .or(`from_profile_id.eq.${session.user.id},to_profile_id.eq.${session.user.id}`)
        .order('created_at', { ascending: false }),
    ]);
    setBalance(balanceRes.data?.balance ?? 0);
    setJournal((journalRes.data as unknown as JournalRow[]) ?? []);
    setLoading(false);
  }, [session, projectId]);

  useEffect(() => {
    load();
  }, [load]);

  const onTransferDone = useCallback(async () => {
    setSendOpen(false);
    await Promise.all([load(), capabilities.refresh()]);
  }, [load, capabilities]);

  if (!profile || loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (!projectId) {
    return (
      <View style={styles.center}>
        <Text style={styles.label}>Нет проекта с включённой экономикой</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Кошелёк</Text>
      <Text style={styles.balance}>{formatMoney(balance)}</Text>
      <Text style={styles.participantNumber}>Мой номер участника: {profile.participant_number}</Text>

      <Button
        title={showQr ? 'Скрыть QR' : 'Показать мой QR'}
        variant="secondary"
        onPress={() => setShowQr((v) => !v)}
        style={styles.qrToggle}
      />

      {showQr ? (
        <View style={styles.qrBox}>
          <QRCode value={encodeParticipantCode(profile.participant_number)} size={148} />
        </View>
      ) : null}

      <Button title="Отправить" onPress={() => setSendOpen(true)} style={styles.sendButton} />

      <Text style={styles.sectionTitle}>Журнал операций</Text>
      {journal.length === 0 ? (
        <Text style={styles.label}>Пока нет операций</Text>
      ) : (
        <View style={styles.journalList}>
          {journal.map((row) => {
            const outgoing = row.from_profile_id === session?.user.id;
            const counterparty = outgoing
              ? row.to_profile?.full_name ?? row.to_team?.name ?? '—'
              : row.from_profile?.full_name ?? row.from_team?.name ?? 'Система';
            return (
              <Card key={row.id} style={styles.journalRow}>
                <View>
                  <Text style={styles.journalCounterparty}>{counterparty}</Text>
                  <Text style={styles.journalKind}>{KIND_LABEL[row.kind]}</Text>
                </View>
                <Text style={outgoing ? styles.amountOut : styles.amountIn}>
                  {outgoing ? '-' : '+'}
                  {formatMoney(row.amount)}
                </Text>
              </Card>
            );
          })}
        </View>
      )}

      <SendMoneyModal
        visible={sendOpen}
        projectId={projectId}
        ownTeam={capabilities.ownMembership?.team ?? null}
        onClose={() => setSendOpen(false)}
        onSuccess={onTransferDone}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: 40,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
  },
  title: {
    fontFamily: font.heading,
    fontSize: 19,
    color: colors.text,
  },
  balance: {
    fontFamily: font.heading,
    fontSize: 38,
    color: colors.text,
    marginTop: 8,
  },
  label: {
    fontFamily: font.body,
    fontSize: 13,
    color: colors.textMuted,
  },
  participantNumber: {
    fontFamily: font.body,
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 4,
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    fontFamily: font.heading,
    fontSize: 16,
    color: colors.text,
    marginTop: spacing.xl,
    marginBottom: spacing.sm + 2,
  },
  qrToggle: {
    marginBottom: 10,
  },
  qrBox: {
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    width: 172,
    height: 172,
    backgroundColor: '#f6f6f6',
    borderRadius: 12,
    marginVertical: spacing.md,
  },
  sendButton: {
    marginTop: 6,
    marginBottom: spacing.xl + 2,
  },
  journalList: {
    gap: spacing.sm,
  },
  journalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
  },
  journalCounterparty: {
    fontFamily: font.bodySemiBold,
    fontSize: 13.5,
    color: colors.text,
  },
  journalKind: {
    fontFamily: font.body,
    fontSize: 11.5,
    color: colors.textMuted,
    marginTop: 1,
  },
  amountOut: {
    fontFamily: font.heading,
    fontSize: 14.5,
    color: colors.danger,
  },
  amountIn: {
    fontFamily: font.heading,
    fontSize: 14.5,
    color: colors.success,
  },
});
