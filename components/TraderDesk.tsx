import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { supabase } from '../lib/supabase';
import { decodeParticipantCode } from '../lib/participantCode';
import { callMoneyRpc, moneyErrorMessage, newRequestId } from '../lib/money';
import { formatMoney } from '../lib/format';
import { hapticWarning } from '../lib/haptics';
import { AmountPad, parseAmount } from './AmountPad';
import { Avatar } from './Avatar';
import { Banner } from './Banner';
import { Button } from './Button';
import { EmptyState } from './EmptyState';
import { HoldToConfirmButton } from './HoldToConfirmButton';
import { ListRow } from './ListRow';
import { Segmented } from './Segmented';
import { Sheet } from './Sheet';
import { TextField } from './TextField';
import { useToast } from './Toast';
import { colors, font, radii, spacing } from '../lib/theme';

type Participant = {
  kind: 'participant';
  id: string;
  number: number;
  name: string;
  avatarUrl: string | null;
  sideName: string;
  revivalCost: number | null;
  balance: number | null;
};

type TeamTarget = {
  kind: 'team';
  id: string;
  name: string;
  balance: number | null;
};

type Target = Participant | TeamTarget;
type Action = 'charge' | 'revive';

type Props = {
  gameId: string;
  projectId: string | null;
  sideIds: string[];
  revivalEnabled: boolean;
};

