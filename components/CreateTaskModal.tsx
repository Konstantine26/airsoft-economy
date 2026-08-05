import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { supabase } from '../lib/supabase';
import type { TaskAttachmentKind, TaskVisibility } from '../lib/database.types';
import { TASK_VISIBILITY_LABEL, type TaskParticipantOption, type TaskSideOption, type TaskTeamOption } from '../lib/tasks';
import { AudioRecorderField, type RecordedAudio } from './AudioRecorderField';
import { Button } from './Button';
import { Chip } from './Chip';
import { Sheet } from './Sheet';
import { TextField } from './TextField';
import { colors, font, spacing } from '../lib/theme';

const TASK_ATTACHMENTS_BUCKET = 'task-attachments';
const VISIBILITIES: TaskVisibility[] = ['side', 'team', 'personal', 'claimable'];

type QueuedAttachment = { uri: string; name: string; mimeType: string | null; kind: TaskAttachmentKind };

type Props = {
  visible: boolean;
  gameId: string;
  customerProfileId: string;
  sides: TaskSideOption[];
  teams: TaskTeamOption[];
  participants: TaskParticipantOption[];
  onClose: () => void;
  onCreated: () => void;
};

export function CreateTaskModal({ visible, gameId, customerProfileId, sides, teams, participants, onClose, onCreated }: Props) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [visibility, setVisibility] = useState<TaskVisibility>('side');
  const [sideId, setSideId] = useState<string | null>(sides[0]?.id ?? null);
  const [teamId, setTeamId] = useState<string | null>(null);
  const [assigneeId, setAssigneeId] = useState<string | null>(null);
  const [reward, setReward] = useState('');
  const [images, setImages] = useState<QueuedAttachment[]>([]);
  const [files, setFiles] = useState<QueuedAttachment[]>([]);
  const [audioFiles, setAudioFiles] = useState<QueuedAttachment[]>([]);
  const [recordedAudio, setRecordedAudio] = useState<RecordedAudio | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setTitle('');
    setDescription('');
    setVisibility('side');
    setSideId(sides[0]?.id ?? null);
    setTeamId(null);
    setAssigneeId(null);
    setReward('');
    setImages([]);
    setFiles([]);
    setAudioFiles([]);
    setRecordedAudio(null);
    setError(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const teamsForSide = teams.filter((t) => t.sideId === sideId);
  const participantsForSide = participants.filter((p) => p.effectiveSideId === sideId);

  const pickImages = async () => {
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
    setImages((prev) => [
      ...prev,
      ...result.assets.map((a) => ({
        uri: a.uri,
        name: a.fileName ?? a.uri.split('/').pop() ?? 'image.jpg',
        mimeType: a.mimeType ?? 'image/jpeg',
        kind: 'image' as const,
      })),
    ]);
  };

  const pickFiles = async () => {
    const result = await DocumentPicker.getDocumentAsync({ multiple: true, type: '*/*' });
    if (result.canceled) return;
    setFiles((prev) => [
      ...prev,
      ...result.assets.map((a) => ({ uri: a.uri, name: a.name, mimeType: a.mimeType ?? null, kind: 'file' as const })),
    ]);
  };

  const pickAudioFiles = async () => {
    const result = await DocumentPicker.getDocumentAsync({ multiple: true, type: 'audio/*' });
    if (result.canceled) return;
    setAudioFiles((prev) => [
      ...prev,
      ...result.assets.map((a) => ({ uri: a.uri, name: a.name, mimeType: a.mimeType ?? 'audio/mpeg', kind: 'audio' as const })),
    ]);
  };

  const submit = async () => {
    setError(null);
    if (!title.trim()) {
      setError('Укажите название задания');
      return;
    }
    if (!sideId) {
      setError('Выберите сторону');
      return;
    }
    if (visibility === 'team' && !teamId) {
      setError('Выберите команду');
      return;
    }
    if (visibility === 'personal' && !assigneeId) {
      setError('Выберите получателя');
      return;
    }
    let numericReward: number | null = null;
    if (reward.trim()) {
      numericReward = Number(reward.replace(',', '.'));
      if (!Number.isFinite(numericReward) || numericReward <= 0) {
        setError('Вознаграждение должно быть больше нуля');
        return;
      }
    }

    setSubmitting(true);
    try {
      const { data: task, error: insertError } = await supabase
        .from('tasks')
        .insert({
          game_id: gameId,
          title: title.trim(),
          description: description.trim() || null,
          visibility,
          side_id: sideId,
          team_id: visibility === 'team' ? teamId : null,
          assignee_profile_id: visibility === 'personal' ? assigneeId : null,
          customer_profile_id: customerProfileId,
          reward: numericReward,
          created_by: customerProfileId,
        })
        .select('*')
        .single();
      if (insertError) throw insertError;

      const queued = [...images, ...files, ...audioFiles, ...(recordedAudio ? [{ ...recordedAudio, kind: 'audio' as const }] : [])];
      for (const attachment of queued) {
        const arrayBuffer = await fetch(attachment.uri).then((res) => res.arrayBuffer());
        const path = `${task.id}/${Date.now()}-${attachment.name.replace(/[^\w.\-]+/g, '_')}`;
        const { error: uploadError } = await supabase.storage
          .from(TASK_ATTACHMENTS_BUCKET)
          .upload(path, arrayBuffer, { contentType: attachment.mimeType ?? undefined });
        if (uploadError) throw uploadError;

        const { error: attachmentError } = await supabase.from('task_attachments').insert({
          task_id: task.id,
          kind: attachment.kind,
          storage_path: path,
          file_name: attachment.name,
          content_type: attachment.mimeType,
          created_by: customerProfileId,
        });
        if (attachmentError) throw attachmentError;
      }

      reset();
      onCreated();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось создать задание');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Sheet visible={visible} onRequestClose={handleClose}>
      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Новое задание</Text>

        <TextField style={styles.input} placeholder="Название" value={title} onChangeText={setTitle} />
        <TextField
          style={[styles.input, styles.textArea]}
          placeholder="Описание (необязательно)"
          value={description}
          onChangeText={setDescription}
          multiline
          numberOfLines={4}
        />

        <Text style={styles.label}>Доступность</Text>
        <View style={styles.chips}>
          {VISIBILITIES.map((v) => (
            <Chip
              key={v}
              label={TASK_VISIBILITY_LABEL[v]}
              selected={visibility === v}
              onPress={() => {
                setVisibility(v);
                setTeamId(null);
                setAssigneeId(null);
              }}
            />
          ))}
        </View>

        {sides.length > 1 ? (
          <>
            <Text style={styles.label}>Сторона</Text>
            <View style={styles.chips}>
              {sides.map((s) => (
                <Chip
                  key={s.id}
                  label={s.name}
                  selected={sideId === s.id}
                  onPress={() => {
                    setSideId(s.id);
                    setTeamId(null);
                    setAssigneeId(null);
                  }}
                />
              ))}
            </View>
          </>
        ) : null}

        {visibility === 'team' ? (
          <>
            <Text style={styles.label}>Команда</Text>
            {teamsForSide.length === 0 ? (
              <Text style={styles.hint}>Нет команд на этой стороне</Text>
            ) : (
              <View style={styles.chips}>
                {teamsForSide.map((t) => (
                  <Chip key={t.id} label={t.name} selected={teamId === t.id} onPress={() => setTeamId(t.id)} />
                ))}
              </View>
            )}
          </>
        ) : null}

        {visibility === 'personal' ? (
          <>
            <Text style={styles.label}>Получатель</Text>
            {participantsForSide.length === 0 ? (
              <Text style={styles.hint}>На этой стороне пока никого нет</Text>
            ) : (
              <View style={styles.chips}>
                {participantsForSide.map((p) => (
                  <Chip
                    key={p.profileId}
                    label={p.fullName}
                    selected={assigneeId === p.profileId}
                    onPress={() => setAssigneeId(p.profileId)}
                  />
                ))}
              </View>
            )}
          </>
        ) : null}

        <TextField
          style={styles.input}
          placeholder="Вознаграждение (необязательно)"
          value={reward}
          onChangeText={setReward}
          keyboardType="decimal-pad"
        />

        <Text style={styles.label}>Вложения</Text>
        <View style={styles.chips}>
          <Chip label={`Изображения (${images.length})`} onPress={pickImages} />
          <Chip label={`Файлы (${files.length})`} onPress={pickFiles} />
          <Chip label={`Аудиофайл (${audioFiles.length})`} onPress={pickAudioFiles} />
        </View>
        <AudioRecorderField value={recordedAudio} onChange={setRecordedAudio} />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={styles.actions}>
          <Button title="Отмена" variant="secondary" onPress={handleClose} style={styles.actionButton} />
          <Button title="Создать" onPress={submit} loading={submitting} style={styles.actionButton} />
        </View>
      </ScrollView>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  scroll: {
    maxHeight: 560,
  },
  title: {
    fontFamily: font.heading,
    fontSize: 18,
    color: colors.text,
    marginBottom: spacing.md,
  },
  input: {
    marginBottom: spacing.sm + 2,
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  label: {
    fontFamily: font.body,
    fontSize: 12,
    color: colors.textMuted,
    marginBottom: 6,
  },
  hint: {
    fontFamily: font.body,
    fontSize: 12,
    color: colors.textDim,
    marginBottom: spacing.sm,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: spacing.sm + 2,
  },
  error: {
    fontFamily: font.body,
    color: colors.danger,
    marginBottom: spacing.md,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: spacing.sm,
    marginBottom: 6,
  },
  actionButton: {
    flex: 1,
  },
});
