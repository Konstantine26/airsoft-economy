import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { supabase } from '../lib/supabase';
import type {
  Game,
  GameAttachment,
  GameParticipant,
  GameSide,
  GameStage,
  GameTrader,
  GameTraderSide,
  Polygon,
  PolygonType,
  Profile,
  Project,
} from '../lib/database.types';
import { GAME_TYPES, GAME_TYPE_LABEL, type GameType } from '../lib/gameTypes';
import { isImageFile } from '../lib/files';
import { Avatar } from './Avatar';
import { Card } from './Card';
import { Chip } from './Chip';
import { Button } from './Button';
import { TextField } from './TextField';
import { PolygonMapThumbnails } from './PolygonMapThumbnails';
import { ImageLightbox } from './ImageLightbox';
import { TasksSection } from './TasksSection';
import { colors, font, radii, spacing } from '../lib/theme';

const ATTACHMENTS_BUCKET = 'game-attachments';

const POLYGON_TYPE_LABEL: Record<PolygonType, string> = {
  built_up: 'Застройка',
  forest: 'Лес',
  field: 'Поле',
  sqb: 'SQB',
  mixed: 'Смешанный',
};

function publicAttachmentUrl(path: string) {
  return supabase.storage.from(ATTACHMENTS_BUCKET).getPublicUrl(path).data.publicUrl;
}

type GameWithRelations = Game & { project: Project | null; polygon: Polygon | null };
type ParticipantRow = GameParticipant & {
  team_name: string;
  full_name: string;
  avatar_url: string | null;
  effective_side_id: string | null;
};

type TraderRow = GameTrader & { full_name: string; side_ids: string[] };

type Props = {
  gameId: string;
  onBack: () => void;
  onDeleted?: () => void;
};