// The trader's counter during a game: the camera is already on, a scan
// opens the player with their balance, and charging or reviving is one
// hold. Only participants and teams on the trader's own sides are found.
export function TraderDesk({ gameId, projectId, sideIds, revivalEnabled }: Props) {
  const showToast = useToast();
  const [permission, requestPermission] = useCameraPermissions();
  const [loading, setLoading] = useState(true);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [teams, setTeams] = useState<TeamTarget[]>([]);
  const [query, setQuery] = useState('');
  const [scanError, setScanError] = useState<string | null>(null);
  const [target, setTarget] = useState<Target | null>(null);
  const scanLock = useRef(false);

  const load = useCallback(async () => {
    const [sidesRes, teamSidesRes, participantsRes] = await Promise.all([
      supabase.from('game_sides').select('id, name, revival_cost').eq('game_id', gameId),
      supabase.from('game_team_sides').select('team_id, side_id, team:teams(name)').eq('game_id', gameId),
      supabase
        .from('game_participants')
        .select('profile_id, team_id, side_id, profile:profiles(full_name, avatar_url, participant_number)')
        .eq('game_id', gameId)
        .eq('status', 'confirmed'),
    ]);

    const sides = new Map<string, { name: string; cost: number | null }>();
    for (const s of sidesRes.data ?? []) sides.set(s.id, { name: s.name, cost: s.revival_cost });
    const teamSide = new Map<string, string>();
    for (const row of teamSidesRes.data ?? []) teamSide.set(row.team_id, row.side_id);

    const rows = ((participantsRes.data as any[]) ?? [])
      .map((row) => ({ row, sideId: (row.side_id ?? teamSide.get(row.team_id) ?? null) as string | null }))
      .filter(({ sideId }) => !!sideId && sideIds.includes(sideId));
    const teamRows = ((teamSidesRes.data as any[]) ?? []).filter((row) => sideIds.includes(row.side_id));

    let balances = new Map<string, number>();
    let teamBalances = new Map<string, number>();
    if (projectId) {
      const [pb, tb] = await Promise.all([
        rows.length
          ? supabase
              .from('project_profile_balances')
              .select('profile_id, balance')
              .eq('project_id', projectId)
              .in('profile_id', rows.map(({ row }) => row.profile_id))
          : Promise.resolve({ data: [] as { profile_id: string; balance: number }[] }),
        teamRows.length
          ? supabase
              .from('project_team_balances')
              .select('team_id, balance')
              .eq('project_id', projectId)
              .in('team_id', teamRows.map((r) => r.team_id))
          : Promise.resolve({ data: [] as { team_id: string; balance: number }[] }),
      ]);
      balances = new Map((pb.data ?? []).map((b) => [b.profile_id, b.balance]));
      teamBalances = new Map((tb.data ?? []).map((b) => [b.team_id, b.balance]));
    }

    setParticipants(
      rows
        .map(({ row, sideId }) => {
          const side = sides.get(sideId as string);
          return {
            kind: 'participant' as const,
            id: row.profile_id as string,
            number: row.profile?.participant_number ?? 0,
            name: row.profile?.full_name || '(без имени)',
            avatarUrl: row.profile?.avatar_url ?? null,
            sideName: side?.name ?? '',
            revivalCost: side?.cost ?? null,
            // Missing row = never had money yet = 0. RLS hiding the table
            // would show up as every balance missing; treat that the same.
            balance: balances.get(row.profile_id) ?? 0,
          };
        })
        .sort((a, b) => a.number - b.number)
    );
    setTeams(
      teamRows.map((r) => ({
        kind: 'team' as const,
        id: r.team_id,
        name: r.team?.name ?? '',
        balance: teamBalances.has(r.team_id) ? (teamBalances.get(r.team_id) as number) : null,
      }))
    );
  }, [gameId, sideIds, projectId]);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  const handleScan = ({ data }: { data: string }) => {
    if (scanLock.current || target) return;
    const n = decodeParticipantCode(data);
    if (n === null) return;
    scanLock.current = true;
    const found = participants.find((p) => p.number === n);
    if (!found) {
      hapticWarning();
      setScanError(`№${n} не играет за ваши стороны в этой игре`);
      setTimeout(() => {
        scanLock.current = false;
      }, 1500);
      return;
    }
    setScanError(null);
    setTarget(found);
  };

  const closeTarget = () => {
    setTarget(null);
    // Short pause so the camera doesn't instantly re-read the same code.
    setTimeout(() => {
      scanLock.current = false;
    }, 800);
  };

  const onDone = (message: string) => {
    showToast({ message });
    closeTarget();
    load();
  };

  if (!projectId) {
    return (
      <EmptyState
        icon="cash-remove"
        title="Экономика выключена"
        message="В проекте этой игры нет денег — списывать и воскрешать за деньги нельзя."
      />
    );
  }

  const q = query.trim().toLowerCase();
  const results = q
    ? participants.filter((p) => (/^\d+$/.test(q) ? String(p.number).includes(q) : p.name.toLowerCase().includes(q)))
    : [];

  return (
    <View style={styles.wrap}>
      <View style={styles.cameraCard}>
        {permission?.granted ? (
          <>
            <CameraView
              style={styles.camera}
              active={!target}
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={target ? undefined : handleScan}
            />
            <View pointerEvents="none" style={styles.frame}>
              <View style={[styles.corner, styles.tl]} />
              <View style={[styles.corner, styles.tr]} />
              <View style={[styles.corner, styles.bl]} />
              <View style={[styles.corner, styles.br]} />
            </View>
            <View pointerEvents="none" style={styles.cameraHint}>
              <Text style={styles.cameraHintText}>Наведите на QR участника</Text>
            </View>
          </>
        ) : (
          <View style={styles.cameraOff}>
            <MaterialCommunityIcons name="qrcode-scan" size={40} color={colors.textMuted} />
            <Text style={styles.cameraOffText}>Сканер QR работает через камеру</Text>
            <Button title="Включить камеру" icon="camera" onPress={requestPermission} />
          </View>
        )}
      </View>

      {scanError ? <Banner tone="warning" message={scanError} /> : null}

      <TextField
        placeholder="Номер или позывной"
        value={query}
        onChangeText={setQuery}
        keyboardType="default"
        autoCorrect={false}
        accessibilityLabel="Найти участника по номеру или позывному"
      />

      {loading ? (
        <ActivityIndicator color={colors.accent} style={styles.loader} />
      ) : q ? (
        results.length === 0 ? (
          <Text style={styles.muted}>Никого не нашлось на ваших сторонах</Text>
        ) : (
          <View style={styles.group}>
            {results.slice(0, 20).map((p, i) => (
              <ListRow
                key={p.id}
                title={`${p.name} · №${p.number}`}
                subtitle={`${p.sideName}${p.balance != null ? ` · ${formatMoney(p.balance)}` : ''}`}
                leading={<Avatar uri={p.avatarUrl} name={p.name} size={36} />}
                divider={i < Math.min(results.length, 20) - 1}
                onPress={() => setTarget(p)}
              />
            ))}
          </View>
        )
      ) : teams.length > 0 ? (
        <>
          <Text style={styles.section}>Команды ваших сторон</Text>
          <View style={styles.group}>
            {teams.map((t, i) => (
              <ListRow
                key={t.id}
                title={t.name}
                subtitle={t.balance != null ? `Бюджет ${formatMoney(t.balance)}` : null}
                leading={
                  <View style={styles.teamIcon}>
                    <MaterialCommunityIcons name="account-group" size={18} color={colors.textMuted} />
                  </View>
                }
                divider={i < teams.length - 1}
                onPress={() => setTarget(t)}
              />
            ))}
          </View>
        </>
      ) : null}

      <ChargeSheet
        target={target}
        gameId={gameId}
        projectId={projectId}
        revivalEnabled={revivalEnabled}
        onClose={closeTarget}
        onDone={onDone}
      />
    </View>
  );
}

