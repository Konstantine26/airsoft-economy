import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { supabase } from '../lib/supabase';
import type { Polygon, PolygonMap, PolygonType } from '../lib/database.types';
import { ImageLightbox } from './ImageLightbox';
import { Card } from './Card';
import { Chip } from './Chip';
import { Button } from './Button';
import { TextField } from './TextField';
import { colors, font, radii, spacing } from '../lib/theme';

const BUCKET = 'polygon-maps';

const TYPES: PolygonType[] = ['built_up', 'forest', 'field', 'sqb', 'mixed'];
const TYPE_LABEL: Record<PolygonType, string> = {
  built_up: 'Застройка',
  forest: 'Лес',
  field: 'Поле',
  sqb: 'SQB',
  mixed: 'Смешанный',
};

function publicUrl(path: string) {
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

function isImage(contentType: string | null, fileName: string) {
  if (contentType) return contentType.startsWith('image/');
  return /\.(png|jpe?g|gif|webp|heic)$/i.test(fileName);
}

export function PolygonsScreen() {
  const [polygons, setPolygons] = useState<Polygon[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Polygon | null>(null);
  const [maps, setMaps] = useState<PolygonMap[]>([]);
  const [uploading, setUploading] = useState(false);
  const [lightboxUri, setLightboxUri] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  const [name, setName] = useState('');
  const [country, setCountry] = useState('');
  const [region, setRegion] = useState('');
  const [city, setCity] = useState('');
  const [address, setAddress] = useState('');
  const [type, setType] = useState<PolygonType>('mixed');

  const [editName, setEditName] = useState('');
  const [editCountry, setEditCountry] = useState('');
  const [editRegion, setEditRegion] = useState('');
  const [editCity, setEditCity] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [editType, setEditType] = useState<PolygonType>('mixed');

  const loadPolygons = useCallback(async () => {
    const { data, error } = await supabase
      .from('polygons')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) setError(error.message);
    setPolygons(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadPolygons();
  }, [loadPolygons]);

  const loadMaps = useCallback(async (polygon: Polygon) => {
    const { data } = await supabase
      .from('polygon_maps')
      .select('*')
      .eq('polygon_id', polygon.id)
      .order('created_at', { ascending: false });
    setMaps(data ?? []);
  }, []);

  const createPolygon = async () => {
    if (!name.trim()) return;
    setError(null);
    const { data: userData } = await supabase.auth.getUser();
    const { error } = await supabase.from('polygons').insert({
      name: name.trim(),
      country: country.trim() || null,
      region: region.trim() || null,
      city: city.trim() || null,
      address: address.trim() || null,
      type,
      created_by: userData.user?.id,
    });
    if (error) {
      setError(error.message);
      return;
    }
    setName('');
    setCountry('');
    setRegion('');
    setCity('');
    setAddress('');
    setType('mixed');
    loadPolygons();
  };

  const startEditing = (polygon: Polygon) => {
    setEditName(polygon.name);
    setEditCountry(polygon.country ?? '');
    setEditRegion(polygon.region ?? '');
    setEditCity(polygon.city ?? '');
    setEditAddress(polygon.address ?? '');
    setEditType(polygon.type);
    setEditing(true);
  };

  const saveEdit = async () => {
    if (!selected || !editName.trim()) return;
    setError(null);
    const updates = {
      name: editName.trim(),
      country: editCountry.trim() || null,
      region: editRegion.trim() || null,
      city: editCity.trim() || null,
      address: editAddress.trim() || null,
      type: editType,
    };
    const { error } = await supabase.from('polygons').update(updates).eq('id', selected.id);
    if (error) {
      setError(error.message);
      return;
    }
    const updated = { ...selected, ...updates };
    setSelected(updated);
    setPolygons((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
    setEditing(false);
  };

  const deletePolygon = async (polygon: Polygon) => {
    setError(null);
    const { data: files } = await supabase.from('polygon_maps').select('*').eq('polygon_id', polygon.id);
    if (files && files.length > 0) {
      await supabase.storage.from(BUCKET).remove(files.map((f) => f.storage_path));
    }
    const { error } = await supabase.from('polygons').delete().eq('id', polygon.id);
    if (error) {
      setError(error.message);
      return;
    }
    setSelected(null);
    loadPolygons();
  };

  const uploadAsset = async (polygon: Polygon, uri: string, fileName: string, mimeType: string | null) => {
    setUploading(true);
    setError(null);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const arrayBuffer = await fetch(uri).then((res) => res.arrayBuffer());
      const path = `${polygon.id}/${Date.now()}-${fileName.replace(/[^\w.\-]+/g, '_')}`;
      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(path, arrayBuffer, { contentType: mimeType ?? undefined });
      if (uploadError) throw uploadError;

      const { error: insertError } = await supabase.from('polygon_maps').insert({
        polygon_id: polygon.id,
        storage_path: path,
        file_name: fileName,
        content_type: mimeType,
        created_by: userData.user?.id,
      });
      if (insertError) throw insertError;

      await loadMaps(polygon);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось загрузить файл');
    } finally {
      setUploading(false);
    }
  };

  const pickImages = async (polygon: Polygon) => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setError('Нет доступа к галерее');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      quality: 0.8,
    });
    if (result.canceled) return;
    for (const asset of result.assets) {
      const fileName = asset.fileName ?? asset.uri.split('/').pop() ?? 'image.jpg';
      await uploadAsset(polygon, asset.uri, fileName, asset.mimeType ?? 'image/jpeg');
    }
  };

  const pickFiles = async (polygon: Polygon) => {
    const result = await DocumentPicker.getDocumentAsync({ multiple: true, type: '*/*' });
    if (result.canceled) return;
    for (const asset of result.assets) {
      await uploadAsset(polygon, asset.uri, asset.name, asset.mimeType ?? null);
    }
  };

  const deleteMap = async (map: PolygonMap) => {
    setError(null);
    await supabase.storage.from(BUCKET).remove([map.storage_path]);
    const { error } = await supabase.from('polygon_maps').delete().eq('id', map.id);
    if (error) {
      setError(error.message);
      return;
    }
    setMaps((prev) => prev.filter((m) => m.id !== map.id));
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (selected) {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <Pressable onPress={() => setSelected(null)}>
          <Text style={styles.back}>‹ Полигоны</Text>
        </Pressable>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {editing ? (
          <>
            <Text style={styles.sectionTitle}>Редактирование полигона</Text>
            <TextField style={styles.input} placeholder="Название" value={editName} onChangeText={setEditName} />
            <TextField style={styles.input} placeholder="Страна" value={editCountry} onChangeText={setEditCountry} />
            <TextField style={styles.input} placeholder="Регион" value={editRegion} onChangeText={setEditRegion} />
            <TextField
              style={styles.input}
              placeholder="Населённый пункт"
              value={editCity}
              onChangeText={setEditCity}
            />
            <TextField style={styles.input} placeholder="Адрес" value={editAddress} onChangeText={setEditAddress} />

            <Text style={styles.label}>Тип полигона</Text>
            <View style={styles.chips}>
              {TYPES.map((t) => (
                <Chip key={t} label={TYPE_LABEL[t]} selected={editType === t} onPress={() => setEditType(t)} />
              ))}
            </View>

            <View style={styles.row}>
              <Button title="Сохранить" onPress={saveEdit} style={styles.flexButton} />
              <Button title="Отмена" variant="secondary" onPress={() => setEditing(false)} style={styles.flexButton} />
            </View>
          </>
        ) : (
          <>
            <Text style={styles.title}>{selected.name}</Text>
            <Text style={styles.subtitle}>{locationLine(selected)}</Text>
            <Text style={styles.subtitle}>Тип: {TYPE_LABEL[selected.type]}</Text>
            <Pressable onPress={() => startEditing(selected)}>
              <Text style={styles.editLink}>Редактировать</Text>
            </Pressable>
          </>
        )}

        <Text style={styles.sectionTitle}>Карты полигона</Text>
        {maps.length === 0 ? <Text style={styles.label}>Файлов пока нет</Text> : null}
        <View style={styles.mapsGrid}>
          {maps.map((m) => (
            <View key={m.id} style={styles.mapCard}>
              {isImage(m.content_type, m.file_name) ? (
                <Pressable onPress={() => setLightboxUri(publicUrl(m.storage_path))}>
                  <Image source={{ uri: publicUrl(m.storage_path) }} style={styles.mapImage} />
                </Pressable>
              ) : (
                <View style={[styles.mapImage, styles.mapFilePlaceholder]}>
                  <Text style={styles.mapFileIcon}>📄</Text>
                </View>
              )}
              <Text style={styles.mapFileName} numberOfLines={1}>
                {m.file_name}
              </Text>
              <Pressable onPress={() => deleteMap(m)}>
                <Text style={styles.deleteLink}>Удалить</Text>
              </Pressable>
            </View>
          ))}
        </View>

        <View style={styles.row}>
          <Button
            title={uploading ? 'Загрузка…' : 'Добавить изображение'}
            onPress={() => pickImages(selected)}
            disabled={uploading}
            style={styles.flexButton}
          />
          <Button
            title={uploading ? 'Загрузка…' : 'Добавить файл'}
            onPress={() => pickFiles(selected)}
            disabled={uploading}
            style={styles.flexButton}
          />
        </View>

        <Button title="Удалить полигон" variant="danger" onPress={() => deletePolygon(selected)} style={styles.dangerSpacing} />

        <ImageLightbox uri={lightboxUri} onClose={() => setLightboxUri(null)} />
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Полигоны</Text>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.list}>
        {polygons.map((p) => (
          <Pressable
            key={p.id}
            onPress={() => {
              setSelected(p);
              setEditing(false);
              loadMaps(p);
            }}
          >
            <Card>
              <Text style={styles.cardTitle}>{p.name}</Text>
              <Text style={styles.label}>{locationLine(p)}</Text>
              <Text style={styles.label}>Тип: {TYPE_LABEL[p.type]}</Text>
            </Card>
          </Pressable>
        ))}
      </View>

      <Text style={styles.sectionTitle}>Новый полигон</Text>
      <TextField style={styles.input} placeholder="Название" value={name} onChangeText={setName} />
      <TextField style={styles.input} placeholder="Страна" value={country} onChangeText={setCountry} />
      <TextField style={styles.input} placeholder="Регион" value={region} onChangeText={setRegion} />
      <TextField style={styles.input} placeholder="Населённый пункт" value={city} onChangeText={setCity} />
      <TextField style={styles.input} placeholder="Адрес" value={address} onChangeText={setAddress} />

      <Text style={styles.label}>Тип полигона</Text>
      <View style={styles.chips}>
        {TYPES.map((t) => (
          <Chip key={t} label={TYPE_LABEL[t]} selected={type === t} onPress={() => setType(t)} />
        ))}
      </View>

      <Button title="Добавить полигон" onPress={createPolygon} />
    </ScrollView>
  );
}

