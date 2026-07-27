import { useFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, SafeAreaView, StyleSheet, View } from 'react-native';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { AuthScreen } from './components/AuthScreen';
import { Dashboard } from './components/Dashboard';
import { ForceChangePasswordScreen } from './components/ForceChangePasswordScreen';
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

  return profile?.must_change_password ? <ForceChangePasswordScreen /> : <Dashboard />;
}

export default function App() {
  const [fontsLoaded] = useFonts(fontsToLoad);

  return (
    <AuthProvider>
      <SafeAreaView style={styles.container}>
        {fontsLoaded ? <Root /> : <View style={styles.center}><ActivityIndicator color={colors.accent} /></View>}
        <StatusBar style="light" />
      </SafeAreaView>
    </AuthProvider>
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
