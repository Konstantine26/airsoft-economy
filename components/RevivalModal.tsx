import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { supabase } from '../lib/supabase';
import { decodeParticipantCode } from '../lib/participantCode';
import { formatMoney } from '../lib/format';
import { Sheet } from './Sheet';
import { Button } from './Button';
import { TextField } from './TextField';
import { Avatar } from './Avatar';
import { colors, font, radii, spacing } from '../lib/theme';

type Mode = 'search' | 'scan' | 'confirm';

const REVIVAL_ERROR_TRANSLATIONS: [string, string][] = [
  ['insufficient balance', 'Недостаточно средств для воскрешения'],
  ['revival cost is not configured', 'Стоимость воскрешения для этой стороны не задана'],
  ['paid revival is not enabled', 'Платное воскрешение выключено в этой игре'],
  ['only a trader or commander', 'Вы не назначены торговцем или командующим стороны этого участника'],
  ['economy is not enabled', 'Экономика выключена в этом проекте'],
  ['this project is archived', 'Проект архивирован'],
];

function translateRevivalError(message: string): string {
  const found = REVIVAL_ERROR_TRANSLATIONS.find(([needle]) => message.includes(needle));
  return found ? found[1] : message;
}

type ParticipantRow = {
  profileId: string;
  participantNumber: number;
  fullName: string;
  avatarUrl: string | null;
  sideId: string;
  sideName: string;
  cost: number | null;
  balance: number;
};

type Props = {
  visible: boolean;
  projectId: string;
  gameId: string;
  sideIds: string[];
  onClose: () => void;
  onSuccess: () => void;
};

