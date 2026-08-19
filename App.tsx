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
import { configureSupabase, currentServer } from './lib/supabase';
import { resolveSelectedServer, type ServerConfig } from './lib/serverConfig';
import { colors, fontsToLoad } from './lib/theme';

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
    return <AuthScreen currentServer={currentServer} onServerChange={onServerChange} />;
  }

  if (profile?.must_change_password) {
    return <ForceChangePasswordScreen />;
  }

  if (!profile?.full_name?.trim()) {
    return <ProfileScreen />;
  }

  return <Dashboard />;
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
      <SafeAreaView style={styles.container}>
        {ready ? (
          <AuthProvider key={`${server.id}:${server.url}`}>
            <Root currentServer={server} onServerChange={handleServerChange} />
          </AuthProvider>
        ) : (
          <View style={styles.center}>
            <ActivityIndicator color={colors.accent} />
          </View>
        )}
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
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
  },
});