export function GameManageScreen({ gameId, onBack, onDeleted }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [game, setGame] = useState<GameWithRelations | null>(null);
  const [polygons, setPolygons] = useState<Polygon[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);

  const [sides, setSides] = useState<GameSide[]>([]);
  const [participants, setParticipants] = useState<ParticipantRow[]>([]);
  const [newSideName, setNewSideName] = useState('');

  const [traders, setTraders] = useState<TraderRow[]>([]);
  const [newTraderProfileId, setNewTraderProfileId] = useState<string | null>(null);
  const [newTraderSideIds, setNewTraderSideIds] = useState<string[]>([]);

  const [stages, setStages] = useState<GameStage[]>([]);
  const [newStageTitle, setNewStageTitle] = useState('');
  const [newStageDescription, setNewStageDescription] = useState('');

  const [attachments, setAttachments] = useState<GameAttachment[]>([]);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [lightboxUri, setLightboxUri] = useState<string | null>(null);

  const [editingCard, setEditingCard] = useState(false);
  const [editName, setEditName] = useState('');
  const [editStartsAt, setEditStartsAt] = useState('');
  const [editEndsAt, setEditEndsAt] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editGameType, setEditGameType] = useState<GameType | null>(null);
  const [editPolygonId, setEditPolygonId] = useState<string | null>(null);

  const loadTraders = useCallback(async () => {
    const { data } = await supabase
      .from('game_traders')
      .select('*, sides:game_trader_sides(side_id), profile:profiles(full_name)')
      .eq('game_id', gameId);
    const rows: TraderRow[] = ((data as any[]) ?? []).map((row) => ({
      ...row,
      full_name: row.profile?.full_name || '(без имени)',
      side_ids: (row.sides ?? []).map((s: any) => s.side_id),
    }));
    setTraders(rows);
  }, [gameId]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [gameRes, polygonsRes, profilesRes, sidesRes, teamSidesRes, participantsRes, stagesRes, attachmentsRes] =
      await Promise.all([
        supabase.from('games').select('*, project:projects(*), polygon:polygons(*)').eq('id', gameId).single(),
        supabase.from('polygons').select('*').order('name', { ascending: true }),
        supabase.from('profiles').select('*').order('full_name', { ascending: true }),
        supabase.from('game_sides').select('*').eq('game_id', gameId).order('name', { ascending: true }),
        supabase.from('game_team_sides').select('team_id, side_id').eq('game_id', gameId),
        supabase
          .from('game_participants')
          .select('*, team:teams(name), profile:profiles(full_name, avatar_url)')
          .eq('game_id', gameId),
        supabase.from('game_stages').select('*').eq('game_id', gameId).order('position', { ascending: true }),
        supabase.from('game_attachments').select('*').eq('game_id', gameId).order('created_at', { ascending: false }),
      ]);

    if (gameRes.error) setError(gameRes.error.message);
    setGame((gameRes.data as GameWithRelations) ?? null);
    setPolygons(polygonsRes.data ?? []);
    setProfiles(profilesRes.data ?? []);
    setSides(sidesRes.data ?? []);
    setStages(stagesRes.data ?? []);
    setAttachments(attachmentsRes.data ?? []);

    const teamSideMap = new Map<string, string>();
    for (const row of teamSidesRes.data ?? []) {
      teamSideMap.set(row.team_id, row.side_id);
    }
    const rows: ParticipantRow[] = ((participantsRes.data as any[]) ?? []).map((row) => ({
      ...row,
      team_name: row.team?.name ?? '',
      full_name: row.profile?.full_name || '(без имени)',
      avatar_url: row.profile?.avatar_url ?? null,
      effective_side_id: row.side_id ?? teamSideMap.get(row.team_id) ?? null,
    }));
    setParticipants(rows);

    await loadTraders();

    setLoading(false);
  }, [gameId, loadTraders]);

  useEffect(() => {
    load();
  }, [load]);

  const reloadDetail = useCallback(async () => {
    const [sidesRes, teamSidesRes, participantsRes, stagesRes, attachmentsRes] = await Promise.all([
      supabase.from('game_sides').select('*').eq('game_id', gameId).order('name', { ascending: true }),
      supabase.from('game_team_sides').select('team_id, side_id').eq('game_id', gameId),
      supabase
        .from('game_participants')
        .select('*, team:teams(name), profile:profiles(full_name, avatar_url)')
        .eq('game_id', gameId),
      supabase.from('game_stages').select('*').eq('game_id', gameId).order('position', { ascending: true }),
      supabase.from('game_attachments').select('*').eq('game_id', gameId).order('created_at', { ascending: false }),
    ]);
    setSides(sidesRes.data ?? []);
    setStages(stagesRes.data ?? []);
    setAttachments(attachmentsRes.data ?? []);

    const teamSideMap = new Map<string, string>();
    for (const row of teamSidesRes.data ?? []) {
      teamSideMap.set(row.team_id, row.side_id);
    }
    const rows: ParticipantRow[] = ((participantsRes.data as any[]) ?? []).map((row) => ({
      ...row,
      team_name: row.team?.name ?? '',
      full_name: row.profile?.full_name || '(без имени)',
      avatar_url: row.profile?.avatar_url ?? null,
      effective_side_id: row.side_id ?? teamSideMap.get(row.team_id) ?? null,
    }));
    setParticipants(rows);
    await loadTraders();
  }, [gameId, loadTraders]);

  const startEditCard = () => {
    if (!game) return;
    setEditName(game.name);
    setEditStartsAt(game.starts_at ? game.starts_at.slice(0, 16).replace('T', ' ') : '');
    setEditEndsAt(game.ends_at ? game.ends_at.slice(0, 16).replace('T', ' ') : '');
    setEditDescription(game.description ?? '');
    setEditGameType(game.game_type);
    setEditPolygonId(game.polygon_id);
    setEditingCard(true);
  };

  const saveCard = async () => {
    if (!game || !editName.trim() || !editPolygonId) return;
    setError(null);
    const startsAtDate = editStartsAt.trim() ? new Date(editStartsAt.trim()) : null;
    if (startsAtDate && Number.isNaN(startsAtDate.getTime())) {
      setError('Не удалось разобрать дату начала игры');
      return;
    }
    const endsAtDate = editEndsAt.trim() ? new Date(editEndsAt.trim()) : null;
    if (endsAtDate && Number.isNaN(endsAtDate.getTime())) {
      setError('Не удалось разобрать дату окончания игры');
      return;
    }
    const updates = {
      name: editName.trim(),
      polygon_id: editPolygonId,
      starts_at: startsAtDate ? startsAtDate.toISOString() : null,
      ends_at: endsAtDate ? endsAtDate.toISOString() : null,
      description: editDescription.trim() || null,
      game_type: editGameType,
    };
    const { error } = await supabase.from('games').update(updates).eq('id', game.id);
    if (error) {
      setError(error.message);
      return;
    }
    const updatedPolygon = polygons.find((p) => p.id === editPolygonId) ?? null;
    setGame({ ...game, ...updates, polygon: updatedPolygon });
    setEditingCard(false);
  };

  const deleteGame = async () => {
    if (!game) return;
    setError(null);
    const { error } = await supabase.from('games').delete().eq('id', game.id);
    if (error) {
      setError(error.message);
      return;
    }
    onDeleted?.();
  };

  const addStage = async () => {
    if (!game || !newStageTitle.trim()) return;
    setError(null);
    const { error } = await supabase.from('game_stages').insert({
      game_id: game.id,
      position: stages.length,
      title: newStageTitle.trim(),
      description: newStageDescription.trim() || null,
    });
    if (error) {
      setError(error.message);
      return;
    }
    setNewStageTitle('');
    setNewStageDescription('');
    reloadDetail();
  };

  const deleteStage = async (stage: GameStage) => {
    setError(null);
    const { error } = await supabase.from('game_stages').delete().eq('id', stage.id);
    if (error) {
      setError(error.message);
      return;
    }
    setStages((prev) => prev.filter((s) => s.id !== stage.id));
  };

  const uploadAttachment = async (uri: string, fileName: string, mimeType: string | null) => {
    if (!game) return;
    setUploadingAttachment(true);
    setError(null);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const arrayBuffer = await fetch(uri).then((res) => res.arrayBuffer());
      const path = `${game.id}/${Date.now()}-${fileName.replace(/[^\w.\-]+/g, '_')}`;
      const { error: uploadError } = await supabase.storage
        .from(ATTACHMENTS_BUCKET)
        .upload(path, arrayBuffer, { contentType: mimeType ?? undefined });
      if (uploadError) throw uploadError;

      const { error: insertError } = await supabase.from('game_attachments').insert({
        game_id: game.id,
        storage_path: path,
        file_name: fileName,
        content_type: mimeType,
        created_by: userData.user?.id,
      });
      if (insertError) throw insertError;

      reloadDetail();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось загрузить файл');
    } finally {
      setUploadingAttachment(false);
    }
  };

  const pickAttachmentImages = async () => {
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
      await uploadAttachment(asset.uri, fileName, asset.mimeType ?? 'image/jpeg');
    }
  };

  const pickAttachmentFiles = async () => {
    const result = await DocumentPicker.getDocumentAsync({ multiple: true, type: '*/*' });
    if (result.canceled) return;
    for (const asset of result.assets) {
      await uploadAttachment(asset.uri, asset.name, asset.mimeType ?? null);
    }
  };

  const deleteAttachment = async (attachment: GameAttachment) => {
    setError(null);
    await supabase.storage.from(ATTACHMENTS_BUCKET).remove([attachment.storage_path]);
    const { error } = await supabase.from('game_attachments').delete().eq('id', attachment.id);
    if (error) {
      setError(error.message);
      return;
    }
    setAttachments((prev) => prev.filter((a) => a.id !== attachment.id));
  };

  const createSide = async () => {
    if (!game || !newSideName.trim()) return;
    setError(null);
    const { error } = await supabase.from('game_sides').insert({ game_id: game.id, name: newSideName.trim() });
    if (error) {
      setError(error.message);
      return;
    }
    setNewSideName('');
    reloadDetail();
  };

  const setSideCommander = async (sideId: string, profileId: string | null) => {
    setError(null);
    const { error } = await supabase.from('game_sides').update({ commander_id: profileId }).eq('id', sideId);
    if (error) {
      setError(error.message);
      return;
    }
    setSides((prev) => prev.map((s) => (s.id === sideId ? { ...s, commander_id: profileId } : s)));
  };

  const confirmParticipant = async (row: ParticipantRow) => {
    setError(null);
    const { error } = await supabase.from('game_participants').update({ status: 'confirmed' }).eq('id', row.id);
    if (error) {
      setError(error.message);
      return;
    }
    setParticipants((prev) => prev.map((p) => (p.id === row.id ? { ...p, status: 'confirmed' } : p)));
  };

  const removeParticipant = async (row: ParticipantRow) => {
    setError(null);
    const { error } = await supabase.from('game_participants').delete().eq('id', row.id);
    if (error) {
      setError(error.message);
      return;
    }
    setParticipants((prev) => prev.filter((p) => p.id !== row.id));
  };

  const moveParticipant = async (row: ParticipantRow, sideId: string | null) => {
    setError(null);
    const { error } = await supabase.from('game_participants').update({ side_id: sideId }).eq('id', row.id);
    if (error) {
      setError(error.message);
      return;
    }
    reloadDetail();
  };

  const addTrader = async () => {
    if (!game || !newTraderProfileId || newTraderSideIds.length === 0) return;
    setError(null);
    const { data, error } = await supabase
      .from('game_traders')
      .insert({ game_id: game.id, profile_id: newTraderProfileId })
      .select('id')
      .single();
    if (error) {
      setError(error.message);
      return;
    }
    const { error: sidesError } = await supabase
      .from('game_trader_sides')
      .insert(newTraderSideIds.map((sideId) => ({ game_trader_id: data.id, side_id: sideId })));
    if (sidesError) {
      setError(sidesError.message);
      return;
    }
    setNewTraderProfileId(null);
    setNewTraderSideIds([]);
    loadTraders();
  };

  const removeTrader = async (trader: TraderRow) => {
    setError(null);
    const { error } = await supabase.from('game_traders').delete().eq('id', trader.id);
    if (error) {
      setError(error.message);
      return;
    }
    setTraders((prev) => prev.filter((t) => t.id !== trader.id));
  };

  const toggleTraderSide = async (trader: TraderRow, sideId: string) => {
    setError(null);
    if (trader.side_ids.includes(sideId)) {
      const { error } = await supabase
        .from('game_trader_sides')
        .delete()
        .eq('game_trader_id', trader.id)
        .eq('side_id', sideId);
      if (error) {
        setError(error.message);
        return;
      }
    } else {
      const { error } = await supabase.from('game_trader_sides').insert({ game_trader_id: trader.id, side_id: sideId });
      if (error) {
        setError(error.message);
        return;
      }
    }
    loadTraders();
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (!game) {
    return (
      <View style={styles.container}>
        <Pressable onPress={onBack}>
          <Text style={styles.back}>‹ Назад</Text>
        </Pressable>
        {error ? <Text style={styles.error}>{error}</Text> : <Text style={styles.label}>Игра не найдена</Text>}
      </View>
    );
  }

  const withoutSide = participants.filter((p) => !p.effective_side_id);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Pressable onPress={onBack}>
        <Text style={styles.back}>‹ {game.project?.name ?? 'Назад'}</Text>
      </Pressable>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {editingCard ? (
        <>
          <Text style={styles.sectionTitle}>Карточка игры</Text>
          <TextField style={styles.input} label="Название" value={editName} onChangeText={setEditName} />
          <TextField
            style={styles.input}
            label="Дата начала"
            placeholder="Напр. 2026-08-01 10:00"
            value={editStartsAt}
            onChangeText={setEditStartsAt}
          />
          <TextField
            style={styles.input}
            label="Дата окончания"
            placeholder="Напр. 2026-08-01 18:00"
            value={editEndsAt}
            onChangeText={setEditEndsAt}
          />
          <TextField
            style={[styles.input, styles.textArea]}
            label="Описание сценария"
            value={editDescription}
            onChangeText={setEditDescription}
            multiline
            numberOfLines={4}
          />
          <Text style={styles.label}>Тип игры</Text>
          <View style={styles.chips}>
            <Chip label="—" selected={!editGameType} onPress={() => setEditGameType(null)} />
            {GAME_TYPES.map((t) => (
              <Chip key={t} label={GAME_TYPE_LABEL[t]} selected={editGameType === t} onPress={() => setEditGameType(t)} />
            ))}
          </View>
          <Text style={styles.label}>Полигон</Text>
          <View style={styles.chips}>
            {polygons.map((p) => (
              <Chip key={p.id} label={p.name} selected={editPolygonId === p.id} onPress={() => setEditPolygonId(p.id)} />
            ))}
          </View>
          <View style={styles.row}>
            <Button title="Сохранить" onPress={saveCard} style={styles.flexButton} />
            <Button title="Отмена" variant="secondary" onPress={() => setEditingCard(false)} style={styles.flexButton} />
          </View>
        </>
      ) : (
        <>
          <Text style={styles.title}>{game.name}</Text>
          {game.game_type ? <Text style={styles.subtitle}>{GAME_TYPE_LABEL[game.game_type]}</Text> : null}
          {game.starts_at ? (
            <Text style={styles.subtitle}>
              Начало: {new Date(game.starts_at).toLocaleString()}
              {game.ends_at ? ` · Окончание: ${new Date(game.ends_at).toLocaleString()}` : ''}
            </Text>
          ) : null}
          {game.description ? <Text style={styles.subtitle}>{game.description}</Text> : null}
          <Pressable onPress={startEditCard}>
            <Text style={styles.editLink}>Редактировать карточку игры</Text>
          </Pressable>
        </>
      )}

      <Text style={styles.sectionTitle}>Полигон</Text>
      {game.polygon ? (
        <Card>
          <Text style={styles.cardTitle}>{game.polygon.name}</Text>
          <Text style={styles.label}>{locationLine(game.polygon)}</Text>
          <Text style={styles.label}>Тип: {POLYGON_TYPE_LABEL[game.polygon.type]}</Text>
          <PolygonMapThumbnails polygonId={game.polygon.id} />
        </Card>
      ) : (
        <Text style={styles.label}>Полигон не выбран</Text>
      )}

      <Text style={styles.sectionTitle}>Этапы</Text>
      {stages.length === 0 ? <Text style={styles.label}>Этапов пока нет</Text> : null}
      <View style={styles.cardsList}>
        {stages.map((s, idx) => (
          <Card key={s.id}>
            <View style={styles.row}>
              <Text style={styles.cardTitle}>
                {idx + 1}. {s.title}
              </Text>
              <Pressable onPress={() => deleteStage(s)}>
                <Text style={styles.deleteLink}>Удалить</Text>
              </Pressable>
            </View>
            {s.description ? <Text style={styles.label}>{s.description}</Text> : null}
          </Card>
        ))}
      </View>
      <TextField style={styles.input} label="Название этапа" value={newStageTitle} onChangeText={setNewStageTitle} />
      <TextField
        style={styles.input}
        label="Описание этапа"
        placeholder="Необязательно"
        value={newStageDescription}
        onChangeText={setNewStageDescription}
      />
      <Button title="Добавить этап" onPress={addStage} style={styles.addButtonSpacing} />

      <Text style={styles.sectionTitle}>Файлы игры</Text>
      {attachments.length === 0 ? <Text style={styles.label}>Файлов пока нет</Text> : null}
      <View style={styles.mapsGrid}>
        {attachments.map((a) => (
          <View key={a.id} style={styles.mapCard}>
            {isImageFile(a.content_type, a.file_name) ? (
              <Pressable onPress={() => setLightboxUri(publicAttachmentUrl(a.storage_path))}>
                <Image source={{ uri: publicAttachmentUrl(a.storage_path) }} style={styles.mapImage} />
              </Pressable>
            ) : (
              <View style={[styles.mapImage, styles.mapFilePlaceholder]}>
                <Text style={styles.mapFileIcon}>📄</Text>
              </View>
            )}
            <Text style={styles.mapFileName} numberOfLines={1}>
              {a.file_name}
            </Text>
            <Pressable onPress={() => deleteAttachment(a)}>
              <Text style={styles.deleteLink}>Удалить</Text>
            </Pressable>
          </View>
        ))}
      </View>
      <View style={styles.row}>
        <Button
          title={uploadingAttachment ? 'Загрузка…' : 'Добавить изображение'}
          onPress={pickAttachmentImages}
          disabled={uploadingAttachment}
          style={styles.flexButton}
        />
        <Button
          title={uploadingAttachment ? 'Загрузка…' : 'Добавить файл'}
          onPress={pickAttachmentFiles}
          disabled={uploadingAttachment}
          style={styles.flexButton}
        />
      </View>

      <Text style={styles.sectionTitle}>Стороны</Text>
      <View style={styles.cardsList}>
        {sides.map((side) => {
          const roster = participants.filter((p) => p.effective_side_id === side.id);
          return (
            <Card key={side.id}>
              <Text style={styles.cardTitle}>{side.name}</Text>
              <Text style={styles.label}>Командир стороны</Text>
              <View style={styles.chips}>
                <Chip label="—" selected={!side.commander_id} onPress={() => setSideCommander(side.id, null)} />
                {profiles.map((p) => (
                  <Chip
                    key={p.id}
                    label={p.full_name || '(без имени)'}
                    selected={side.commander_id === p.id}
                    onPress={() => setSideCommander(side.id, p.id)}
                  />
                ))}
              </View>

              <Text style={styles.label}>Участники</Text>
              {roster.length === 0 ? (
                <Text style={styles.label}>Пока никого</Text>
              ) : (
                roster.map((row) => (
                  <ParticipantRowView
                    key={row.id}
                    row={row}
                    sides={sides}
                    onConfirm={() => confirmParticipant(row)}
                    onRemove={() => removeParticipant(row)}
                    onMove={(sideId) => moveParticipant(row, sideId)}
                  />
                ))
              )}
            </Card>
          );
        })}
      </View>

      {withoutSide.length > 0 ? (
        <Card style={styles.withoutSideCard}>
          <Text style={styles.cardTitle}>Без стороны</Text>
          {withoutSide.map((row) => (
            <ParticipantRowView
              key={row.id}
              row={row}
              sides={sides}
              onConfirm={() => confirmParticipant(row)}
              onRemove={() => removeParticipant(row)}
              onMove={(sideId) => moveParticipant(row, sideId)}
            />
          ))}
        </Card>
      ) : null}

      <Text style={styles.sectionTitle}>Новая сторона</Text>
      <TextField
        style={styles.input}
        label="Название стороны"
        placeholder="Напр. Красные"
        value={newSideName}
        onChangeText={setNewSideName}
      />
      <Button title="Добавить сторону" onPress={createSide} style={styles.addButtonSpacing} />

      <Text style={styles.sectionTitle}>Торговцы</Text>
      {traders.length === 0 ? <Text style={styles.label}>Торговцы пока не назначены</Text> : null}
      <View style={styles.cardsList}>
        {traders.map((trader) => (
          <Card key={trader.id}>
            <View style={styles.row}>
              <Text style={styles.cardTitle}>{trader.full_name}</Text>
              <Pressable onPress={() => removeTrader(trader)}>
                <Text style={styles.deleteLink}>Удалить</Text>
              </Pressable>
            </View>
            <Text style={styles.label}>Стороны</Text>
            <View style={styles.chips}>
              {sides.map((side) => (
                <Chip
                  key={side.id}
                  label={side.name}
                  selected={trader.side_ids.includes(side.id)}
                  onPress={() => toggleTraderSide(trader, side.id)}
                />
              ))}
            </View>
          </Card>
        ))}
      </View>

      <Text style={styles.label}>Назначить торговца</Text>
      <View style={styles.chips}>
        {profiles
          .filter((p) => !traders.some((t) => t.profile_id === p.id))
          .map((p) => (
            <Chip
              key={p.id}
              label={p.full_name || '(без имени)'}
              selected={newTraderProfileId === p.id}
              onPress={() => setNewTraderProfileId(p.id)}
            />
          ))}
      </View>
      {newTraderProfileId ? (
        <>
          <Text style={styles.label}>Стороны для торговца</Text>
          {sides.length === 0 ? (
            <Text style={styles.label}>В игре ещё нет ни одной стороны — сначала создайте её ниже</Text>
          ) : (
            <View style={styles.chips}>
              {sides.map((side) => (
                <Chip
                  key={side.id}
                  label={side.name}
                  selected={newTraderSideIds.includes(side.id)}
                  onPress={() =>
                    setNewTraderSideIds((prev) =>
                      prev.includes(side.id) ? prev.filter((id) => id !== side.id) : [...prev, side.id]
                    )
                  }
                />
              ))}
            </View>
          )}
        </>
      ) : null}
      <Button
        title="Добавить торговца"
        onPress={addTrader}
        disabled={!newTraderProfileId || newTraderSideIds.length === 0}
        style={styles.addButtonSpacing}
      />

      <Text style={styles.sectionTitle}>Задания</Text>
      <TasksSection gameId={game.id} isOrganizer />

      <Button title="Удалить игру" variant="danger" onPress={deleteGame} style={styles.dangerSpacing} />

      <ImageLightbox uri={lightboxUri} onClose={() => setLightboxUri(null)} />
    </ScrollView>
  );
}

