import AsyncStorage from '@react-native-async-storage/async-storage';

export type ActiveGame = { gameId: string; projectId: string };

const keyFor = (userId: string) => `active_game:${userId}`;

export async function getActiveGame(userId: string): Promise<ActiveGame | null> {
  try {
    const value = await AsyncStorage.getItem(keyFor(userId));
    return value ? (JSON.parse(value) as ActiveGame) : null;
  } catch {
    return null;
  }
}

export async function setActiveGame(userId: string, game: ActiveGame): Promise<void> {
  try {
    await AsyncStorage.setItem(keyFor(userId), JSON.stringify(game));
  } catch {
    // ignore — worst case the lock doesn't survive a reload
  }
}

export async function clearActiveGame(userId: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(keyFor(userId));
  } catch {
    // ignore
  }
}
