import type { MaterialCommunityIcons } from '@expo/vector-icons';

export type RoleKey = 'admin' | 'organizer' | 'sideCommander' | 'teamCommander' | 'trader' | 'player';

export const ROLE_ORDER: RoleKey[] = ['player', 'organizer', 'sideCommander', 'teamCommander', 'trader', 'admin'];

export const ROLE_META: Record<RoleKey, { label: string; icon: keyof typeof MaterialCommunityIcons.glyphMap }> = {
  admin: { label: 'Админ', icon: 'shield-account-outline' },
  organizer: { label: 'Организатор', icon: 'clipboard-list-outline' },
  sideCommander: { label: 'Командующий стороной', icon: 'flag-outline' },
  teamCommander: { label: 'Командир команды', icon: 'account-group-outline' },
  trader: { label: 'Торговец', icon: 'storefront-outline' },
  player: { label: 'Игрок', icon: 'home-outline' },
};
