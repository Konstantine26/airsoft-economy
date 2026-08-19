import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { Button } from './Button';
import { TextField } from './TextField';
import { colors, font, radii, spacing } from '../lib/theme';
import {
  addCustomServer,
  getAllServers,
  setSelectedServerId,
  type ServerConfig,
} from '../lib/serverConfig';

const TAPS_TO_REVEAL = 8;

type Props = {
  currentServer: ServerConfig;
  onServerChange: (server: ServerConfig) => void;
};

export function AuthScreen({ currentServer, onServerChange }: Props) {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<'signIn' | 'signUp'>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [logoTaps, setLogoTaps] = useState(0);
  const [showServerPicker, setShowServerPicker] = useState(false);
  const [servers, setServers] = useState<ServerConfig[]>([]);
  const [addingServer, setAddingServer] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [newAnonKey, setNewAnonKey] = useState('');
  const [serverError, setServerError] = useState<string | null>(null);

  useEffect(() => {
    if (!showServerPicker) return;
    getAllServers().then(setServers);
  }, [showServerPicker]);

  useEffect(() => {
    if (logoTaps >= TAPS_TO_REVEAL) {
      setShowServerPicker(true);
    }
  }, [logoTaps]);

  const handleLogoPress = () => {
    setLogoTaps((prev) => (showServerPicker ? prev : prev + 1));
  };

  const handleSelectServer = async (server: ServerConfig) => {
    if (server.id === currentServer.id) return;
    await setSelectedServerId(server.id);
    onServerChange(server);
  };

  const handleAddServer = async () => {
    setServerError(null);
    if (!newUrl.trim() || !newAnonKey.trim()) {
      setServerError('Укажите URL и anon key');
      return;
    }
    const updatedCustom = await addCustomServer({
      label: newLabel,
      url: newUrl,
      anonKey: newAnonKey,
    });
    const created = updatedCustom[updatedCustom.length - 1];
    setServers(await getAllServers());
    setNewLabel('');
    setNewUrl('');
    setNewAnonKey('');
    setAddingServer(false);
    await handleSelectServer(created);
  };

  const handleSubmit = async () => {
    setError(null);
    setInfo(null);

    if (!email || !password) {
      setError('Введите email и пароль');
      return;
    }

    setSubmitting(true);
    const message =
      mode === 'signIn'
        ? await signIn(email, password)
        : await signUp(email, password, fullName);
    setSubmitting(false);

    if (message) {
      setError(message);
      return;
    }

    if (mode === 'signUp') {
      setInfo('Проверьте почту, чтобы подтвердить регистрацию, затем войдите.');
    }
  };

  return (
    <View style={styles.container}>
      <Pressable onPress={handleLogoPress} style={styles.glyph} accessibilityRole="button">
        <Text style={styles.glyphIcon}>⚔️</Text>
      </Pressable>
      <Text style={styles.title}>Airsoft Economy</Text>
      <Text style={styles.subtitle}>{mode === 'signIn' ? 'Вход' : 'Регистрация'}</Text>

      {mode === 'signUp' ? (
        <TextField
          style={styles.input}
          label="Имя"
          placeholder="Как вас называть"
          value={fullName}
          onChangeText={setFullName}
          autoCapitalize="words"
        />
      ) : null}

      <TextField
        style={styles.input}
        label="Email"
        placeholder="you@example.com"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
      />
      <TextField
        style={styles.input}
        label="Пароль"
        placeholder="••••••••"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {info ? <Text style={styles.info}>{info}</Text> : null}

      <Button
        title={mode === 'signIn' ? 'Войти' : 'Зарегистрироваться'}
        onPress={handleSubmit}
        loading={submitting}
        style={styles.submitButton}
      />

      <Pressable
        onPress={() => {
          setMode(mode === 'signIn' ? 'signUp' : 'signIn');
          setError(null);
          setInfo(null);
        }}
        accessibilityRole="button"
        accessibilityLabel={mode === 'signIn' ? 'Перейти к регистрации' : 'Перейти ко входу'}
      >
        <Text style={styles.switchText}>
          {mode === 'signIn' ? 'Нет аккаунта? Зарегистрироваться' : 'Уже есть аккаунт? Войти'}
        </Text>
      </Pressable>

      {showServerPicker ? (
        <View style={styles.serverPanel}>
          <Text style={styles.serverPanelTitle}>Сервер Supabase</Text>

          {servers.map((server) => {
            const selected = server.id === currentServer.id;
            return (
              <Pressable
                key={server.id}
                onPress={() => handleSelectServer(server)}
                style={[styles.serverRow, selected && styles.serverRowSelected]}
                accessibilityRole="button"
              >
                <View style={[styles.serverDot, selected && styles.serverDotSelected]} />
                <View style={styles.serverRowText}>
                  <Text style={styles.serverLabel}>{server.label}</Text>
                  <Text style={styles.serverUrl}>{server.url}</Text>
                </View>
              </Pressable>
            );
          })}

          {addingServer ? (
            <View style={styles.addServerForm}>
              <TextField
                style={styles.input}
                label="Название (необязательно)"
                placeholder="Мой сервер"
                value={newLabel}
                onChangeText={setNewLabel}
              />
              <TextField
                style={styles.input}
                label="URL"
                placeholder="https://example.com"
                value={newUrl}
                onChangeText={setNewUrl}
                autoCapitalize="none"
                keyboardType="url"
              />
              <TextField
                style={styles.input}
                label="Anon key"
                placeholder="eyJhbGciOi..."
                value={newAnonKey}
                onChangeText={setNewAnonKey}
                autoCapitalize="none"
                multiline
              />
              {serverError ? <Text style={styles.error}>{serverError}</Text> : null}
              <View style={styles.addServerActions}>
                <Button
                  title="Отмена"
                  variant="secondary"
                  onPress={() => {
                    setAddingServer(false);
                    setServerError(null);
                  }}
                  style={styles.addServerButton}
                />
                <Button
                  title="Сохранить"
                  onPress={handleAddServer}
                  style={styles.addServerButton}
                />
              </View>
            </View>
          ) : (
            <Pressable onPress={() => setAddingServer(true)} accessibilityRole="button">
              <Text style={styles.addServerText}>+ Добавить сервер</Text>
            </Pressable>
          )}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 26,
    backgroundColor: colors.bg,
  },
  glyph: {
    width: 56,
    height: 56,
    borderRadius: 14,
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: colors.accentBorder,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: spacing.md,
  },
  glyphIcon: {
    fontSize: 24,
  },
  title: {
    fontFamily: font.heading,
    fontSize: 24,
    letterSpacing: 0.4,
    color: colors.text,
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: font.body,
    fontSize: 13,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: 6,
    marginBottom: spacing.xxl,
  },
  input: {
    marginBottom: spacing.sm + 2,
  },
  error: {
    fontFamily: font.body,
    color: colors.danger,
    marginBottom: spacing.md,
    textAlign: 'center',
  },
  info: {
    fontFamily: font.body,
    color: colors.success,
    marginBottom: spacing.md,
    textAlign: 'center',
  },
  submitButton: {
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  switchText: {
    fontFamily: font.body,
    textAlign: 'center',
    color: colors.accent,
    fontSize: 13,
  },
  serverPanel: {
    marginTop: spacing.xxl,
    paddingTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
  },
  serverPanelTitle: {
    fontFamily: font.bodySemiBold,
    fontSize: 12,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: spacing.sm,
  },
  serverRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radii.md,
    padding: spacing.sm + 2,
    marginBottom: spacing.xs + 2,
  },
  serverRowSelected: {
    borderColor: colors.accentBorder,
    backgroundColor: colors.accentSoft,
  },
  serverDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    marginRight: spacing.sm,
  },
  serverDotSelected: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  serverRowText: {
    flex: 1,
  },
  serverLabel: {
    fontFamily: font.bodyMedium,
    fontSize: 13.5,
    color: colors.text,
  },
  serverUrl: {
    fontFamily: font.body,
    fontSize: 11.5,
    color: colors.textDim,
    marginTop: 2,
  },
  addServerText: {
    fontFamily: font.body,
    fontSize: 13,
    color: colors.accent,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
  addServerForm: {
    marginTop: spacing.sm,
  },
  addServerActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  addServerButton: {
    flex: 1,
  },
});
