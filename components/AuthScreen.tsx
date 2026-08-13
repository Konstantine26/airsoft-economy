import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { Button } from './Button';
import { TextField } from './TextField';
import { colors, font, spacing } from '../lib/theme';

export function AuthScreen() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<'signIn' | 'signUp'>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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
      <View style={styles.glyph}>
        <Text style={styles.glyphIcon}>⚔️</Text>
      </View>
      <Text style={styles.title}>Airsoft Economy</Text>
      <Text style={styles.subtitle}>{mode === 'signIn' ? 'Вход' : 'Регистрация'}</Text>

      {mode === 'signUp' ? (
        <TextField
          style={styles.input}
          placeholder="Имя"
          value={fullName}
          onChangeText={setFullName}
          autoCapitalize="words"
        />
      ) : null}

      <TextField
        style={styles.input}
        placeholder="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
      />
      <TextField
        style={styles.input}
        placeholder="Пароль"
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
});
