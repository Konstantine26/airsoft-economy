import { StyleSheet, TextInput, type TextInputProps } from 'react-native';
import { colors, font, radii } from '../lib/theme';

export function TextField(props: TextInputProps) {
  return <TextInput placeholderTextColor={colors.textDim} {...props} style={[styles.input, props.style]} />;
}

const styles = StyleSheet.create({
  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radii.md,
    paddingVertical: 13,
    paddingHorizontal: 14,
    fontSize: 14.5,
    color: colors.text,
    fontFamily: font.body,
  },
});
