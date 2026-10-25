import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useWideLayout } from '../hooks/useWideLayout';
import { colors, radii } from '../lib/theme';

type Props = {
  visible: boolean;
  onRequestClose: () => void;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
};

// A bottom sheet on phones; on wide screens a sheet glued to the bottom
// edge of a monitor is hard to find, so it becomes a centred dialog.
export function Sheet({ visible, onRequestClose, children, style }: Props) {
  const insets = useSafeAreaInsets();
  const wide = useWideLayout();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onRequestClose}>
      <KeyboardAvoidingView style={styles.avoider} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={[styles.backdrop, wide && styles.backdropWide]} onPress={onRequestClose}>
          <Pressable
            style={[styles.sheet, { paddingBottom: 20 + insets.bottom }, style, wide && styles.sheetWide]}
            onPress={(e) => e.stopPropagation()}
          >
            {wide ? null : <View style={styles.handle} />}
            {children}
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  avoider: {
    flex: 1,
  },
  backdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
  },
  backdropWide: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radii.sheet,
    borderTopRightRadius: radii.sheet,
    padding: 20,
    paddingTop: 8,
  },
  sheetWide: {
    width: '100%',
    maxWidth: 560,
    maxHeight: '88%',
    borderRadius: radii.sheet,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    paddingTop: 20,
    paddingBottom: 20,
  },
  handle: {
    alignSelf: 'center',
    width: 38,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.cardBorder,
    marginBottom: 14,
  },
});
