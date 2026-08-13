import { Image, Modal, Pressable, StyleSheet, Text } from 'react-native';
import { colors, font } from '../lib/theme';

type Props = {
  uri: string | null;
  onClose: () => void;
};

export function ImageLightbox({ uri, onClose }: Props) {
  return (
    <Modal visible={!!uri} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityRole="button" accessibilityLabel="Закрыть просмотр изображения">
        <Pressable style={styles.imageWrap} onPress={() => {}} accessible={false}>
          {uri ? <Image source={{ uri }} style={styles.image} resizeMode="contain" /> : null}
        </Pressable>
        <Pressable style={styles.closeButton} onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Закрыть">
          <Text style={styles.closeText}>✕</Text>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: colors.overlayStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageWrap: {
    width: '90%',
    height: '80%',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  closeButton: {
    position: 'absolute',
    top: 48,
    right: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.white14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: {
    color: colors.text,
    fontSize: 20,
    fontFamily: font.bodySemiBold,
  },
});
