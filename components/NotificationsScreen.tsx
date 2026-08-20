import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import type { Notification, NotificationKind } from '../lib/database.types';
import { Button } from './Button';
import { colors, font, radii, spacing } from '../lib/theme';

type Props = {
  visible: boolean;
  onClose: () => void;
};

const KIND_ICON: Record<NotificationKind, keyof typeof MaterialCommunityIcons.glyphMap> = {
  task_assigned: 'clipboard-check-outline',
  task_reward: 'cash-check',
  money_received: 'cash-plus',
  request_confirmed: 'check-circle-outline',
  request_rejected: 'close-circle-outline',
};

const dateFormatter = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

export function NotificationsScreen({ visible, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const { profile } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadIds, setUnreadIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!profile) return;
    const { data, error: loadError } = await supabase
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);
    if (loadError) {
      // Postgres would say 42P01 (undefined_table); PostgREST's own schema
      // cache miss says PGRST205 ("Could not find the table ... in the
      // schema cache") -- confirmed live against the cloud test project,
      // which is still missing this table. Either way: this server hasn't
      // applied 032_notifications.sql yet. Surface it instead of silently
      // rendering an empty list, which would look identical to "genuinely
      // no notifications" otherwise.
      setError(
        loadError.code === '42P01' || loadError.code === 'PGRST205' || /does not exist|schema cache/i.test(loadError.message)
          ? 'Уведомления ещё не настроены на этом сервере (не применена supabase/032_notifications.sql).'
          : loadError.message
      );
      setNotifications([]);
      setUnreadIds(new Set());
      return;
    }
    setError(null);
    const rows = data ?? [];
    setNotifications(rows);
    setUnreadIds(new Set(rows.filter((n) => !n.read_at).map((n) => n.id)));
  }, [profile]);

  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [visible, load]);

  useEffect(() => {
    // Opening the list is what clears the badge -- mark everything that
    // was unread when we loaded as read, but keep showing it as "new" in
    // this same viewing (via unreadIds, captured before this fires) so
    // the visual distinction isn't lost mid-session.
    if (!visible || unreadIds.size === 0 || !profile) return;
    supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('profile_id', profile.id).is('read_at', null);
  }, [visible, unreadIds, profile]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const clearAll = async () => {
    if (!profile) return;
    await supabase.from('notifications').delete().eq('profile_id', profile.id);
    setNotifications([]);
    setUnreadIds(new Set());
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Уведомления</Text>
          <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Закрыть уведомления" hitSlop={8}>
            <MaterialCommunityIcons name="close" size={22} color={colors.textMuted} />
          </Pressable>
        </View>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.accent} />
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={styles.content}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} colors={[colors.accent]} />}
          >
            {error ? (
              <Text style={styles.error}>{error}</Text>
            ) : notifications.length === 0 ? (
              <Text style={styles.empty}>Пока ничего нет</Text>
            ) : (
              <View style={styles.list}>
                {notifications.map((n) => (
                  <View key={n.id} style={[styles.row, unreadIds.has(n.id) && styles.rowUnread]}>
                    <MaterialCommunityIcons name={KIND_ICON[n.kind]} size={20} color={unreadIds.has(n.id) ? colors.accent : colors.textMuted} />
                    <View style={styles.rowBody}>
                      <Text style={styles.rowTitle}>{n.title}</Text>
                      {n.body ? <Text style={styles.rowText}>{n.body}</Text> : null}
                      <Text style={styles.rowDate}>{dateFormatter.format(new Date(n.created_at))}</Text>
                    </View>
                  </View>
                ))}
              </View>
            )}

            {notifications.length > 0 ? (
              <Button title="Очистить всё" variant="secondary" onPress={clearAll} style={styles.clearButton} />
            ) : null}
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
  },
  headerTitle: {
    fontFamily: font.heading,
    fontSize: 19,
    color: colors.text,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: 40,
  },
  empty: {
    fontFamily: font.body,
    fontSize: 13,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.xl,
  },
  error: {
    fontFamily: font.body,
    fontSize: 13,
    color: colors.danger,
    textAlign: 'center',
    marginTop: spacing.xl,
  },
  list: {
    gap: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    gap: 10,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radii.lg,
    padding: spacing.md,
  },
  rowUnread: {
    borderColor: colors.accentSoftBorder,
    backgroundColor: colors.accentSoft,
  },
  rowBody: {
    flex: 1,
  },
  rowTitle: {
    fontFamily: font.bodySemiBold,
    fontSize: 14,
    color: colors.text,
  },
  rowText: {
    fontFamily: font.body,
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 2,
  },
  rowDate: {
    fontFamily: font.body,
    fontSize: 11,
    color: colors.textDim,
    marginTop: 4,
  },
  clearButton: {
    marginTop: spacing.lg,
  },
});
