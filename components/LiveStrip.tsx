import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { supabase } from '../lib/supabase';
import { formatDuration } from '../lib/format';
import { useSunMode } from '../lib/sunMode';
import { font, spacing } from '../lib/theme';

type Props = {
  gameId: string;
};

// The amber "you're in a game" bar under the header. Amber is reserved for
// this state everywhere in the app, so it reads at a glance.
export function LiveStrip({ gameId }: Props) {
  const { palette } = useSunMode();
  const [game, setGame] = useState<{ name: string; starts_at: string | null; ends_at: string | null } | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let cancelled = false;
    supabase
      .from('games')
      .select('name, starts_at, ends_at')
      .eq('id', gameId)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setGame(data ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, [gameId]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);

  let clock: string | null = null;
  if (game?.ends_at && new Date(game.ends_at).getTime() > now) {
    clock = `ещё ${formatDuration(new Date(game.ends_at).getTime() - now)}`;
  } else if (game?.ends_at) {
    clock = 'время вышло';
  } else if (game?.starts_at && new Date(game.starts_at).getTime() <= now) {
    clock = `идёт ${formatDuration(now - new Date(game.starts_at).getTime())}`;
  }

  const label = game ? `В игре · ${game.name}` : 'В игре';

  return (
    <View
      style={[styles.strip, { backgroundColor: palette.live }]}
      accessibilityRole="text"
      accessibilityLabel={clock ? `${label}, ${clock}` : label}
    >
      <View style={[styles.dot, { backgroundColor: palette.onLive }]} />
      <Text style={[styles.label, { color: palette.onLive }]} numberOfLines={1}>
        {label}
      </Text>
      {clock ? <Text style={[styles.clock, { color: palette.onLive }]}>{clock}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  strip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  label: {
    flex: 1,
    fontFamily: font.bodyBold,
    fontSize: 13,
  },
  clock: {
    fontFamily: font.bodySemiBold,
    fontSize: 13,
    fontVariant: ['tabular-nums'],
  },
});
