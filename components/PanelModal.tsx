import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useWideLayout } from '../hooks/useWideLayout';
import { colors, radii } from '../lib/theme';

type Props = {
  visible: boolean;
  onRequestClose: () => void;
  children: React.ReactNode;
};

// Full-screen page (profile, notifications, help) on phones. On wide
// screens a full-width page of short rows is mostly empty space, so the
// same content opens as a tall centred panel over the dimmed app.
export function PanelModal({ visible, onRequestClose, children }: Props) {
  const wide = useWideLayout();
  if (!wide) {
    return (
      <Modal visible={visible} animationType="slide" onRequestClose={onRequestClose}>
        {children}
      </Modal>
    );
  }
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onRequestClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onRequestClose} accessibilityLabel="Закрыть" />
        <View style={styles.panel}>{children}</View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  panel: {
    width: '100%',
    maxWidth: 680,
    height: '100%',
    maxHeight: 860,
    borderRadius: radii.sheet,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.bg,
    overflow: 'hidden',
  },
});
