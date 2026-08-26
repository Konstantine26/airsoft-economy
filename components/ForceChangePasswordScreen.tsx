import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useSavePulse } from '../hooks/useSavePulse';
import { Button } from './Button';
import { TextField } from './TextField';
import { colors, font, spacing } from '../lib/theme';

export function ForceChangePasswordScreen() {
  const { session, signOut, refreshProfile } = useAuth();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [savePulse, triggerSave] = useSavePulse();

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

    setSubmitting(false);
    triggerSave();
    await new Promise((resolve) => setTimeout(resolve, 700));
    await refreshProfile();
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
        label="Новый пароль"
        placeholder="Не короче 8 символов"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />
      <TextField
        style={styles.input}
        label="Повторите пароль"
        placeholder="Ещё раз"
        value={confirmPassword}
        onChangeText={setConfirmPassword}
        secureTextEntry
        error={error}
      />

      <Button
        title="Сохранить"
        onPress={handleSubmit}
        loading={submitting}
        successPulse={savePulse}
        style={styles.submitButton}
      />

      <Pressable onPress={signOut} accessibilityRole="button" accessibilityLabel="Выйти из аккаунта">
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
  submitButton: {
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  switchText: {
    fontFamily: font.body,
    textAlign: 'center',
    color: colors.danger,
    fontSize: 13,
  },
});
