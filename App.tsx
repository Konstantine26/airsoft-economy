import { useFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { AuthScreen } from './components/AuthScreen';
import { Dashboard } from './components/Dashboard';
import { ForceChangePasswordScreen } from './components/ForceChangePasswordScreen';
import { ProfileScreen } from './components/ProfileScreen';
import { colors, fontsToLoad } from './lib/theme';

function Root() {
  const { session, profile, loading } = useAuth();

  if (loading || (session && !profile)) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (!session) {
    return <AuthScreen />;
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

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <SafeAreaView style={styles.container}>
          {fontsLoaded ? <Root /> : <View style={styles.center}><ActivityIndicator color={colors.accent} /></View>}
          <StatusBar style="light" />
        </SafeAreaView>
      </AuthProvider>
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
