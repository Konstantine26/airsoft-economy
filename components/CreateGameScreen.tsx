import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { supabase } from '../lib/supabase';
import { GAME_TYPES, GAME_TYPE_LABEL, type GameType } from '../lib/gameTypes';
import { Button } from './Button';
import { Card } from './Card';
import { DateTimeField } from './DateTimeField';
import { FieldRow } from './FieldRow';
import { PickerSheet, type PickerOption } from './PickerSheet';
import { TextField } from './TextField';
import { colors, font, radii, spacing } from '../lib/theme';
import type { Game, Polygon, Project } from '../lib/database.types';

const COVER_BUCKET = 'game-covers';
const ATTACHMENTS_BUCKET = 'game-attachments';
const MAX_MATERIALS = 5;
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const DEFAULT_SIDE_NAMES = ['Белые', 'Красные'];

type QueuedMaterial = { uri: string; name: string; mimeType: string | null };
type PickerKind = 'project' | 'gameType' | 'city' | 'polygon' | null;
type EditableGame = Game & { polygon: Polygon | null };

function durationHoursOf(game?: EditableGame | null): string {
  if (!game?.starts_at || !game.ends_at) return '';
  const diffMs = new Date(game.ends_at).getTime() - new Date(game.starts_at).getTime();
  if (!Number.isFinite(diffMs) || diffMs <= 0) return '';
  const hours = Math.round((diffMs / 3600000) * 100) / 100;
  return String(hours);
}

type Props = {
  projects: Project[];
  editGame?: EditableGame | null;
  onDone: (gameId: string) => void;
  onCancel: () => void;
};

