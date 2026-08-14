import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { supabase } from '../lib/supabase';
import { GAME_TYPES, GAME_TYPE_LABEL, type GameType } from '../lib/gameTypes';
import { Button } from './Button';
import { Chip } from './Chip';
import { TextField } from './TextField';
import { DateTimeField } from './DateTimeField';
import { colors, font, radii, spacing } from '../lib/theme';
import type { Polygon, Profile, Project } from '../lib/database.types';

const STEPS = ['Основная информация', 'Дата и полигон', 'Стороны', 'Командующие сторонами', 'Проверка и сохранение'] as const;

type Props = {
  projects: Project[];
  onDone: (gameId: string) => void;
  onCancel: () => void;
};

export function CreateGameWizard({ projects, onDone, onCancel }: Props) {
  const [step, setStep] = useState(0);
  const [projectId, setProjectId] = useState<string | null>(projects.length === 1 ? projects[0].id : null);
  const [name, setName] = useState('');
  const [gameType, setGameType] = useState<GameType | null>(null);
  const [description, setDescription] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [polygonId, setPolygonId] = useState<string | null>(null);
  const [polygons, setPolygons] = useState<Polygon[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [sideNames, setSideNames] = useState<string[]>(['Белые', 'Красные']);
  const [newSideName, setNewSideName] = useState('');
  const [sideCommanders, setSideCommanders] = useState<Record<number, string | null>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from('polygons')
      .select('*')
      .order('name', { ascending: true })
      .then(({ data }) => setPolygons(data ?? []));
    supabase
      .from('profiles')
      .select('*')
      .order('full_name', { ascending: true })
      .then(({ data }) => setProfiles(data ?? []));
  }, []);

  const selectedProject = projects.find((p) => p.id === projectId) ?? null;

  useEffect(() => {
    if (selectedProject?.default_game_type) setGameType((prev) => prev ?? selectedProject.default_game_type);
  }, [selectedProject]);

  const canProceed =
    step === 0
      ? !!projectId && name.trim().length > 0
      : step === 1
        ? !!polygonId
        : step === 2
          ? sideNames.length > 0
          : true;

  const addSide = () => {
    if (!newSideName.trim()) return;
    setSideNames((prev) => [...prev, newSideName.trim()]);
    setNewSideName('');
  };

  const removeSide = (idx: number) => {
    setSideNames((prev) => prev.filter((_, i) => i !== idx));
    setSideCommanders((prev) => {
      const next = { ...prev };
      delete next[idx];
      return next;
    });
  };

  const submit = async () => {
    if (!projectId || !name.trim() || !polygonId) return;
    setSubmitting(true);
    setError(null);

    const startsAtDate = startsAt.trim() ? new Date(startsAt.trim()) : null;
    if (startsAtDate && Number.isNaN(startsAtDate.getTime())) {
      setError('Не удалось разобрать дату начала игры');
      setSubmitting(false);
      return;
    }
    const endsAtDate = endsAt.trim() ? new Date(endsAt.trim()) : null;
    if (endsAtDate && Number.isNaN(endsAtDate.getTime())) {
      setError('Не удалось разобрать дату окончания игры');
      setSubmitting(false);
      return;
    }

    const { data: userData } = await supabase.auth.getUser();
    const { data: createdGame, error: gameError } = await supabase
      .from('games')
      .insert({
        project_id: projectId,
        name: name.trim(),
        polygon_id: polygonId,
        starts_at: startsAtDate ? startsAtDate.toISOString() : null,
        ends_at: endsAtDate ? endsAtDate.toISOString() : null,
        description: description.trim() || null,
        game_type: gameType,
        created_by: userData.user?.id,
      })
      .select('id')
      .single();

    if (gameError || !createdGame) {
      setError(gameError?.message ?? 'Не удалось создать игру');
      setSubmitting(false);
      return;
    }

    const uniqueSideNames = sideNames.map((n) => n.trim()).filter(Boolean);
    if (uniqueSideNames.length > 0) {
      const { data: createdSides, error: sidesError } = await supabase
        .from('game_sides')
        .insert(uniqueSideNames.map((sideName) => ({ game_id: createdGame.id, name: sideName })))
        .select('id, name');
      if (sidesError) {
        setError(sidesError.message);
        setSubmitting(false);
        return;
      }
      const commanderByName = new Map(sideNames.map((n, idx) => [n.trim(), sideCommanders[idx] ?? null]));
      for (const side of createdSides ?? []) {
        const commanderId = commanderByName.get(side.name);
        if (commanderId) {
          await supabase.from('game_sides').update({ commander_id: commanderId }).eq('id', side.id);
        }
      }
    }

    setSubmitting(false);
    onDone(createdGame.id);
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Pressable onPress={onCancel} accessibilityRole="button" accessibilityLabel="Отменить создание игры">
        <Text style={styles.back}>‹ Отмена</Text>
      </Pressable>
      <Text style={styles.title}>Новая игра</Text>

      <View style={styles.stepsRow}>
        {STEPS.map((label, idx) => (
          <View key={label} style={styles.stepItem}>
            <View style={[styles.stepDot, idx === step && styles.stepDotActive, idx < step && styles.stepDotDone]}>
              <Text style={[styles.stepDotText, idx <= step && styles.stepDotTextActive]}>{idx + 1}</Text>
            </View>
            {idx < STEPS.length - 1 ? <View style={[styles.stepLine, idx < step && styles.stepLineDone]} /> : null}
          </View>
        ))}
      </View>
      <Text style={styles.stepLabel}>{STEPS[step]}</Text>

      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
        {step === 0 ? (
          <>
            {projects.length > 1 ? (
              <>
                <Text style={styles.label}>Проект</Text>
                <View style={styles.chips}>
                  {projects.map((p) => (
                    <Chip key={p.id} label={p.name} selected={projectId === p.id} onPress={() => setProjectId(p.id)} />
                  ))}
                </View>
              </>
            ) : null}
            <TextField style={styles.input} label="Название игры" value={name} onChangeText={setName} />
            <TextField
              style={[styles.input, styles.textArea]}
              label="Описание сценария"
              placeholder="Необязательно"
              value={description}
              onChangeText={setDescription}
              multiline
              numberOfLines={4}
            />
            <Text style={styles.label}>Тип игры</Text>
            <View style={styles.chips}>
              <Chip label="—" selected={!gameType} onPress={() => setGameType(null)} />
              {GAME_TYPES.map((t) => (
                <Chip key={t} label={GAME_TYPE_LABEL[t]} selected={gameType === t} onPress={() => setGameType(t)} />
              ))}
            </View>
          </>
        ) : null}

        {step === 1 ? (
          <>
            <DateTimeField
              style={styles.input}
              label="Дата начала"
              placeholder="Необязательно, ДД-ММ-ГГГГ ЧЧ:ММ"
              value={startsAt}
              onChangeText={setStartsAt}
            />
            <DateTimeField
              style={styles.input}
              label="Дата окончания"
              placeholder="Необязательно, ДД-ММ-ГГГГ ЧЧ:ММ"
              value={endsAt}
              onChangeText={setEndsAt}
            />
            <Text style={styles.label}>Полигон</Text>
            {polygons.length === 0 ? (
              <Text style={styles.hint}>Нет ни одного полигона — сначала создайте его в разделе «Полигоны».</Text>
            ) : (
              <View style={styles.chips}>
                {polygons.map((p) => (
                  <Chip key={p.id} label={p.name} selected={polygonId === p.id} onPress={() => setPolygonId(p.id)} />
                ))}
              </View>
            )}
          </>
        ) : null}

        {step === 2 ? (
          <>
            <Text style={styles.hint}>Можно оставить как есть, переименовать или добавить свои.</Text>
            <View style={styles.sideList}>
              {sideNames.map((sideName, idx) => (
                <View key={idx} style={styles.sideRow}>
                  <TextField
                    style={styles.sideInput}
                    value={sideName}
                    onChangeText={(v) => setSideNames((prev) => prev.map((s, i) => (i === idx ? v : s)))}
                  />
                  <Pressable
                    onPress={() => removeSide(idx)}
                    accessibilityRole="button"
                    accessibilityLabel={`Удалить сторону ${sideName || idx + 1}`}
                    hitSlop={8}
                  >
                    <Text style={styles.removeSide}>Удалить</Text>
                  </Pressable>
                </View>
              ))}
            </View>
            <View style={styles.addSideRow}>
              <TextField
                style={styles.sideInput}
                placeholder="Название новой стороны"
                value={newSideName}
                onChangeText={setNewSideName}
              />
              <Button title="Добавить" variant="secondary" onPress={addSide} style={styles.addSideButton} />
            </View>
          </>
        ) : null}

        {step === 3 ? (
          <>
            <Text style={styles.hint}>Необязательно — можно назначить позже, со страницы игры.</Text>
            {sideNames.map((sideName, idx) => (
              <View key={idx} style={styles.commanderBlock}>
                <Text style={styles.label}>{sideName || `Сторона ${idx + 1}`}</Text>
                <View style={styles.chips}>
                  <Chip label="—" selected={!sideCommanders[idx]} onPress={() => setSideCommanders((prev) => ({ ...prev, [idx]: null }))} />
                  {profiles.map((p) => (
                    <Chip
                      key={p.id}
                      label={p.full_name || '(без имени)'}
                      selected={sideCommanders[idx] === p.id}
                      onPress={() => setSideCommanders((prev) => ({ ...prev, [idx]: p.id }))}
                    />
                  ))}
                </View>
              </View>
            ))}
          </>
        ) : null}

        {step === 4 ? (
          <View style={styles.summary}>
            <SummaryRow label="Проект" value={selectedProject?.name ?? '—'} />
            <SummaryRow label="Название" value={name || '—'} />
            <SummaryRow label="Тип игры" value={gameType ? GAME_TYPE_LABEL[gameType] : '—'} />
            <SummaryRow label="Начало" value={formatDateTimeSummary(startsAt)} />
            <SummaryRow label="Окончание" value={formatDateTimeSummary(endsAt)} />
            <SummaryRow label="Полигон" value={polygons.find((p) => p.id === polygonId)?.name ?? '—'} />
            <SummaryRow
              label="Стороны"
              value={
                sideNames
                  .map((s, idx) => {
                    const commanderName = profiles.find((p) => p.id === sideCommanders[idx])?.full_name;
                    return commanderName ? `${s} (${commanderName})` : s;
                  })
                  .join(', ') || '—'
              }
            />
          </View>
        ) : null}

        {error ? <Text style={styles.error}>{error}</Text> : null}
      </ScrollView>

      <View style={styles.navRow}>
        {step > 0 ? (
          <Button title="Назад" variant="secondary" onPress={() => setStep((s) => s - 1)} style={styles.flexButton} />
        ) : (
          <View style={styles.flexButton} />
        )}
        {step < STEPS.length - 1 ? (
          <Button title="Далее" onPress={() => setStep((s) => s + 1)} disabled={!canProceed} style={styles.flexButton} />
        ) : (
          <Button title="Создать игру" onPress={submit} loading={submitting} style={styles.flexButton} />
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

function formatDateTimeSummary(value: string): string {
  if (!value.trim()) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.summaryRow}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
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
    marginBottom: spacing.md,
  },
  stepsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  stepItem: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  stepDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepDotActive: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
  },
  stepDotDone: {
    borderColor: colors.accent,
    backgroundColor: colors.accent,
  },
  stepDotText: {
    fontFamily: font.bodySemiBold,
    fontSize: 11,
    color: colors.textDim,
  },
  stepDotTextActive: {
    color: colors.accent,
  },
  stepLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.cardBorder,
    marginHorizontal: 2,
  },
  stepLineDone: {
    backgroundColor: colors.accent,
  },
  stepLabel: {
    fontFamily: font.bodySemiBold,
    fontSize: 13,
    color: colors.textMuted,
    marginBottom: spacing.md,
  },
  body: {
    flex: 1,
  },
  bodyContent: {
    paddingBottom: 20,
  },
  label: {
    fontFamily: font.body,
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 4,
    marginBottom: 4,
  },
  hint: {
    fontFamily: font.body,
    fontSize: 12.5,
    color: colors.textDim,
    marginBottom: spacing.sm,
  },
  input: {
    marginBottom: spacing.sm + 2,
  },
  textArea: {
    minHeight: 90,
    textAlignVertical: 'top',
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: spacing.sm,
  },
  sideList: {
    gap: 8,
    marginBottom: spacing.sm,
  },
  sideRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  sideInput: {
    flex: 1,
  },
  removeSide: {
    fontFamily: font.body,
    fontSize: 12.5,
    color: colors.danger,
  },
  addSideRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  addSideButton: {
    paddingHorizontal: 14,
  },
  commanderBlock: {
    marginBottom: spacing.md,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
  },
  summary: {
    backgroundColor: colors.cardSoft,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radii.lg,
    padding: spacing.md,
    gap: 10,
  },
  summaryRow: {
    gap: 2,
  },
  summaryLabel: {
    fontFamily: font.body,
    fontSize: 11,
    color: colors.textDim,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  summaryValue: {
    fontFamily: font.bodySemiBold,
    fontSize: 14,
    color: colors.text,
  },
  error: {
    fontFamily: font.body,
    color: colors.danger,
    marginTop: spacing.md,
  },
  navRow: {
    flexDirection: 'row',
    gap: 10,
    paddingVertical: spacing.md,
  },
  flexButton: {
    flex: 1,
  },
});
