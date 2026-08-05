import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
} from 'expo-audio';
import { colors, font, radii, spacing } from '../lib/theme';

export type RecordedAudio = { uri: string; name: string; mimeType: string };

type Props = {
  value: RecordedAudio | null;
  onChange: (value: RecordedAudio | null) => void;
};

export function AudioRecorderField({ value, onChange }: Props) {
  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const player = useAudioPlayer(value?.uri ?? null);
  const playerStatus = useAudioPlayerStatus(player);
  const [recording, setRecording] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startRecording = async () => {
    setError(null);
    setPreparing(true);
    try {
      const status = await AudioModule.requestRecordingPermissionsAsync();
      if (!status.granted) {
        setError('Нет доступа к микрофону');
        return;
      }
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
      await audioRecorder.prepareToRecordAsync();
      audioRecorder.record();
      setRecording(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось начать запись');
    } finally {
      setPreparing(false);
    }
  };

  const stopRecording = async () => {
    try {
      await audioRecorder.stop();
      setRecording(false);
      if (audioRecorder.uri) {
        onChange({ uri: audioRecorder.uri, name: `voice-${Date.now()}.m4a`, mimeType: 'audio/m4a' });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось остановить запись');
    }
  };

  const discard = () => {
    player.pause();
    onChange(null);
  };

  return (
    <View style={styles.container}>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {value ? (
        <View style={styles.previewRow}>
          <Pressable
            style={styles.playButton}
            onPress={() => (playerStatus.playing ? player.pause() : player.play())}
          >
            <Text style={styles.playButtonText}>{playerStatus.playing ? '⏸' : '▶'}</Text>
          </Pressable>
          <Text style={styles.previewLabel} numberOfLines={1}>
            Голосовое сообщение
          </Text>
          <Pressable onPress={discard} hitSlop={8}>
            <Text style={styles.discardLink}>Удалить</Text>
          </Pressable>
        </View>
      ) : recording ? (
        <Pressable style={[styles.recordButton, styles.recordButtonActive]} onPress={stopRecording}>
          <Text style={styles.recordButtonText}>⏺ Остановить запись</Text>
        </Pressable>
      ) : (
        <Pressable style={styles.recordButton} onPress={startRecording} disabled={preparing}>
          {preparing ? (
            <ActivityIndicator color={colors.text} />
          ) : (
            <Text style={styles.recordButtonText}>🎙 Записать голосовое</Text>
          )}
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.sm + 2,
  },
  recordButton: {
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radii.md,
    paddingVertical: 13,
    alignItems: 'center',
    backgroundColor: colors.white10,
  },
  recordButtonActive: {
    borderColor: colors.danger,
    backgroundColor: 'rgba(209, 84, 63, 0.12)',
  },
  recordButtonText: {
    fontFamily: font.bodySemiBold,
    fontSize: 14,
    color: colors.text,
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radii.md,
    padding: 12,
  },
  playButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playButtonText: {
    color: colors.onAccent,
    fontSize: 13,
  },
  previewLabel: {
    flex: 1,
    fontFamily: font.body,
    fontSize: 12.5,
    color: colors.text,
  },
  discardLink: {
    fontFamily: font.body,
    fontSize: 11,
    color: colors.danger,
  },
  error: {
    fontFamily: font.body,
    color: colors.danger,
    marginBottom: spacing.sm,
    fontSize: 12,
  },
});
