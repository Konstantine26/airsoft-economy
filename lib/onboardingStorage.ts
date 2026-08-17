import AsyncStorage from '@react-native-async-storage/async-storage';
import type { RoleKey } from './roles';

const keyFor = (userId: string, role: RoleKey) => `onboarding_seen:${userId}:${role}`;

export async function hasSeenOnboarding(userId: string, role: RoleKey): Promise<boolean> {
  try {
    const value = await AsyncStorage.getItem(keyFor(userId, role));
    return value === '1';
  } catch {
    return true;
  }
}

export async function markOnboardingSeen(userId: string, role: RoleKey): Promise<void> {
  try {
    await AsyncStorage.setItem(keyFor(userId, role), '1');
  } catch {
    // ignore — non-critical, worst case the tutorial reappears once more
  }
}
