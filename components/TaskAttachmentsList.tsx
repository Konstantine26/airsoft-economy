import { useState } from 'react';
import { Image, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { supabase } from '../lib/supabase';
import type { TaskAttachment } from '../lib/database.types';
import { ImageLightbox } from './ImageLightbox';
import { colors, font, radii } from '../lib/theme';

const BUCKET = 'task-attachments';

function publicUrl(path: string) {
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

export function TaskAttachmentsList({ attachments }: { attachments: TaskAttachment[] }) {
  const [lightboxUri, setLightboxUri] = useState<string | null>(null);
  if (attachments.length === 0) return null;

  const images = attachments.filter((a) => a.kind === 'image');
  const audios = attachments.filter((a) => a.kind === 'audio');
  const files = attachments.filter((a) => a.kind === 'file');

  return (
    <View style={styles.container}>
      {images.length > 0 ? (
        <View style={styles.imageGrid}>
          {images.map((a) => (
            <Pressable key={a.id} onPress={() => setLightboxUri(publicUrl(a.storage_path))}>
              <Image source={{ uri: publicUrl(a.storage_path) }} style={styles.image} />
            </Pressable>
          ))}
        </View>
      ) : null}

      {audios.map((a) => (
        <AudioAttachmentRow key={a.id} attachment={a} />
      ))}

      {files.map((a) => (
        <Pressable key={a.id} style={styles.fileRow} onPress={() => Linking.openURL(publicUrl(a.storage_path))}>
          <Text style={styles.fileIcon}>📄</Text>
          <Text style={styles.fileName} numberOfLines={1}>
            {a.file_name}
          </Text>
        </Pressable>
      ))}

      <ImageLightbox uri={lightboxUri} onClose={() => setLightboxUri(null)} />
    </View>
  );
}

function AudioAttachmentRow({ attachment }: { attachment: TaskAttachment }) {
  const player = useAudioPlayer(publicUrl(attachment.storage_path));
  const status = useAudioPlayerStatus(player);
  return (
    <Pressable style={styles.audioRow} onPress={() => (status.playing ? player.pause() : player.play())}>
      <View style={styles.playButton}>
        <Text style={styles.playButtonText}>{status.playing ? '⏸' : '▶'}</Text>
      </View>
      <Text style={styles.fileName} numberOfLines={1}>
        {attachment.file_name || 'Голосовое сообщение'}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 8,
  },
  imageGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  image: {
    width: 90,
    height: 90,
    borderRadius: radii.sm,
    backgroundColor: colors.card,
  },
  audioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radii.md,
    padding: 10,
  },
  playButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playButtonText: {
    color: colors.onAccent,
    fontSize: 12,
  },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radii.md,
    padding: 10,
  },
  fileIcon: {
    fontSize: 18,
  },
  fileName: {
    flex: 1,
    fontFamily: font.body,
    fontSize: 12.5,
    color: colors.text,
  },
});