function locationLine(p: Polygon) {
  return [p.country, p.region, p.city, p.address].filter(Boolean).join(', ') || 'Расположение не указано';
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: 40,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
  },
  back: {
    fontFamily: font.body,
    color: colors.textMuted,
    marginBottom: spacing.sm,
  },
  title: {
    fontFamily: font.heading,
    fontSize: 19,
    color: colors.text,
  },
  subtitle: {
    fontFamily: font.body,
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 4,
  },
  sectionTitle: {
    fontFamily: font.heading,
    fontSize: 16,
    color: colors.text,
    marginTop: spacing.lg,
    marginBottom: spacing.sm + 2,
  },
  list: {
    gap: spacing.sm,
  },
  cardTitle: {
    fontFamily: font.bodySemiBold,
    fontSize: 14,
    color: colors.text,
  },
  label: {
    fontFamily: font.body,
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 4,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 6,
    marginBottom: spacing.sm + 2,
  },
  input: {
    marginBottom: spacing.sm + 2,
  },
  row: {
    flexDirection: 'row',
    gap: 8,
    marginTop: spacing.lg,
  },
  flexButton: {
    flex: 1,
  },
  dangerSpacing: {
    marginTop: spacing.md,
  },
  editLink: {
    fontFamily: font.bodySemiBold,
    color: colors.accent,
    fontSize: 13,
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  error: {
    fontFamily: font.body,
    color: colors.danger,
    marginBottom: spacing.md,
  },
  mapsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: spacing.sm,
  },
  mapCard: {
    width: 110,
  },
  mapImage: {
    width: 110,
    height: 110,
    borderRadius: radii.sm,
    backgroundColor: colors.card,
  },
  mapFilePlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapFileIcon: {
    fontSize: 32,
  },
  mapFileName: {
    fontFamily: font.body,
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 4,
  },
  deleteLink: {
    fontFamily: font.body,
    fontSize: 11,
    color: colors.danger,
    marginTop: 2,
  },
});
