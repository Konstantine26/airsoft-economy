import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Brightness from 'expo-brightness';
import { useKeepAwake } from 'expo-keep-awake';
import { useEffect } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { encodeParticipantCode } from '../lib/participantCode';
import { font, sizes, spacing } from '../lib/theme';

type Props = {
  visible: boolean;
  onClose: () => void;
  participantNumber: number;
  name: string;
  subtitle?: string | null;
};

// What a trader or commander scans. Always black on white regardless of
// theme (scanners want maximum contrast), with the screen forced to full
// brightness and kept awake while it's shown.
export function QrFullscreen({ visible, onClose, participantNumber, name, subtitle }: Props) {
  return (
    <Modal visible={visible} animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      {visible ? (
        <QrContent onClose={onClose} participantNumber={participantNumber} name={name} subtitle={subtitle} />
      ) : null}
    </Modal>
  );
}

function QrContent({ onClose, participantNumber, name, subtitle }: Omit<Props, 'visible'>) {
  useKeepAwake('qr-fullscreen');
  useFullBrightness();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const qrSize = Math.min(width - 64, height * 0.5, 420);

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.sm, paddingBottom: insets.bottom + spacing.lg }]}>
      <View style={styles.top}>
        <Pressable
          onPress={onClose}
          style={styles.close}
          accessibilityRole="button"
          accessibilityLabel="Закрыть QR-код"
        >
          <MaterialCommunityIcons name="close" size={28} color={INK} />
        </Pressable>
      </View>

      <View style={styles.center}>
        <Text style={styles.caption}>Номер участника</Text>
        <Text style={styles.number} accessibilityLabel={`Номер участника ${participantNumber}`}>
          <Text style={styles.numberSign}>№</Text>
          {participantNumber}
        </Text>
        <View style={styles.qr} accessibilityRole="image" accessibilityLabel="QR-код участника">
          <QRCode value={encodeParticipantCode(participantNumber)} size={qrSize} color={INK} backgroundColor="#FFFFFF" />
        </View>
        <Text style={styles.name} numberOfLines={1}>
          {name}
        </Text>
        {subtitle ? (
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>

      <Text style={styles.hint}>Яркость на максимуме, пока открыт этот экран</Text>
    </View>
  );
}

// Raise the screen to full brightness for scanning, then hand it back.
// Web has no brightness API, so this is native-only.
function useFullBrightness() {
  useEffect(() => {
    if (Platform.OS === 'web') return;
    let previous: number | null = null;
    let cancelled = false;
    (async () => {
      try {
        previous = await Brightness.getBrightnessAsync();
        if (!cancelled) await Brightness.setBrightnessAsync(1);
      } catch {
        // Brightness is a convenience; the QR still shows without it.
      }
    })();
    return () => {
      cancelled = true;
      (async () => {
        try {
          if (Platform.OS === 'android') {
            // Hands the activity back to the system-wide setting,
            // including auto-brightness.
            await Brightness.restoreSystemBrightnessAsync();
          } else if (previous !== null) {
            await Brightness.setBrightnessAsync(previous);
          }
        } catch {
          // ignore
        }
      })();
    };
  }, []);
}

const INK = '#0B0D0E';

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: spacing.lg,
  },
  top: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  close: {
    width: sizes.hitMin + 4,
    height: sizes.hitMin + 4,
    borderRadius: 24,
    backgroundColor: '#ECEEEB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  caption: {
    fontFamily: font.bodySemiBold,
    fontSize: 13,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: '#5C6466',
  },
  number: {
    fontFamily: font.numeric,
    fontVariant: ['tabular-nums'],
    fontSize: 64,
    lineHeight: 68,
    color: INK,
  },
  // Rajdhani has no "№" glyph.
  numberSign: {
    fontFamily: font.bodyBold,
    fontSize: 40,
    color: '#5C6466',
  },
  qr: {
    padding: spacing.md,
    backgroundColor: '#FFFFFF',
  },
  name: {
    fontFamily: font.heading,
    fontSize: 22,
    color: INK,
  },
  subtitle: {
    fontFamily: font.body,
    fontSize: 15,
    color: '#3A4245',
  },
  hint: {
    fontFamily: font.body,
    fontSize: 13,
    color: '#5C6466',
    textAlign: 'center',
  },
});
