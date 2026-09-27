import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { confirmAsync } from '../lib/confirm';
import { Avatar } from './Avatar';
import { Button } from './Button';
import { ListRow } from './ListRow';
import { ScreenHeader } from './ScreenHeader';
import { StatusPill } from './StatusPill';
import { colors, radii, spacing } from '../lib/theme';

export type MoreItem = {
  key: string;
  label: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  subtitle?: string;
  badge?: number;
  onPress: () => void;
};

type Props = {
  // Role-specific entries that didn't fit in the tab bar (player stats,
  // admin migrations), listed above the account section.
  roleItems: MoreItem[];
  unreadCount: number;
  onOpenProfile: () => void;
  onOpenNotifications: () => void;
  onOpenHelp: () => void;
  // Signing out during a game drops it, so say so in the confirmation.
  inGame: boolean;
};

export function MoreScreen({ roleItems, unreadCount, onOpenProfile, onOpenNotifications, onOpenHelp, inGame }: Props) {
  const { profile, session, signOut } = useAuth();

  const confirmSignOut = async () => {
    const ok = await confirmAsync(
      'Выйти из аккаунта?',
      inGame
        ? 'Идёт игра: после выхода она закроется на этом устройстве. Чтобы вернуться, понадобятся email и пароль.'
        : 'Чтобы вернуться, понадобятся email и пароль.',
      'Выйти'
    );
    if (ok) signOut();
  };

  const accountItems: MoreItem[] = [
    {
      key: 'notifications',
      label: 'Уведомления',
      icon: 'bell-outline',
      badge: unreadCount,
      onPress: onOpenNotifications,
    },
    { key: 'help', label: 'Справка', icon: 'help-circle-outline', subtitle: 'Как устроены роли, игры и деньги', onPress: onOpenHelp },
  ];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <ScreenHeader title="Ещё" />

      <View style={styles.inset}>
        <View style={styles.group}>
          <ListRow
            title={profile?.full_name || 'Без позывного'}
            subtitle={[profile ? `№${profile.participant_number}` : null, session?.user.email].filter(Boolean).join(' · ')}
            leading={<Avatar uri={profile?.avatar_url} name={profile?.full_name} size={40} />}
            onPress={onOpenProfile}
            divider={false}
            accessibilityLabel="Открыть профиль"
          />
        </View>

        {roleItems.length > 0 ? <Group items={roleItems} /> : null}
        <Group items={accountItems} />

        <Button title="Выйти из аккаунта" icon="logout" variant="danger" onPress={confirmSignOut} style={styles.signOut} />
      </View>
    </ScrollView>
  );
}

function Group({ items }: { items: MoreItem[] }) {
  return (
    <View style={styles.group}>
      {items.map((item, i) => (
        <ListRow
          key={item.key}
          title={item.label}
          subtitle={item.subtitle}
          leading={
            <View style={styles.icon}>
              <MaterialCommunityIcons name={item.icon} size={19} color={colors.textMuted} />
            </View>
          }
          trailing={item.badge ? <StatusPill label={String(item.badge)} tone="danger" /> : undefined}
          onPress={item.onPress}
          divider={i < items.length - 1}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    paddingTop: spacing.sm,
    paddingBottom: spacing.xxxl,
  },
  inset: {
    paddingHorizontal: spacing.lg,
    gap: spacing.lg,
  },
  group: {
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.md + 2,
  },
  icon: {
    width: 34,
    height: 34,
    borderRadius: radii.sm + 2,
    backgroundColor: colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  signOut: {
    marginTop: spacing.lg,
  },
});

