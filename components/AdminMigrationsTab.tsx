import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { supabase, currentServer } from '../lib/supabase';
import { EXPECTED_MIGRATIONS } from '../lib/migrations';
import { Button } from './Button';
import { Card } from './Card';
import { colors, font, radii, spacing } from '../lib/theme';
import { confirmAsync } from '../lib/confirm';

const dateFormatter = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

export function AdminMigrationsTab() {
  const [applied, setApplied] = useState<Map<string, string>>(new Map());
  const [tableMissing, setTableMissing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyFilename, setBusyFilename] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error: loadError } = await supabase.from('_migrations_applied').select('*');
    if (loadError) {
      // Postgres says 42P01 (undefined_table); PostgREST's own schema
      // cache miss says PGRST205 ("Could not find the table ... in the
      // schema cache") -- confirmed live against the cloud test project.
      // This server doesn't have the ledger yet (024_migrations_status.sql
      // not applied here).
      if (loadError.code === '42P01' || loadError.code === 'PGRST205' || /does not exist|schema cache/i.test(loadError.message)) {
        setTableMissing(true);
        setApplied(new Map());
      } else {
        setError(loadError.message);
      }
      return;
    }
    setTableMissing(false);
    setError(null);
    setApplied(new Map((data ?? []).map((row) => [row.filename, row.applied_at])));
  }, []);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const markApplied = async (filename: string) => {
    const ok = await confirmAsync(
      'Отметить как применённое?',
      `«${filename}» будет помечен применённым на «${currentServer.label}». Используйте это, только если действительно накатили файл вручную (например, через SQL Editor) — отметка не запускает миграцию сама.`,
      'Отметить',
    );
    if (!ok) return;
    setBusyFilename(filename);
    setError(null);
    const { error: insertError } = await supabase.from('_migrations_applied').insert({ filename });
    setBusyFilename(null);
    if (insertError) {
      setError(insertError.message);
      return;
    }
    load();
  };

  const unmarkApplied = async (filename: string) => {
    const ok = await confirmAsync('Снять отметку?', `«${filename}» снова будет показан как не применённый на «${currentServer.label}».`, 'Снять');
    if (!ok) return;
    setBusyFilename(filename);
    setError(null);
    const { error: deleteError } = await supabase.from('_migrations_applied').delete().eq('filename', filename);
    setBusyFilename(null);
    if (deleteError) {
      setError(deleteError.message);
      return;
    }
    load();
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  const unknownEntries = Array.from(applied.keys()).filter((f) => !EXPECTED_MIGRATIONS.includes(f));
  const appliedCount = EXPECTED_MIGRATIONS.filter((f) => applied.has(f)).length;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} colors={[colors.accent]} />}
    >
      <Text style={styles.serverLabel}>Сервер: {currentServer.label}</Text>
      <Text style={styles.hint}>
        Применено {appliedCount} из {EXPECTED_MIGRATIONS.length}. Чтобы проверить другой сервер — выйдите из аккаунта,
        на экране входа 8 раз нажмите на эмблему ⚔️, выберите сервер в открывшемся списке и войдите заново.
      </Text>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {tableMissing ? (
        <Card style={styles.warningCard}>
          <Text style={styles.warningTitle}>Журнал миграций не найден на этом сервере</Text>
          <Text style={styles.label}>
            Таблица «_migrations_applied» здесь ещё не создана — примените supabase/024_migrations_status.sql
            (на self-hosted это сделает автоматически airsoft-migrate.timer в течение 5 минут; на облачном
            тестовом проекте — вставить файл в SQL Editor).
          </Text>
        </Card>
      ) : (
        <View style={styles.list}>
          {EXPECTED_MIGRATIONS.map((filename) => {
            const appliedAt = applied.get(filename);
            const isApplied = !!appliedAt;
            return (
              <Card key={filename} style={styles.row}>
                <View style={styles.rowMain}>
                  <Text style={styles.filename}>{filename}</Text>
                  <Text style={styles.rowMeta}>{isApplied ? `Применено ${dateFormatter.format(new Date(appliedAt))}` : 'Не применено'}</Text>
                </View>
                <View style={[styles.pill, isApplied ? styles.pillApplied : styles.pillMissing]}>
                  <Text style={[styles.pillText, isApplied ? styles.pillTextApplied : styles.pillTextMissing]}>
                    {isApplied ? '✓' : '✕'}
                  </Text>
                </View>
                {isApplied ? (
                  <Button
                    title="Снять"
                    variant="ghost"
                    onPress={() => unmarkApplied(filename)}
                    loading={busyFilename === filename}
                    style={styles.rowButton}
                  />
                ) : (
                  <Button
                    title="Отметить вручную"
                    variant="secondary"
                    onPress={() => markApplied(filename)}
                    loading={busyFilename === filename}
                    style={styles.rowButton}
                  />
                )}
              </Card>
            );
          })}
        </View>
      )}

      {unknownEntries.length > 0 ? (
        <>
          <Text style={styles.sectionTitle}>Записи журнала без файла в репозитории</Text>
          <Text style={styles.label}>
            Есть в «_migrations_applied» на «{currentServer.label}», но не в списке ожидаемых файлов — проверьте
            lib/migrations.ts (возможно, файл переименован) или это остаток от старого теста.
          </Text>
          <View style={styles.list}>
            {unknownEntries.map((filename) => (
              <Card key={filename} style={styles.row}>
                <View style={styles.rowMain}>
                  <Text style={styles.filename}>{filename}</Text>
                  <Text style={styles.rowMeta}>Применено {dateFormatter.format(new Date(applied.get(filename)!))}</Text>
                </View>
              </Card>
            ))}
          </View>
        </>
      ) : null}
    </ScrollView>
  );
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
  serverLabel: {
    fontFamily: font.bodySemiBold,
    fontSize: 14,
    color: colors.text,
  },
  hint: {
    fontFamily: font.body,
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 4,
    marginBottom: spacing.md,
  },
  warningCard: {
    borderColor: colors.danger,
  },
  warningTitle: {
    fontFamily: font.bodySemiBold,
    fontSize: 14,
    color: colors.text,
    marginBottom: 4,
  },
  list: {
    gap: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  rowMain: {
    flex: 1,
  },
  filename: {
    fontFamily: font.bodySemiBold,
    fontSize: 13,
    color: colors.text,
  },
  rowMeta: {
    fontFamily: font.body,
    fontSize: 11.5,
    color: colors.textMuted,
    marginTop: 2,
  },
  pill: {
    width: 24,
    height: 24,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  pillApplied: {
    backgroundColor: 'rgba(79, 190, 122, 0.14)',
    borderColor: colors.success,
  },
  pillMissing: {
    backgroundColor: 'rgba(209, 84, 63, 0.14)',
    borderColor: colors.danger,
  },
  pillText: {
    fontFamily: font.bodyBold,
    fontSize: 13,
  },
  pillTextApplied: {
    color: colors.success,
  },
  pillTextMissing: {
    color: colors.danger,
  },
  rowButton: {
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  sectionTitle: {
    fontFamily: font.heading,
    fontSize: 17,
    color: colors.text,
    marginTop: spacing.lg,
    marginBottom: 4,
  },
  label: {
    fontFamily: font.body,
    fontSize: 12,
    color: colors.textMuted,
    marginBottom: spacing.sm,
  },
  error: {
    fontFamily: font.body,
    color: colors.danger,
    marginBottom: spacing.md,
  },
});