function ParticipantRowView({
  row,
  sides,
  onConfirm,
  onRemove,
  onMove,
}: {
  row: ParticipantRow;
  sides: GameSide[];
  onConfirm: () => void;
  onRemove: () => void;
  onMove: (sideId: string | null) => void;
}) {
  return (
    <View style={styles.participantRow}>
      <View style={styles.row}>
        <Avatar uri={row.avatar_url} name={row.full_name} size={26} />
        <Text style={styles.participantName}>
          {row.full_name}
          {row.team_name ? ` · ${row.team_name}` : ' · без команды'}
        </Text>
        <Text style={row.status === 'confirmed' ? styles.statusConfirmed : styles.statusPending}>
          {row.status === 'confirmed' ? 'Подтверждён' : 'На подтверждении'}
        </Text>
      </View>
      <View style={styles.chips}>
        {row.status === 'pending' ? (
          <Button title="Подтвердить" onPress={onConfirm} style={styles.smallActionButton} />
        ) : null}
        <Button title="Удалить" variant="danger" onPress={onRemove} style={styles.smallActionButton} />
      </View>
      <Text style={styles.label}>Переместить на сторону</Text>
      <View style={styles.chips}>
        {row.side_id !== null ? <Chip label="По команде" onPress={() => onMove(null)} /> : null}
        {sides
          .filter((s) => s.id !== row.effective_side_id)
          .map((s) => (
            <Chip key={s.id} label={s.name} onPress={() => onMove(s.id)} />
          ))}
      </View>
    </View>
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
    marginBottom: spacing.sm,
  },
  sectionTitle: {
    fontFamily: font.heading,
    fontSize: 16,
    color: colors.text,
    marginTop: spacing.lg,
    marginBottom: spacing.sm + 2,
  },
  cardsList: {
    gap: 10,
  },
  withoutSideCard: {
    marginTop: 10,
  },
  cardTitle: {
    fontFamily: font.bodyBold,
    fontSize: 14,
    color: colors.text,
    flex: 1,
  },
  label: {
    fontFamily: font.body,
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 6,
  },
  input: {
    marginBottom: spacing.sm + 2,
  },
  textArea: {
    minHeight: 90,
    textAlignVertical: 'top',
  },
  flexButton: {
    flex: 1,
  },
  addButtonSpacing: {
    marginTop: spacing.sm,
    marginBottom: spacing.xl,
  },
  dangerSpacing: {
    marginBottom: spacing.xl,
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
  editLink: {
    fontFamily: font.bodySemiBold,
    color: colors.accent,
    fontSize: 13,
    marginTop: 6,
  },
  deleteLink: {
    fontFamily: font.body,
    fontSize: 11,
    color: colors.danger,
    marginTop: 2,
  },
  error: {
    fontFamily: font.body,
    color: colors.danger,
    marginBottom: spacing.md,
  },
  participantRow: {
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
    paddingTop: spacing.sm,
    marginTop: spacing.sm,
  },
  participantName: {
    fontFamily: font.body,
    fontSize: 13,
    color: colors.text,
    flex: 1,
  },
  statusPending: {
    fontFamily: font.bodySemiBold,
    fontSize: 11.5,
    color: colors.accent,
  },
  statusConfirmed: {
    fontFamily: font.bodySemiBold,
    fontSize: 11.5,
    color: colors.success,
  },
  smallActionButton: {
    paddingVertical: 7,
    paddingHorizontal: 12,
  },
});
