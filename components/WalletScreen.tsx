import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useCapabilities } from '../hooks/useCapabilities';
import { SendMoneyModal } from './SendMoneyModal';
import { QrFullscreen } from './QrFullscreen';
import { EmptyState } from './EmptyState';
import { colors, font, radii, sizes, spacing } from '../lib/theme';
import { formatDate, formatMoney, formatTime } from '../lib/format';
import type { PersonalTransaction, PersonalTransactionKind } from '../lib/database.types';

type JournalRow = PersonalTransaction & {
  from_profile: { full_name: string } | null;
  to_profile: { full_name: string } | null;
  from_team: { name: string } | null;
  to_team: { name: string } | null;
};

export const KIND_LABEL: Record<PersonalTransactionKind, string> = {
  deposit: 'Пополнение',
  team_to_participant: 'От команды',
  participant_to_team: 'В команду',
  participant_to_participant: 'Перевод',
  task_reward: 'Награда за задание',
  trader_charge: 'Списание у торговца',
  revival_charge: 'Оплата воскрешения',
};

const KIND_ICON: Record<PersonalTransactionKind, keyof typeof MaterialCommunityIcons.glyphMap> = {
  deposit: 'bank-plus',
  team_to_participant: 'account-group',
  participant_to_team: 'account-group',
  participant_to_participant: 'swap-horizontal',
  task_reward: 'clipboard-check-outline',
  trader_charge: 'storefront-outline',
  revival_charge: 'heart-pulse',
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
  const [refreshing, setRefreshing] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);

  const fetchData = useCallback(async () => {
    if (!session || !projectId) {
      setBalance(0);
      setJournal([]);
      return;
    }
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
  }, [session, projectId]);

  useEffect(() => {
    setLoading(true);
    fetchData().finally(() => setLoading(false));
  }, [fetchData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  }, [fetchData]);

  const onTransferDone = useCallback(async () => {
    setSendOpen(false);
    await Promise.all([fetchData(), capabilities.refresh()]);
  }, [fetchData, capabilities]);

  if (!profile || loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (!projectId) {
    return (
      <View style={styles.emptyWrap}>
        <EmptyState
          icon="cash-remove"
          title="Денег в этом проекте нет"
          message="Кошелёк работает в проектах с включённой экономикой. Выберите такой проект в плашке сверху."
        />
      </View>
    );
  }

  const groups = groupByDay(journal);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} colors={[colors.accent]} />}
    >
      <Text style={styles.title}>Кошелёк</Text>

      <View style={styles.balanceCard}>
        <Text style={styles.balanceLabel}>Баланс · №{profile.participant_number}</Text>
        <Text style={styles.balance} accessibilityLabel={`Баланс ${formatMoney(balance)}`}>
          {formatMoney(balance)}
        </Text>
        <View style={styles.actions}>
          <Action icon="send" label="Перевести" primary onPress={() => setSendOpen(true)} />
          <Action icon="qrcode" label="Мой QR" onPress={() => setQrOpen(true)} />
        </View>
      </View>

      <Text style={styles.sectionTitle}>Операции</Text>
      {journal.length === 0 ? (
        <EmptyState
          icon="receipt-text-outline"
          title="Операций пока нет"
          message="Здесь появятся переводы, награды за задания и списания у торговца."
        />
      ) : (
        groups.map((group) => (
          <View key={group.day} style={styles.dayGroup}>
            <Text style={styles.day}>{group.label}</Text>
            <View style={styles.card}>
              {group.rows.map((row, i) => {
                const outgoing = row.from_profile_id === session?.user.id;
                const counterparty = outgoing
                  ? (row.to_profile?.full_name ?? row.to_team?.name ?? null)
                  : (row.from_profile?.full_name ?? row.from_team?.name ?? null);
                const meta = [counterparty, formatTime(row.created_at)].filter(Boolean).join(' · ');
                return (
                  <View key={row.id} style={[styles.tx, i > 0 && styles.txDivider]}>
                    <View style={[styles.txIcon, outgoing ? styles.txIconOut : styles.txIconIn]}>
                      <MaterialCommunityIcons
                        name={KIND_ICON[row.kind]}
                        size={18}
                        color={outgoing ? colors.textMuted : colors.success}
                      />
                    </View>
                    <View style={styles.txText}>
                      <Text style={styles.txTitle} numberOfLines={1}>
                        {row.note || KIND_LABEL[row.kind]}
                      </Text>
                      <Text style={styles.txMeta} numberOfLines={1}>
                        {row.note ? `${KIND_LABEL[row.kind]} · ${meta}` : meta}
                      </Text>
                    </View>
                    <Text style={[styles.amount, !outgoing && styles.amountIn]}>
                      {outgoing ? '−' : '+'}
                      {formatMoney(row.amount)}
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>
        ))
      )}

      <SendMoneyModal
        visible={sendOpen}
        projectId={projectId}
        ownTeam={capabilities.ownMembership?.team ?? null}
        onClose={() => setSendOpen(false)}
        onSuccess={onTransferDone}
      />
      <QrFullscreen
        visible={qrOpen}
        onClose={() => setQrOpen(false)}
        participantNumber={profile.participant_number}
        name={profile.full_name}
        subtitle={capabilities.ownMembership?.team.name ?? null}
      />
    </ScrollView>
  );
}

function Action({
  icon,
  label,
  primary,
  onPress,
}: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  label: string;
  primary?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.action, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <View style={[styles.actionIcon, primary && styles.actionIconPrimary]}>
        <MaterialCommunityIcons name={icon} size={22} color={primary ? colors.onAccent : colors.text} />
      </View>
      <Text style={styles.actionLabel}>{label}</Text>
    </Pressable>
  );
}

// Newest first, bucketed by calendar day: "Сегодня", "Вчера", "4 окт".
function groupByDay(rows: JournalRow[]) {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const keyOf = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  const groups: { day: string; label: string; rows: JournalRow[] }[] = [];
  for (const row of rows) {
    const d = new Date(row.created_at);
    const day = keyOf(d);
    let group = groups[groups.length - 1];
    if (!group || group.day !== day) {
      const label = day === keyOf(today) ? 'Сегодня' : day === keyOf(yesterday) ? 'Вчера' : formatDate(d);
      group = { day, label, rows: [] };
      groups.push(group);
    }
    group.rows.push(row);
  }
  return groups;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxxl,
    gap: spacing.md,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
  },
  emptyWrap: {
    flex: 1,
    padding: spacing.lg,
    backgroundColor: colors.bg,
  },
  title: {
    fontFamily: font.heading,
    fontSize: 26,
    lineHeight: 32,
    color: colors.text,
  },
  balanceCard: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radii.lg + 2,
    padding: spacing.lg,
    gap: 2,
  },
  balanceLabel: {
    fontFamily: font.bodyMedium,
    fontSize: 13.5,
    color: colors.textMuted,
  },
  balance: {
    fontFamily: font.numeric,
    fontVariant: ['tabular-nums'],
    fontSize: 46,
    lineHeight: 52,
    color: colors.text,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.xl,
    marginTop: spacing.md,
  },
  action: {
    alignItems: 'center',
    gap: 6,
    minWidth: sizes.hitMin + 20,
  },
  pressed: {
    opacity: 0.7,
  },
  actionIcon: {
    width: 52,
    height: 52,
    borderRadius: radii.lg,
    backgroundColor: colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionIconPrimary: {
    backgroundColor: colors.accent,
  },
  actionLabel: {
    fontFamily: font.bodySemiBold,
    fontSize: 13,
    color: colors.text,
  },
  sectionTitle: {
    fontFamily: font.bodySemiBold,
    fontSize: 12,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: colors.textDim,
    marginTop: spacing.sm,
  },
  dayGroup: {
    gap: spacing.sm,
  },
  day: {
    fontFamily: font.bodySemiBold,
    fontSize: 13.5,
    color: colors.textMuted,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.md + 2,
  },
  tx: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: sizes.listRowTwoLine,
    paddingVertical: spacing.sm,
  },
  txDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.cardBorder,
  },
  txIcon: {
    width: 36,
    height: 36,
    borderRadius: radii.sm + 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  txIconIn: {
    backgroundColor: colors.successSoft,
  },
  txIconOut: {
    backgroundColor: colors.surface2,
  },
  txText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  txTitle: {
    fontFamily: font.bodySemiBold,
    fontSize: 15,
    color: colors.text,
  },
  txMeta: {
    fontFamily: font.body,
    fontSize: 13,
    color: colors.textMuted,
  },
  amount: {
    fontFamily: font.numeric,
    fontVariant: ['tabular-nums'],
    fontSize: 18,
    color: colors.text,
  },
  amountIn: {
    color: colors.success,
  },
});
