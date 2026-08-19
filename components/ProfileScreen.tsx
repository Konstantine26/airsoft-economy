import * as ImagePicker from 'expo-image-picker';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Avatar } from './Avatar';
import { Button } from './Button';
import { TextField } from './TextField';
import { colors, font, spacing } from '../lib/theme';

const AVATAR_BUCKET = 'avatars';

type Props = {
  visible?: boolean;
  onClose?: () => void;
};

export function ProfileScreen({ visible = true, onClose }: Props) {
  const { profile, session, signOut, refreshProfile } = useAuth();
  const insets = useSafeAreaInsets();
  const [fullName, setFullName] = useState(profile?.full_name ?? '');
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) setFullName(profile?.full_name ?? '');
  }, [visible, profile?.full_name]);

  const changeAvatar = async () => {
    if (!session) return;
    setAvatarError(null);
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setAvatarError('Нет доступа к галерее');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled) return;

    setUploadingAvatar(true);
    try {
      const asset = result.assets[0];
      const arrayBuffer = await fetch(asset.uri).then((res) => res.arrayBuffer());
      const path = `${session.user.id}/avatar.jpg`;
      const { error: uploadError } = await supabase.storage
        .from(AVATAR_BUCKET)
        .upload(path, arrayBuffer, { contentType: asset.mimeType ?? 'image/jpeg', upsert: true });
      if (uploadError) throw uploadError;

      const publicUrl = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path).data.publicUrl;
      const avatarUrl = `${publicUrl}?v=${Date.now()}`;

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: avatarUrl })
        .eq('id', session.user.id);
      if (updateError) throw updateError;

      await refreshProfile();
    } catch (e) {
      setAvatarError(e instanceof Error ? e.message : 'Не удалось загрузить фото');
    } finally {
      setUploadingAvatar(false);
    }
  };

  const saveName = async () => {
    if (!session) return;
    const trimmed = fullName.trim();
    if (!trimmed) {
      setNameError('Введите позывной');
      return;
    }
    setNameError(null);
    setSaving(true);
    const { error } = await supabase.from('profiles').update({ full_name: trimmed }).eq('id', session.user.id);
    setSaving(false);
    if (error) {
      setNameError(error.message);
      return;
    }
    await refreshProfile();
    onClose?.();
  };

  const content = (
    <>
      <Pressable onPress={changeAvatar} disabled={uploadingAvatar} style={styles.avatarWrap} accessibilityRole="button" accessibilityLabel="Сменить фото профиля">
        {uploadingAvatar ? (
          <View style={[styles.avatarLoading, { width: 84, height: 84, borderRadius: 42 }]}>
            <ActivityIndicator color={colors.accent} />
          </View>
        ) : (
          <Avatar uri={profile?.avatar_url} name={profile?.full_name} size={84} />
        )}
        <Text style={styles.avatarHint}>Нажмите на фото, чтобы изменить</Text>
      </Pressable>
      {avatarError ? <Text style={styles.error}>{avatarError}</Text> : null}

      <TextField
        style={styles.input}
        label="Позывной"
        placeholder="Как вас называть в списках"
        value={fullName}
        onChangeText={setFullName}
        autoCapitalize="words"
        error={nameError}
      />
      <Button title="Сохранить" onPress={saveName} loading={saving} disabled={!fullName.trim()} style={styles.saveButton} />

      <View style={styles.infoBlock}>
        {session?.user.email ? <Text style={styles.infoLabel}>Email: {session.user.email}</Text> : null}
        {profile ? <Text style={styles.infoLabel}>Номер участника: №{profile.participant_number}</Text> : null}
      </View>

      {!onClose ? (
        <>
          <Text style={styles.forcedHint}>
            Позывной обязателен — он отображается во всех списках участников. Заполните его, чтобы продолжить.
          </Text>
          <Pressable onPress={signOut} accessibilityRole="button" accessibilityLabel="Выйти из аккаунта">
            <Text style={styles.switchText}>Выйти</Text>
          </Pressable>
        </>
      ) : null}
    </>
  );

  if (!onClose) {
    return (
      <ScrollView style={styles.forcedContainer} contentContainerStyle={styles.forcedContent}>
        <View style={styles.glyph}>
          <Text style={styles.glyphIcon}>👤</Text>
        </View>
        <Text style={styles.forcedTitle}>Заполните профиль</Text>
        {content}
      </ScrollView>
    );
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Профиль</Text>
          <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Закрыть профиль" hitSlop={8}>
            <MaterialCommunityIcons name="close" size={22} color={colors.textMuted} />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={[styles.modalContent, { paddingBottom: 24 + insets.bottom }]}>
          {content}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
  },
  headerTitle: {
    fontFamily: font.heading,
    fontSize: 17,
    color: colors.text,
  },
  modalContent: {
    padding: spacing.lg,
  },
  forcedContainer: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  forcedContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 26,
    paddingVertical: spacing.xxl,
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
  forcedTitle: {
    fontFamily: font.heading,
    fontSize: 22,
    letterSpacing: 0.4,
    color: colors.text,
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  avatarWrap: {
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  avatarLoading: {
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarHint: {
    fontFamily: font.body,
    fontSize: 12,
    color: colors.textDim,
    marginTop: spacing.sm,
  },
  input: {
    marginBottom: spacing.sm + 2,
  },
  saveButton: {
    marginBottom: spacing.md,
  },
  infoBlock: {
    gap: 4,
    marginTop: spacing.sm,
  },
  infoLabel: {
    fontFamily: font.body,
    fontSize: 12,
    color: colors.textMuted,
  },
  forcedHint: {
    fontFamily: font.body,
    fontSize: 12.5,
    color: colors.textDim,
    textAlign: 'center',
    marginTop: spacing.xl,
    marginBottom: spacing.md,
  },
  switchText: {
    fontFamily: font.body,
    textAlign: 'center',
    color: colors.danger,
    fontSize: 13,
  },
  error: {
    fontFamily: font.body,
    color: colors.danger,
    fontSize: 12,
    marginTop: 4,
    textAlign: 'center',
  },
});
