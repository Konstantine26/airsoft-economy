import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { supabase } from '../lib/supabase';
import { encodeParticipantCode } from '../lib/participantCode';
import { useAuth } from '../contexts/AuthContext';
import { useCapabilities } from '../hooks/useCapabilities';
import { SendMoneyModal } from './SendMoneyModal';
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
        <ActivityIndicator />
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
      <Text style={styles.balance}>{balance.toFixed(2)} ₽</Text>
      <Text style={styles.label}>Мой номер участника: {profile.participant_number}</Text>

      <Pressable style={styles.secondaryButton} onPress={() => setShowQr((v) => !v)}>
        <Text style={styles.secondaryButtonText}>{showQr ? 'Скрыть QR' : 'Показать мой QR'}</Text>
      </Pressable>

      {showQr ? (
        <View style={styles.qrBox}>
          <QRCode value={encodeParticipantCode(profile.participant_number)} size={200} />
        </View>
      ) : null}

      <Pressable style={styles.primaryButton} onPress={() => setSendOpen(true)}>
        <Text style={styles.primaryButtonText}>Отправить</Text>
      </Pressable>

      <Text style={styles.sectionTitle}>Журнал операций</Text>
      {journal.length === 0 ? (
        <Text style={styles.label}>Пока нет операций</Text>
      ) : (
        journal.map((row) => {
          const outgoing = row.from_profile_id === session?.user.id;
          const counterparty = outgoing
            ? row.to_profile?.full_name ?? row.to_team?.name ?? '—'
            : row.from_profile?.full_name ?? row.from_team?.name ?? 'Система';
          return (
            <View key={row.id} style={styles.journalRow}>
              <View>
                <Text style={styles.journalCounterparty}>{counterparty}</Text>
                <Text style={styles.journalKind}>{KIND_LABEL[row.kind]}</Text>
              </View>
              <Text style={outgoing ? styles.amountOut : styles.amountIn}>
                {outgoing ? '-' : '+'}
                {row.amount.toFixed(2)} ₽
              </Text>
            </View>
          );
        })
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
    backgroundColor: '#fff',
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
  },
  balance: {
    fontSize: 32,
    fontWeight: '700',
    marginTop: 8,
  },
  label: {
    fontSize: 13,
    color: '#666',
    marginTop: 4,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    marginTop: 20,
    marginBottom: 8,
  },
  qrBox: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  primaryButton: {
    backgroundColor: '#111',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 8,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  secondaryButtonText: {
    fontWeight: '600',
  },
  journalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#ddd',
  },
  journalCounterparty: {
    fontSize: 15,
    fontWeight: '600',
  },
  journalKind: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  amountOut: {
    color: '#c00',
    fontWeight: '600',
  },
  amountIn: {
    color: '#0a7d2c',
    fontWeight: '600',
  },
});
