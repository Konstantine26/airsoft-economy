import { useState } from 'react';
import { Image, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { supabase } from '../lib/supabase';
import type { GameAttachment } from '../lib/database.types';
import { isImageFile } from '../lib/files';
import { ImageLightbox } from './ImageLightbox';
import { colors, font, radii } from '../lib/theme';

const ATTACHMENTS_BUCKET = 'game-attachments';

function publicAttachmentUrl(path: string) {
  return supabase.storage.from(ATTACHMENTS_BUCKET).getPublicUrl(path).data.publicUrl;
}

export function GameAttachmentsGrid({ attachments }: { attachments: GameAttachment[] }) {
  const [lightboxUri, setLightboxUri] = useState<string | null>(null);

  if (attachments.length === 0) return null;

  return (
    <View style={styles.grid}>
      {attachments.map((a) => (
        <View key={a.id} style={styles.card}>
          {isImageFile(a.content_type, a.file_name) ? (
            <Pressable
              onPress={() => setLightboxUri(publicAttachmentUrl(a.storage_path))}
              accessibilityRole="button"
              accessibilityLabel={`Открыть изображение ${a.file_name}`}
            >
              <Image source={{ uri: publicAttachmentUrl(a.storage_path) }} style={styles.image} />
            </Pressable>
          ) : (
            <View style={[styles.image, styles.filePlaceholder]}>
              <Text style={styles.fileIcon}>📄</Text>
            </View>
          )}
          <Text style={styles.fileName} numberOfLines={1}>
            {a.file_name}
          </Text>
          <Pressable onPress={() => Linking.openURL(publicAttachmentUrl(a.storage_path))}>
            <Text style={styles.downloadLink}>Скачать</Text>
          </Pressable>
        </View>
      ))}

      <ImageLightbox uri={lightboxUri} onClose={() => setLightboxUri(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  card: {
    width: 110,
  },
  image: {
    width: 110,
    height: 110,
    borderRadius: radii.sm,
    backgroundColor: colors.card,
  },
  filePlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  fileIcon: {
    fontSize: 32,
  },
  fileName: {
    fontFamily: font.body,
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 4,
  },
  downloadLink: {
    fontFamily: font.bodySemiBold,
    fontSize: 11,
    color: colors.accent,
    marginTop: 2,
  },
});
