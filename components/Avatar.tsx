import { Image, StyleSheet, Text, View } from 'react-native';

type Props = {
  uri?: string | null;
  name?: string | null;
  size?: number;
};

function initials(name?: string | null) {
  const trimmed = (name ?? '').trim();
  if (!trimmed) return '?';
  const parts = trimmed.split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? '').join('') || '?';
}

export function Avatar({ uri, name, size = 40 }: Props) {
  const dimensionStyle = { width: size, height: size, borderRadius: size / 2 };

  if (uri) {
    return <Image source={{ uri }} style={[styles.image, dimensionStyle]} />;
  }

  return (
    <View style={[styles.fallback, dimensionStyle]}>
      <Text style={[styles.fallbackText, { fontSize: size * 0.4 }]}>{initials(name)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  image: {
    backgroundColor: '#f2f2f2',
  },
  fallback: {
    backgroundColor: '#ddd',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fallbackText: {
    color: '#555',
    fontWeight: '600',
  },
});