export function CreateGameScreen({ projects, editGame, onDone, onCancel }: Props) {
  const [projectId, setProjectId] = useState<string | null>(
    editGame?.project_id ?? (projects.length === 1 ? projects[0].id : null)
  );
  const [gameType, setGameType] = useState<GameType | null>(editGame?.game_type ?? null);
  const [city, setCity] = useState<string | null>(editGame?.polygon?.city ?? null);
  const [polygonId, setPolygonId] = useState<string | null>(editGame?.polygon_id ?? null);
  const [polygons, setPolygons] = useState<Polygon[]>([]);
  const [name, setName] = useState(editGame?.name ?? '');
  const [startsAt, setStartsAt] = useState(editGame?.starts_at ?? '');
  const [durationHours, setDurationHours] = useState(() => durationHoursOf(editGame));
  const [isPaid, setIsPaid] = useState(editGame?.is_paid ?? false);
  const [price, setPrice] = useState(editGame?.price != null ? String(editGame.price) : '');
  const [description, setDescription] = useState(editGame?.description ?? '');
  const [rules, setRules] = useState(editGame?.rules ?? '');
  const [cover, setCover] = useState<{ uri: string; mimeType: string | null } | null>(null);
  const [existingCoverUrl] = useState<string | null>(editGame?.cover_url ?? null);
  const [materials, setMaterials] = useState<QueuedMaterial[]>([]);
  const [openPicker, setOpenPicker] = useState<PickerKind>(null);
  const [submitting, setSubmitting] = useState<'draft' | 'published' | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from('polygons')
      .select('*')
      .order('name', { ascending: true })
      .then(({ data }) => setPolygons(data ?? []));
  }, []);

  const selectedProject = projects.find((p) => p.id === projectId) ?? null;

  useEffect(() => {
    if (selectedProject?.default_game_type) setGameType((prev) => prev ?? selectedProject.default_game_type);
  }, [selectedProject]);

  const cities = useMemo(
    () => Array.from(new Set(polygons.map((p) => p.city).filter((c): c is string => !!c))).sort(),
    [polygons]
  );
  const polygonsForCity = useMemo(
    () => (city ? polygons.filter((p) => p.city === city) : polygons),
    [polygons, city]
  );
  const selectedPolygon = polygons.find((p) => p.id === polygonId) ?? null;

  const canSaveDraft = name.trim().length > 0 && !!projectId && !!polygonId;
  const canPublish =
    !!projectId && name.trim().length > 0 && !!gameType && !!polygonId && startsAt.trim().length > 0 && description.trim().length > 0;

  const pickCover = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setError('Нет доступа к галерее');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (result.canceled) return;
    const asset = result.assets[0];
    if (asset.fileSize && asset.fileSize > MAX_FILE_BYTES) {
      setError('Файл обложки больше 5 МБ');
      return;
    }
    setError(null);
    setCover({ uri: asset.uri, mimeType: asset.mimeType ?? 'image/jpeg' });
  };

  const addMaterials = (incoming: QueuedMaterial[]) => {
    const room = MAX_MATERIALS - materials.length;
    if (room <= 0) {
      setError(`Можно добавить не больше ${MAX_MATERIALS} материалов`);
      return;
    }
    setError(null);
    setMaterials((prev) => [...prev, ...incoming.slice(0, room)]);
  };

  const pickMaterialImages = async () => {
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
    const oversized = result.assets.some((a) => a.fileSize && a.fileSize > MAX_FILE_BYTES);
    if (oversized) {
      setError('Один или несколько файлов больше 5 МБ');
      return;
    }
    addMaterials(
      result.assets.map((a) => ({
        uri: a.uri,
        name: a.fileName ?? a.uri.split('/').pop() ?? 'image.jpg',
        mimeType: a.mimeType ?? 'image/jpeg',
      }))
    );
  };

  const pickMaterialFiles = async () => {
    const result = await DocumentPicker.getDocumentAsync({ multiple: true, type: '*/*' });
    if (result.canceled) return;
    const oversized = result.assets.some((a) => a.size && a.size > MAX_FILE_BYTES);
    if (oversized) {
      setError('Один или несколько файлов больше 5 МБ');
      return;
    }
    addMaterials(result.assets.map((a) => ({ uri: a.uri, name: a.name, mimeType: a.mimeType ?? null })));
  };

  const promptAddMaterial = () => {
    if (materials.length >= MAX_MATERIALS) {
      setError(`Можно добавить не больше ${MAX_MATERIALS} материалов`);
      return;
    }
    Alert.alert('Добавить материал', undefined, [
      { text: 'Фото', onPress: pickMaterialImages },
      { text: 'Файл', onPress: pickMaterialFiles },
      { text: 'Отмена', style: 'cancel' },
    ]);
  };

  const removeMaterial = (idx: number) => setMaterials((prev) => prev.filter((_, i) => i !== idx));

  const submit = async (status: 'draft' | 'published') => {
    setError(null);
    if (status === 'draft' && !canSaveDraft) {
      setError('Укажите название, проект и полигон');
      return;
    }
    if (status === 'published' && !canPublish) {
      setError('Заполните обязательные поля, отмеченные *');
      return;
    }
    if (!projectId || !name.trim() || !polygonId) return;

    const startsAtDate = startsAt.trim() ? new Date(startsAt.trim()) : null;
    if (startsAtDate && Number.isNaN(startsAtDate.getTime())) {
      setError('Не удалось разобрать дату начала игры');
      return;
    }
    let endsAtDate: Date | null = null;
    const durationValue = durationHours.trim() ? Number(durationHours.trim().replace(',', '.')) : null;
    if (durationValue !== null && (!Number.isFinite(durationValue) || durationValue <= 0)) {
      setError('Длительность должна быть больше нуля');
      return;
    }
    if (startsAtDate && durationValue) {
      endsAtDate = new Date(startsAtDate.getTime() + durationValue * 3600 * 1000);
    }

    let priceValue: number | null = null;
    if (isPaid && price.trim()) {
      priceValue = Number(price.trim().replace(',', '.'));
      if (!Number.isFinite(priceValue) || priceValue <= 0) {
        setError('Цена должна быть больше нуля');
        return;
      }
    }
    if (isPaid && status === 'published' && priceValue === null) {
      setError('Укажите цену для платной игры');
      return;
    }

    setSubmitting(status);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const gamePayload = {
        name: name.trim(),
        polygon_id: polygonId,
        starts_at: startsAtDate ? startsAtDate.toISOString() : null,
        ends_at: endsAtDate ? endsAtDate.toISOString() : null,
        description: description.trim() || null,
        game_type: gameType,
        is_paid: isPaid,
        price: isPaid ? priceValue : null,
        rules: rules.trim() || null,
        status,
      };

      let gameId: string;
      if (editGame) {
        const { error: updateError } = await supabase.from('games').update(gamePayload).eq('id', editGame.id);
        if (updateError) throw updateError;
        gameId = editGame.id;
      } else {
        const { data: createdGame, error: gameError } = await supabase
          .from('games')
          .insert({ ...gamePayload, project_id: projectId, created_by: userData.user?.id })
          .select('id')
          .single();
        if (gameError || !createdGame) throw gameError ?? new Error('Не удалось создать игру');
        gameId = createdGame.id;

        const { error: sidesError } = await supabase
          .from('game_sides')
          .insert(DEFAULT_SIDE_NAMES.map((sideName) => ({ game_id: gameId, name: sideName })));
        if (sidesError) throw sidesError;
      }

      if (cover) {
        const ext = cover.mimeType?.split('/')[1] ?? 'jpg';
        const path = `${gameId}/cover.${ext}`;
        const arrayBuffer = await fetch(cover.uri).then((res) => res.arrayBuffer());
        const { error: coverUploadError } = await supabase.storage
          .from(COVER_BUCKET)
          .upload(path, arrayBuffer, { contentType: cover.mimeType ?? undefined, upsert: true });
        if (coverUploadError) throw coverUploadError;
        const publicUrl = supabase.storage.from(COVER_BUCKET).getPublicUrl(path).data.publicUrl;
        const { error: coverUpdateError } = await supabase
          .from('games')
          .update({ cover_url: `${publicUrl}?v=${Date.now()}` })
          .eq('id', gameId);
        if (coverUpdateError) throw coverUpdateError;
      }

      if (!editGame) {
        for (const material of materials) {
          const arrayBuffer = await fetch(material.uri).then((res) => res.arrayBuffer());
          const path = `${gameId}/${Date.now()}-${material.name.replace(/[^\w.\-]+/g, '_')}`;
          const { error: uploadError } = await supabase.storage
            .from(ATTACHMENTS_BUCKET)
            .upload(path, arrayBuffer, { contentType: material.mimeType ?? undefined });
          if (uploadError) throw uploadError;
          const { error: attachmentError } = await supabase.from('game_attachments').insert({
            game_id: gameId,
            storage_path: path,
            file_name: material.name,
            content_type: material.mimeType,
            created_by: userData.user?.id,
          });
          if (attachmentError) throw attachmentError;
        }
      }

      onDone(gameId);
    } catch (e) {
      const message =
        e instanceof Error
          ? e.message
          : e && typeof e === 'object' && 'message' in e && typeof (e as { message: unknown }).message === 'string'
            ? (e as { message: string }).message
            : null;
      setError(message || 'Не удалось создать игру');
    } finally {
      setSubmitting(null);
    }
  };

  const projectOptions: PickerOption[] = projects.map((p) => ({ id: p.id, label: p.name }));
  const gameTypeOptions: PickerOption[] = GAME_TYPES.map((t) => ({ id: t, label: GAME_TYPE_LABEL[t] }));
  const cityOptions: PickerOption[] = cities.map((c) => ({ id: c, label: c }));
  const polygonOptions: PickerOption[] = polygonsForCity.map((p) => ({ id: p.id, label: p.name, sublabel: p.city ?? undefined }));
  const coverPreviewUri = cover?.uri ?? existingCoverUrl;
  const saveStatus: 'draft' | 'published' = editGame?.status ?? 'draft';
  const showPublishButton = !editGame || editGame.status === 'draft';

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.header}>
        <Pressable onPress={onCancel} accessibilityRole="button" accessibilityLabel="Отменить" hitSlop={8}>
          <Text style={styles.back}>‹ Отмена</Text>
        </Pressable>
        <Text style={styles.title}>{editGame ? 'Редактирование события' : 'Создание события'}</Text>
        <Pressable onPress={() => submit(saveStatus)} accessibilityRole="button" accessibilityLabel="Сохранить" hitSlop={8}>
          <Text style={styles.headerSave}>Сохранить</Text>
        </Pressable>
      </View>

      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent} showsVerticalScrollIndicator={false}>
        <Pressable onPress={pickCover} style={styles.cover} accessibilityRole="button" accessibilityLabel="Добавить обложку">
          {coverPreviewUri ? (
            <Image source={{ uri: coverPreviewUri }} style={styles.coverImage} />
          ) : (
            <>
              <MaterialCommunityIcons name="camera-outline" size={26} color={colors.textMuted} />
              <Text style={styles.coverText}>Добавить обложку</Text>
              <Text style={styles.coverHint}>Рекомендуемое разрешение 16:9</Text>
            </>
          )}
        </Pressable>

        <Text style={styles.sectionTitle}>Основное</Text>
        <Card style={styles.card}>
          {!editGame && projects.length > 1 ? (
            <>
              <FieldRow
                icon="folder-outline"
                label="Проект"
                required
                value={selectedProject?.name ?? ''}
                onPress={() => setOpenPicker('project')}
              />
              <View style={styles.divider} />
            </>
          ) : null}
          <FieldRow
            icon="flag-outline"
            label="Тип игры"
            required
            value={gameType ? GAME_TYPE_LABEL[gameType] : ''}
            onPress={() => setOpenPicker('gameType')}
          />
          <View style={styles.divider} />
          <FieldRow icon="map-marker-outline" label="Город" value={city ?? ''} onPress={() => setOpenPicker('city')} />
          <View style={styles.divider} />
          <FieldRow
            icon="target"
            label="Полигон"
            required
            value={selectedPolygon?.name ?? ''}
            placeholder="Не выбран"
            onPress={() => setOpenPicker('polygon')}
          />
        </Card>

        <Text style={styles.sectionTitle}>Название события</Text>
        <TextField style={styles.input} placeholder="Название события *" value={name} onChangeText={setName} maxLength={120} />
        <Text style={styles.counter}>{name.length}/120</Text>

        <Text style={styles.sectionTitle}>Когда и сколько</Text>
        <Card style={styles.card}>
          <DateTimeField label="Дата и время начала *" value={startsAt} onChangeText={setStartsAt} />
          <View style={styles.gap} />
          <TextField
            label="Длительность, ч"
            placeholder="Необязательно"
            value={durationHours}
            onChangeText={setDurationHours}
            keyboardType="decimal-pad"
          />
        </Card>

        <Text style={styles.sectionTitle}>Стоимость</Text>
        <Card style={styles.card}>
          <View style={styles.toggleRow}>
            <View style={styles.iconWrap}>
              <MaterialCommunityIcons name="wallet-outline" size={18} color={colors.textMuted} />
            </View>
            <View style={styles.toggleTextWrap}>
              <Text style={styles.toggleLabel}>Платная игра</Text>
              <Text style={styles.toggleHint}>Выключите, если участие бесплатное</Text>
            </View>
            <Switch
              value={isPaid}
              onValueChange={setIsPaid}
              trackColor={{ false: colors.cardBorder, true: colors.accentSoftBorder }}
              thumbColor={isPaid ? colors.accent : colors.textDim}
            />
          </View>
          {isPaid ? (
            <TextField
              style={styles.gap}
              label="Цена, ₽"
              placeholder="0"
              value={price}
              onChangeText={setPrice}
              keyboardType="decimal-pad"
            />
          ) : (
            <View style={[styles.gap, styles.freeBox]}>
              <Text style={styles.freeText}>Бесплатно</Text>
            </View>
          )}
        </Card>

        <Text style={styles.sectionTitle}>Описание события</Text>
        <TextField
          style={[styles.input, styles.textArea]}
          placeholder="Описание *"
          value={description}
          onChangeText={setDescription}
          multiline
          numberOfLines={5}
        />

        {!editGame ? (
          <>
            <Text style={styles.sectionTitle}>Материалы</Text>
            <Card style={styles.card}>
              <View style={styles.materialsHeader}>
                <View style={styles.iconWrap}>
                  <MaterialCommunityIcons name="paperclip" size={18} color={colors.textMuted} />
                </View>
                <View style={styles.toggleTextWrap}>
                  <Text style={styles.toggleLabel}>
                    {materials.length} из {MAX_MATERIALS} материалов
                  </Text>
                  <Text style={styles.toggleHint}>Не более 5 МБ каждый</Text>
                </View>
                <Button title="+ Добавить" variant="secondary" onPress={promptAddMaterial} style={styles.addMaterialButton} />
              </View>
              {materials.length === 0 ? (
                <View style={styles.materialsEmpty}>
                  <Text style={styles.materialsEmptyText}>
                    Добавьте фотографии, регламент, сценарий, карту или другой полезный материал.
                  </Text>
                </View>
              ) : (
                <View style={styles.materialsGrid}>
                  {materials.map((m, idx) => (
                    <View key={`${m.uri}-${idx}`} style={styles.materialCard}>
                      <Text style={styles.materialName} numberOfLines={1}>
                        {m.name}
                      </Text>
                      <Pressable
                        onPress={() => removeMaterial(idx)}
                        hitSlop={8}
                        accessibilityRole="button"
                        accessibilityLabel={`Удалить ${m.name}`}
                      >
                        <Text style={styles.materialRemove}>Удалить</Text>
                      </Pressable>
                    </View>
                  ))}
                </View>
              )}
            </Card>
          </>
        ) : null}

        <Text style={styles.sectionTitle}>Правила</Text>
        <TextField
          style={[styles.input, styles.textArea]}
          placeholder="Ограничения, требования к экипировке и другие правила"
          value={rules}
          onChangeText={setRules}
          multiline
          numberOfLines={4}
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}
      </ScrollView>

      <View style={styles.footer}>
        <Button
          title="Сохранить"
          variant={showPublishButton ? 'secondary' : 'primary'}
          onPress={() => submit(saveStatus)}
          loading={submitting === saveStatus}
          disabled={submitting !== null}
          style={styles.footerButton}
        />
        {showPublishButton ? (
          <Button
            title="Опубликовать"
            onPress={() => submit('published')}
            loading={submitting === 'published'}
            disabled={submitting !== null}
            style={styles.footerButton}
          />
        ) : null}
      </View>

      <PickerSheet
        visible={openPicker === 'project'}
        title="Проект"
        options={projectOptions}
        selectedId={projectId}
        onSelect={setProjectId}
        onRequestClose={() => setOpenPicker(null)}
      />
      <PickerSheet
        visible={openPicker === 'gameType'}
        title="Тип игры"
        options={gameTypeOptions}
        selectedId={gameType}
        onSelect={(id) => setGameType(id as GameType)}
        onRequestClose={() => setOpenPicker(null)}
      />
      <PickerSheet
        visible={openPicker === 'city'}
        title="Город"
        options={cityOptions}
        selectedId={city}
        emptyText="Нет полигонов с указанным городом"
        onSelect={(id) => {
          setCity(id);
          if (selectedPolygon && selectedPolygon.city !== id) setPolygonId(null);
        }}
        onRequestClose={() => setOpenPicker(null)}
      />
      <PickerSheet
        visible={openPicker === 'polygon'}
        title="Полигон"
        options={polygonOptions}
        selectedId={polygonId}
        emptyText="Нет ни одного полигона — сначала создайте его в разделе «Полигоны»"
        onSelect={setPolygonId}
        onRequestClose={() => setOpenPicker(null)}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  back: {
    fontFamily: font.body,
    color: colors.textMuted,
  },
  title: {
    fontFamily: font.heading,
    fontSize: 17,
    color: colors.text,
  },
  headerSave: {
    fontFamily: font.bodySemiBold,
    color: colors.accent,
  },
  body: {
    flex: 1,
  },
  bodyContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: 20,
  },
  cover: {
    aspectRatio: 16 / 9,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
    overflow: 'hidden',
  },
  coverImage: {
    width: '100%',
    height: '100%',
  },
  coverText: {
    fontFamily: font.bodySemiBold,
    fontSize: 14,
    color: colors.textMuted,
    marginTop: 6,
  },
  coverHint: {
    fontFamily: font.body,
    fontSize: 11.5,
    color: colors.textDim,
    marginTop: 2,
  },
  sectionTitle: {
    fontFamily: font.heading,
    fontSize: 16,
    color: colors.text,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  card: {
    gap: 0,
  },
  divider: {
    height: 1,
    backgroundColor: colors.cardBorder,
  },
  input: {
    marginBottom: 4,
  },
  textArea: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  counter: {
    fontFamily: font.body,
    fontSize: 11,
    color: colors.textDim,
    textAlign: 'right',
  },
  gap: {
    marginTop: spacing.sm + 2,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 2,
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: radii.md,
    backgroundColor: colors.cardSoft,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleTextWrap: {
    flex: 1,
  },
  toggleLabel: {
    fontFamily: font.bodySemiBold,
    fontSize: 14.5,
    color: colors.text,
  },
  toggleHint: {
    fontFamily: font.body,
    fontSize: 11.5,
    color: colors.textDim,
    marginTop: 2,
  },
  freeBox: {
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radii.md,
    paddingVertical: 13,
    paddingHorizontal: 14,
  },
  freeText: {
    fontFamily: font.body,
    fontSize: 14.5,
    color: colors.textDim,
  },
  materialsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 2,
  },
  addMaterialButton: {
    paddingHorizontal: 14,
  },
  materialsEmpty: {
    marginTop: spacing.sm + 2,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radii.md,
    padding: spacing.md,
    backgroundColor: colors.cardSoft,
  },
  materialsEmptyText: {
    fontFamily: font.body,
    fontSize: 12.5,
    color: colors.textDim,
    textAlign: 'center',
  },
  materialsGrid: {
    marginTop: spacing.sm + 2,
    gap: 8,
  },
  materialCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radii.md,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  materialName: {
    fontFamily: font.body,
    fontSize: 12.5,
    color: colors.text,
    flex: 1,
  },
  materialRemove: {
    fontFamily: font.body,
    fontSize: 12.5,
    color: colors.danger,
  },
  error: {
    fontFamily: font.body,
    color: colors.danger,
    marginTop: spacing.md,
  },
  footer: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
  },
  footerButton: {
    flex: 1,
  },
});
