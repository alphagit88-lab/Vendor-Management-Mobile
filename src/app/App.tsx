import React, {useEffect, useState} from 'react';
import {
  ActivityIndicator,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {HomeScreen} from '../screens/HomeScreen';
import {LoginScreen} from '../screens/LoginScreen';
import {authSessionStorageService} from '../services/authSessionStorageService';
import {palette} from '../theme/colors';
import {spacing} from '../theme/spacing';
import {AuthSession} from '../types/auth';

const App = (): React.JSX.Element => {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [isRestoringSession, setIsRestoringSession] = useState(true);

  useEffect(() => {
    let isActive = true;

    const restoreSession = async () => {
      const storedSession = await authSessionStorageService.load();

      if (!isActive) {
        return;
      }

      setSession(storedSession);
      setIsRestoringSession(false);
    };

    restoreSession();

    return () => {
      isActive = false;
    };
  }, []);

  const handleAuthenticated = (nextSession: AuthSession) => {
    setSession(nextSession);
  };

  const handleSignOut = () => {
    setSession(null);
    authSessionStorageService.clear();
  };

  if (isRestoringSession) {
    return (
      <>
        <StatusBar
          barStyle="dark-content"
          backgroundColor={palette.background}
        />
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.loaderCard}>
            <ActivityIndicator color={palette.primaryStrong} size="large" />
            <Text style={styles.loaderTitle}>Restoring workspace</Text>
            <Text style={styles.loaderSubtitle}>
              Checking for a remembered session.
            </Text>
          </View>
        </SafeAreaView>
      </>
    );
  }

  return (
    <>
      <StatusBar barStyle="dark-content" backgroundColor={palette.background} />
      {session ? (
        <HomeScreen onSignOut={handleSignOut} session={session} />
      ) : (
        <LoginScreen onAuthenticated={handleAuthenticated} />
      )}
    </>
  );
};

export default App;

const styles = StyleSheet.create({
  loaderCard: {
    alignItems: 'center',
    backgroundColor: palette.surface,
    borderColor: palette.border,
    borderRadius: 28,
    borderWidth: 1,
    marginHorizontal: spacing.xl,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xxl,
  },
  loaderSubtitle: {
    color: palette.textMuted,
    fontSize: 14,
    fontWeight: '600',
    marginTop: spacing.xs,
    textAlign: 'center',
  },
  loaderTitle: {
    color: palette.textPrimary,
    fontSize: 22,
    fontWeight: '800',
    marginTop: spacing.lg,
    textAlign: 'center',
  },
  safeArea: {
    alignItems: 'center',
    backgroundColor: palette.background,
    flex: 1,
    justifyContent: 'center',
  },
});
