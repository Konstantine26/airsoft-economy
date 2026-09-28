import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';
import { gamePalettes, type GamePalette } from './theme';

const KEY = 'sun_mode';

// Shared across every mounted user of the hook, so toggling on the game
// screen also flips the fullscreen QR and anything else in-game at once.
let current = false;
let loaded = false;
const listeners = new Set<(value: boolean) => void>();

function broadcast(value: boolean) {
  current = value;
  listeners.forEach((l) => l(value));
}

// "Солнце": a light, high-contrast palette for the in-game screens, which
// are the ones read outdoors in direct sunlight. Remembered per device.
export function useSunMode(): { sun: boolean; palette: GamePalette; toggle: () => void } {
  const [sun, setSun] = useState(current);

  useEffect(() => {
    listeners.add(setSun);
    if (!loaded) {
      loaded = true;
      AsyncStorage.getItem(KEY)
        .then((v) => broadcast(v === '1'))
        .catch(() => {});
    } else {
      setSun(current);
    }
    return () => {
      listeners.delete(setSun);
    };
  }, []);

  const toggle = useCallback(() => {
    const next = !current;
    broadcast(next);
    AsyncStorage.setItem(KEY, next ? '1' : '0').catch(() => {});
  }, []);

  return { sun, palette: sun ? gamePalettes.sun : gamePalettes.dark, toggle };
}
