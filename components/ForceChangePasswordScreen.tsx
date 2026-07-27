import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { TextField } from './TextField';
import { colors, font, radii, spacing } from '../lib/theme';

export function ForceChangePasswordScreen() {
  const { session, signOut, refreshProfile } = useAuth();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    setError(null);

    if (password.length < 8) {
      setError('Пароль должен быть не короче 8 символов');
      return;
    }
    if (password !== confirmPassword) {
      setError('Пароли не совпадают');
      return;
    }

    setSubmitting(true);

    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) {
      setSubmitting(false);
      setError(updateError.message);
      return;
    }

    if (session) {
      const { error: profileError } = await supabase
        .from('profiles')
        .update({ must_change_password: false })
        .eq('id', session.user.id);
      if (profileError) {
        setSubmitting(false);
        setError(profileError.message);
        return;
      }
    }

    await refreshProfile();
    setSubmitting(false);
  };

  return (
    <View style={styles.container}>
      <View style={styles.glyph}>
        <Text style={styles.glyphIcon}>🔒</Text>
      </View>
      <Text style={styles.title}>Смена пароля</Text>
      <Text style={styles.subtitle}>
        Это предустановленная учётная запись. Придумайте новый пароль перед продолжением.
      </Text>

      <TextField
        style={styles.input}
        placeholder="Новый пароль"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />
      <TextField
        style={styles.input}
        placeholder="Повторите пароль"
        value={confirmPassword}
        onChangeText={setConfirmPassword}
        secureTextEntry
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Pressable style={styles.submitButton} onPress={handleSubmit} disabled={submitting}>
        {submitting ? <ActivityIndicator color={colors.onAccent} /> : <Text style={styles.submitButtonText}>Сохранить</Text>}
      </Pressable>

      <Pressable onPress={signOut}>
        <Text style={styles.switchText}>Выйти</Text>
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
  submitButton: {
    backgroundColor: colors.accent,
    borderRadius: radii.md,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  submitButtonText: {
    fontFamily: font.heading,
    color: colors.onAccent,
    fontSize: 15,
  },
  switchText: {
    fontFamily: font.body,
    textAlign: 'center',
    color: colors.danger,
    fontSize: 13,
  },
});
