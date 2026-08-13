import { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { supabase } from '../lib/supabase';
import type { PolygonMap } from '../lib/database.types';
import { ImageLightbox } from './ImageLightbox';
import { colors, radii } from '../lib/theme';

const BUCKET = 'polygon-maps';

function publicUrl(path: string) {
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

function isImage(contentType: string | null, fileName: string) {
  if (contentType) return contentType.startsWith('image/');
  return /\.(png|jpe?g|gif|webp|heic)$/i.test(fileName);
}

export function PolygonMapThumbnails({ polygonId }: { polygonId: string }) {
  const [maps, setMaps] = useState<PolygonMap[]>([]);
  const [lightboxUri, setLightboxUri] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from('polygon_maps')
      .select('*')
      .eq('polygon_id', polygonId)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        if (!cancelled) {
          setMaps((data ?? []).filter((m) => isImage(m.content_type, m.file_name)));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [polygonId]);

  if (maps.length === 0) return null;

  return (
    <View style={styles.row}>
      {maps.map((m) => (
        <Pressable
          key={m.id}
          onPress={() => setLightboxUri(publicUrl(m.storage_path))}
          accessibilityRole="button"
          accessibilityLabel="Открыть карту полигона"
        >
          <Image source={{ uri: publicUrl(m.storage_path) }} style={styles.thumb} />
        </Pressable>
      ))}
      <ImageLightbox uri={lightboxUri} onClose={() => setLightboxUri(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 6,
  },
  thumb: {
    width: 48,
    height: 48,
    borderRadius: radii.sm - 2,
    backgroundColor: colors.card,
  },
});
