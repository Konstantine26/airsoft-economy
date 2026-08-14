import { Alert, Platform } from 'react-native';

// Alert.alert silently no-ops on react-native-web (no native dialog, no
// window.confirm fallback, no error) -- neither button callback ever fires.
// Route through window.confirm on web instead so confirmation dialogs
// actually work in the web build, not just native.
export function confirmAsync(title: string, message: string, confirmLabel = 'Подтвердить'): Promise<boolean> {
  if (Platform.OS === 'web') {
    return Promise.resolve(window.confirm(`${title}\n\n${message}`));
  }
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: 'Отмена', style: 'cancel', onPress: () => resolve(false) },
      { text: confirmLabel, style: 'destructive', onPress: () => resolve(true) },
    ]);
  });
}
