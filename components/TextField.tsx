import { useState } from 'react';
import { StyleSheet, Text, TextInput, View, type StyleProp, type TextInputProps, type ViewStyle } from 'react-native';
import { colors, font, radii } from '../lib/theme';

type Props = TextInputProps & {
  label?: string;
  error?: string | null;
  containerStyle?: StyleProp<ViewStyle>;
};

export function TextField({ label, error, containerStyle, style, onFocus, onBlur, ...rest }: Props) {
  const [focused, setFocused] = useState(false);

  const input = (
    <TextInput
      placeholderTextColor={colors.textDim}
      {...rest}
      onFocus={(e) => {
        setFocused(true);
        onFocus?.(e);
      }}
      onBlur={(e) => {
        setFocused(false);
        onBlur?.(e);
      }}
      style={[styles.input, focused && styles.inputFocused, error && styles.inputError, style]}
    />
  );

  if (!label && !error) return input;

  return (
    <View style={containerStyle}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      {input}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    fontFamily: font.bodyMedium,
    fontSize: 12.5,
    color: colors.textMuted,
    marginBottom: 6,
  },
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
  inputFocused: {
    borderColor: colors.accentBorder,
  },
  inputError: {
    borderColor: colors.danger,
  },
  error: {
    fontFamily: font.body,
    fontSize: 12,
    color: colors.danger,
    marginTop: 6,
  },
});