function ChargeSheet({
  target,
  gameId,
  projectId,
  revivalEnabled,
  onClose,
  onDone,
}: {
  target: Target | null;
  gameId: string;
  projectId: string;
  revivalEnabled: boolean;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const canRevive = revivalEnabled && target?.kind === 'participant' && target.revivalCost != null;
  const [action, setAction] = useState<Action>('charge');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const intent = useRef<{ key: string; id: string } | null>(null);

  useEffect(() => {
    // Revival is the common case at a trader's counter, so open on it
    // whenever it's possible.
    setAction(canRevive ? 'revive' : 'charge');
    setAmount('');
    setError(null);
    intent.current = null;
  }, [target, canRevive]);

  if (!target) return <Sheet visible={false} onRequestClose={onClose}>{null}</Sheet>;

  const cost = action === 'revive' && target.kind === 'participant' ? (target.revivalCost ?? 0) : parseAmount(amount);
  const short = target.balance != null && cost > target.balance ? cost - target.balance : 0;

  const submit = async () => {
    if (cost <= 0 || short > 0) return;
    const intentKey = `${action}:${target.id}:${cost}`;
    if (intent.current?.key !== intentKey) intent.current = { key: intentKey, id: newRequestId() };
    setSubmitting(true);
    setError(null);
    const { error: rpcError } =
      action === 'revive'
        ? await callMoneyRpc(
            'revive_participant',
            { p_project_id: projectId, p_game_id: gameId, p_from_profile_id: target.id },
            intent.current.id
          )
        : target.kind === 'participant'
          ? await callMoneyRpc(
              'trader_charge_participant',
              { p_project_id: projectId, p_game_id: gameId, p_from_profile_id: target.id, p_amount: cost },
              intent.current.id
            )
          : await callMoneyRpc(
              'trader_charge_team',
              { p_project_id: projectId, p_game_id: gameId, p_from_team_id: target.id, p_amount: cost },
              intent.current.id
            );
    setSubmitting(false);
    if (rpcError) {
      setError(moneyErrorMessage(rpcError));
      return;
    }
    intent.current = null;
    onDone(action === 'revive' ? `${target.name} воскрешён · ${formatMoney(cost)}` : `Списано ${formatMoney(cost)} · ${target.name}`);
  };

  return (
    <Sheet visible onRequestClose={onClose}>
      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={styles.who}>
          {target.kind === 'participant' ? (
            <Avatar uri={target.avatarUrl} name={target.name} size={48} />
          ) : (
            <View style={[styles.teamIcon, styles.teamIconLg]}>
              <MaterialCommunityIcons name="account-group" size={24} color={colors.textMuted} />
            </View>
          )}
          <View style={styles.whoText}>
            <Text style={styles.whoName} numberOfLines={1}>
              {target.kind === 'participant' ? `${target.name} · №${target.number}` : `Команда «${target.name}»`}
            </Text>
            <Text style={styles.whoMeta}>
              {target.kind === 'participant' ? `${target.sideName} · ` : ''}
              {target.balance != null ? `на счету ${formatMoney(target.balance)}` : 'баланс команды недоступен'}
            </Text>
          </View>
        </View>

        {canRevive ? (
          <Segmented
            items={[
              { key: 'revive', label: 'Воскресить' },
              { key: 'charge', label: 'Списать' },
            ]}
            value={action}
            onChange={setAction}
            style={styles.segmented}
          />
        ) : null}

        {action === 'revive' && target.kind === 'participant' ? (
          <View style={styles.revive}>
            <Text style={styles.reviveCost}>{formatMoney(cost)}</Text>
            <Text style={[styles.reviveNote, short > 0 && styles.reviveShort]}>
              {short > 0
                ? `Не хватает ${formatMoney(short)} — пусть пополнит счёт или попросит перевод`
                : `Стоимость воскрешения на стороне «${target.sideName}»${
                    target.balance != null ? ` · останется ${formatMoney(target.balance - cost)}` : ''
                  }`}
            </Text>
          </View>
        ) : (
          <AmountPad value={amount} onChange={setAmount} available={target.balance} />
        )}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <HoldToConfirmButton
          tone={action === 'revive' ? 'success' : 'primary'}
          title={
            cost <= 0
              ? 'Введите сумму'
              : action === 'revive'
                ? `Воскресить за ${formatMoney(cost)}`
                : `Списать ${formatMoney(cost)}`
          }
          onConfirm={submit}
          loading={submitting}
          disabled={cost <= 0 || short > 0}
          style={styles.confirm}
        />
        <Button title="Отмена" variant="ghost" onPress={onClose} />
      </ScrollView>
    </Sheet>
  );
}

const CORNER = 30;

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.md,
  },
  cameraCard: {
    height: 300,
    borderRadius: radii.lg,
    overflow: 'hidden',
    backgroundColor: colors.cardSoft,
  },
  camera: {
    flex: 1,
  },
  frame: {
    position: 'absolute',
    width: 190,
    height: 190,
    left: '50%',
    top: '50%',
    marginLeft: -95,
    marginTop: -105,
  },
  corner: {
    position: 'absolute',
    width: CORNER,
    height: CORNER,
    borderColor: '#FFFFFF',
  },
  tl: { top: 0, left: 0, borderTopWidth: 4, borderLeftWidth: 4, borderTopLeftRadius: 6 },
  tr: { top: 0, right: 0, borderTopWidth: 4, borderRightWidth: 4, borderTopRightRadius: 6 },
  bl: { bottom: 0, left: 0, borderBottomWidth: 4, borderLeftWidth: 4, borderBottomLeftRadius: 6 },
  br: { bottom: 0, right: 0, borderBottomWidth: 4, borderRightWidth: 4, borderBottomRightRadius: 6 },
  cameraHint: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: spacing.md,
    alignItems: 'center',
  },
  cameraHintText: {
    fontFamily: font.bodySemiBold,
    fontSize: 14,
    color: '#FFFFFF',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radii.pill,
    overflow: 'hidden',
  },
  cameraOff: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.lg,
  },
  cameraOffText: {
    fontFamily: font.body,
    fontSize: 14.5,
    color: colors.textMuted,
    textAlign: 'center',
  },
  loader: {
    marginTop: spacing.lg,
  },
  muted: {
    fontFamily: font.body,
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
  },
  section: {
    fontFamily: font.bodySemiBold,
    fontSize: 12,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: colors.textDim,
    marginTop: spacing.sm,
  },
  group: {
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.md + 2,
  },
  teamIcon: {
    width: 36,
    height: 36,
    borderRadius: radii.sm + 2,
    backgroundColor: colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  teamIconLg: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  who: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  whoText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  whoName: {
    fontFamily: font.heading,
    fontSize: 18,
    color: colors.text,
  },
  whoMeta: {
    fontFamily: font.body,
    fontSize: 14,
    color: colors.textMuted,
  },
  segmented: {
    marginBottom: spacing.md,
  },
  revive: {
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.lg,
  },
  reviveCost: {
    fontFamily: font.numeric,
    fontVariant: ['tabular-nums'],
    fontSize: 52,
    lineHeight: 58,
    color: colors.text,
  },
  reviveNote: {
    fontFamily: font.body,
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
  },
  reviveShort: {
    color: colors.danger,
  },
  error: {
    fontFamily: font.bodyMedium,
    fontSize: 14,
    color: colors.danger,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  confirm: {
    marginTop: spacing.md,
  },
});
