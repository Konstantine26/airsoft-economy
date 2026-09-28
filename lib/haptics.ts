import * as Haptics from 'expo-haptics';

// Fire-and-forget wrappers: haptics are a nicety, and on web or devices
// without a vibration motor the calls reject -- never let that surface.

export function hapticSelection() {
  Haptics.selectionAsync().catch(() => {});
}

export function hapticSuccess() {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
}

export function hapticWarning() {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
}

// A deliberate, weighty moment: starting a game.
export function hapticHeavy() {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
}
