import { useFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { AuthScreen } from './components/AuthScreen';
import { Dashboard } from './components/Dashboard';
import { ForceChangePasswordScreen } from './components/ForceChangePasswordScreen';
import { ProfileScreen } from './components/ProfileScreen';
import { ToastProvider } from './components/Toast';
import { configureSupabase, currentServer } from './lib/supabase';
import { resolveSelectedServer, type ServerConfig } from './lib/serverConfig';
import { colors, fontsToLoad, radii } from './lib/theme';
import { useWideLayout } from './hooks/useWideLayout';

function Root({
  currentServer,
  onServerChange,
}: {
  currentServer: ServerConfig;
  onServerChange: (server: ServerConfig) => void;
}) {
  const { session, profile, loading } = useAuth();

  if (loading || (session && !profile)) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (!session) {
    return (
      <FormFrame>
        <AuthScreen currentServer={currentServer} onServerChange={onServerChange} />
      </FormFrame>
    );
  }

  if (profile?.must_change_password) {
    return (
      <FormFrame>
        <ForceChangePasswordScreen />
      </FormFrame>
    );
  }

  if (!profile?.full_name?.trim()) {
    return (
      <FormFrame>
        <ProfileScreen />
      </FormFrame>
    );
  }

  return <Dashboard />;
}

// Sign-in and first-run forms are phone-sized; on a wide screen they sit in
// a centred card instead of stretching every field across the monitor.
function FormFrame({ children }: { children: React.ReactNode }) {
  const wide = useWideLayout();
  if (!wide) return <>{children}</>;
  return (
    <View style={styles.formBackdrop}>
      <View style={styles.formCard}>{children}</View>
    </View>
  );
}

export default function App() {
  const [fontsLoaded] = useFonts(fontsToLoad);
  const [server, setServer] = useState<ServerConfig | null>(null);

  useEffect(() => {
    let cancelled = false;
    resolveSelectedServer().then((resolved) => {
      if (cancelled) return;
      if (resolved.id !== currentServer.id || resolved.url !== currentServer.url) {
        configureSupabase(resolved);
      }
      setServer(resolved);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleServerChange = (next: ServerConfig) => {
    configureSupabase(next);
    setServer(next);
  };

  const ready = fontsLoaded && server;

  return (
    <SafeAreaProvider>
      {/* No bottom edge: the tab bar pads itself so its background runs under the home indicator. */}
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
        <ToastProvider>
          {ready ? (
            <AuthProvider key={`${server.id}:${server.url}`}>
              <Root currentServer={server} onServerChange={handleServerChange} />
            </AuthProvider>
          ) : (
            <View style={styles.center}>
              <ActivityIndicator color={colors.accent} />
            </View>
          )}
        </ToastProvider>
        <StatusBar style="light" />
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  formBackdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    backgroundColor: colors.bg,
  },
  formCard: {
    width: '100%',
    maxWidth: 460,
    maxHeight: 760,
    flexShrink: 1,
    minHeight: 520,
    borderRadius: radii.sheet,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.bg,
    overflow: 'hidden',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
  },
});