export function RevivalModal({ visible, projectId, gameId, sideIds, onClose, onSuccess }: Props) {
  const [mode, setMode] = useState<Mode>('search');
  const [query, setQuery] = useState('');
  const [participants, setParticipants] = useState<ParticipantRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [target, setTarget] = useState<ParticipantRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [scanLocked, setScanLocked] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();

  const load = useCallback(async () => {
    setLoading(true);
    const [sidesRes, teamSidesRes, participantsRes] = await Promise.all([
      supabase.from('game_sides').select('id, name, revival_cost').eq('game_id', gameId),
      supabase.from('game_team_sides').select('team_id, side_id').eq('game_id', gameId),
      supabase
        .from('game_participants')
        .select('profile_id, team_id, side_id, status, profile:profiles(full_name, avatar_url, participant_number)')
        .eq('game_id', gameId)
        .eq('status', 'confirmed'),
    ]);

    const sideMap = new Map<string, { name: string; cost: number | null }>();
    for (const s of sidesRes.data ?? []) {
      if (sideIds.includes(s.id)) sideMap.set(s.id, { name: s.name, cost: s.revival_cost });
    }

    const teamSideMap = new Map<string, string>();
    for (const row of teamSidesRes.data ?? []) teamSideMap.set(row.team_id, row.side_id);

    const baseRows = ((participantsRes.data as any[]) ?? [])
      .map((row) => ({ row, effectiveSideId: row.side_id ?? teamSideMap.get(row.team_id) ?? null }))
      .filter(({ effectiveSideId }) => effectiveSideId && sideIds.includes(effectiveSideId))
      .map(({ row, effectiveSideId }) => {
        const side = sideMap.get(effectiveSideId as string);
        return {
          profileId: row.profile_id as string,
          participantNumber: row.profile?.participant_number ?? 0,
          fullName: row.profile?.full_name || '(без имени)',
          avatarUrl: row.profile?.avatar_url ?? null,
          sideId: effectiveSideId as string,
          sideName: side?.name ?? '',
          cost: side?.cost ?? null,
        };
      });

    const balanceMap = new Map<string, number>();
    const profileIds = baseRows.map((r) => r.profileId);
    if (profileIds.length > 0) {
      const { data: balancesData } = await supabase
        .from('project_profile_balances')
        .select('profile_id, balance')
        .eq('project_id', projectId)
        .in('profile_id', profileIds);
      for (const b of balancesData ?? []) balanceMap.set(b.profile_id, b.balance);
    }

    const rows: ParticipantRow[] = baseRows.map((r) => ({ ...r, balance: balanceMap.get(r.profileId) ?? 0 }));
    setParticipants(rows);
    setLoading(false);
  }, [gameId, sideIds, projectId]);

  useEffect(() => {
    if (!visible) return;
    setMode('search');
    setQuery('');
    setTarget(null);
    setError(null);
    setScanLocked(false);
    load();
  }, [visible, load]);

  const selectTarget = (row: ParticipantRow) => {
    setError(null);
    setTarget(row);
    setMode('confirm');
  };

  const trimmedQuery = query.trim();
  const results = !trimmedQuery
    ? []
    : participants.filter((p) =>
        /^\d+$/.test(trimmedQuery)
          ? String(p.participantNumber).includes(trimmedQuery)
          : p.fullName.toLowerCase().includes(trimmedQuery.toLowerCase())
      );

  const handleBarcodeScanned = (result: { data: string }) => {
    if (scanLocked) return;
    const n = decodeParticipantCode(result.data);
    if (n === null) return;
    setScanLocked(true);
    const found = participants.find((p) => p.participantNumber === n);
    if (!found) {
      setError('Участник с таким QR-кодом не найден в составе вашей стороны');
      setScanLocked(false);
      return;
    }
    selectTarget(found);
  };

  const submit = async () => {
    if (!target) return;
    setSubmitting(true);
    setError(null);
    const { error: rpcError } = await supabase.rpc('revive_participant', {
      p_project_id: projectId,
      p_game_id: gameId,
      p_from_profile_id: target.profileId,
    });
    setSubmitting(false);
    if (rpcError) {
      setError(translateRevivalError(rpcError.message));
      return;
    }
    onSuccess();
    onClose();
  };

  return (
    <Sheet visible={visible} onRequestClose={onClose}>
      <Text style={styles.title}>Возродить участника</Text>

      {mode === 'search' ? (
        <>
          <TextField
            style={styles.input}
            placeholder="Номер участника или позывной"
            value={query}
            onChangeText={setQuery}
          />
          <Button title="Сканировать QR-код" variant="secondary" onPress={() => setMode('scan')} style={styles.gap} />

          {loading ? (
            <ActivityIndicator color={colors.accent} style={styles.centerGap} />
          ) : !trimmedQuery ? (
            <Text style={styles.label}>Введите номер или позывной, чтобы найти игрока</Text>
          ) : results.length === 0 ? (
            <Text style={styles.label}>Никого не нашлось в составе вашей стороны</Text>
          ) : (
            <View style={styles.list}>
              {results.map((p) => {
                const low = p.cost != null && p.cost > 0 && p.balance < p.cost;
                return (
                  <Pressable key={p.profileId} style={styles.resultRow} onPress={() => selectTarget(p)}>
                    <View style={styles.resultIdentity}>
                      <Avatar uri={p.avatarUrl} name={p.fullName} size={24} />
                      <Text style={styles.resultName}>
                        {p.fullName} · №{p.participantNumber}
                      </Text>
                    </View>
                    <View style={styles.resultMeta}>
                      <Text style={styles.resultSide}>{p.sideName}</Text>
                      <Text style={[styles.resultBalance, low && styles.balanceLow]}>{formatMoney(p.balance)}</Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          )}
          <Pressable onPress={onClose} style={styles.cancelLink}>
            <Text style={styles.cancelLinkText}>Отмена</Text>
          </Pressable>
        </>
      ) : null}

      {mode === 'scan' ? (
        <>
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
          <Button
            title="Назад"
            variant="secondary"
            onPress={() => {
              setMode('search');
              setError(null);
              setScanLocked(false);
            }}
          />
        </>
      ) : null}

      {mode === 'confirm' && target ? (
        (() => {
          const noCost = target.cost === null || target.cost <= 0;
          const insufficientBalance = !noCost && target.balance < (target.cost as number);
          return (
            <>
              <View style={styles.confirmRow}>
                <Avatar uri={target.avatarUrl} name={target.fullName} size={40} />
                <View>
                  <Text style={styles.confirmName}>{target.fullName}</Text>
                  <Text style={styles.label}>
                    №{target.participantNumber} · {target.sideName}
                  </Text>
                </View>
              </View>
              <Text style={[styles.balanceText, insufficientBalance && styles.balanceLow]}>
                Баланс игрока: {formatMoney(target.balance)}
              </Text>
              {noCost ? (
                <Text style={styles.error}>Организатор ещё не задал стоимость воскрешения для этой стороны</Text>
              ) : (
                <Text style={[styles.costText, insufficientBalance && styles.balanceLow]}>
                  Стоимость воскрешения: {formatMoney(target.cost as number)}
                </Text>
              )}
              {error ? <Text style={styles.error}>{error}</Text> : null}
              <View style={styles.actions}>
                <Button
                  title="Назад"
                  variant="secondary"
                  onPress={() => {
                    setMode('search');
                    setTarget(null);
                    setError(null);
                  }}
                  style={styles.actionButton}
                />
                <Button
                  title="Воскресить"
                  onPress={submit}
                  loading={submitting}
                  disabled={noCost || insufficientBalance}
                  style={styles.actionButton}
                />
              </View>
            </>
          );
        })()
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
    marginBottom: spacing.sm + 2,
  },
  gap: {
    marginBottom: spacing.md,
  },
  centerGap: {
    marginVertical: spacing.md,
  },
  list: {
    gap: 8,
    marginBottom: spacing.md,
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radii.md,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  resultIdentity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  resultName: {
    fontFamily: font.bodySemiBold,
    fontSize: 13,
    color: colors.text,
  },
  resultMeta: {
    alignItems: 'flex-end',
  },
  resultSide: {
    fontFamily: font.body,
    fontSize: 11.5,
    color: colors.textMuted,
  },
  resultBalance: {
    fontFamily: font.bodySemiBold,
    fontSize: 12.5,
    color: colors.text,
    marginTop: 2,
  },
  balanceText: {
    fontFamily: font.bodySemiBold,
    fontSize: 13,
    color: colors.text,
    marginBottom: 4,
  },
  balanceLow: {
    color: colors.danger,
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
  confirmRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: spacing.md,
  },
  confirmName: {
    fontFamily: font.bodySemiBold,
    fontSize: 15,
    color: colors.text,
  },
  costText: {
    fontFamily: font.bodySemiBold,
    fontSize: 14,
    color: colors.text,
    marginBottom: spacing.md,
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
