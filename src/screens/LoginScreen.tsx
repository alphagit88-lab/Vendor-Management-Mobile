import React from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';

import {AuthTextInput} from '../components/auth/AuthTextInput';
import {PrimaryButton} from '../components/auth/PrimaryButton';
import {InlineMessage} from '../components/common/InlineMessage';
import {useLoginScreen} from '../hooks/useLoginScreen';
import {palette} from '../theme/colors';
import {radii, shadowPresets} from '../theme/shape';
import {spacing} from '../theme/spacing';
import {AuthSession} from '../types/auth';

const logoImage = require('../assets/images/logo.webp');

interface LoginScreenProps {
  onAuthenticated: (session: AuthSession) => void;
}

export const LoginScreen = ({onAuthenticated}: LoginScreenProps) => {
  const {height, width} = useWindowDimensions();
  const cardWidth = Math.min(Math.max(width - 40, 0), 460);
  const logoWidth = Math.min(cardWidth * 0.58, 220);
  const {
    feedbackMessage,
    formValues,
    setEmail,
    setPassword,
    submit,
    submitState,
  } = useLoginScreen();

  const handleLogin = async () => {
    const session = await submit();

    if (session) {
      onAuthenticated(session);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboard}>
        <ScrollView
          bounces={false}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <View style={[styles.canvas, {minHeight: Math.max(height - 24, 0)}]}>
            <View style={styles.backgroundGlowMain} />
            <View style={styles.backgroundGlowTop} />
            <View style={styles.backgroundGlowBottom} />

            <View style={[styles.contentWrapper, {width: cardWidth}]}>
              <View style={styles.brandBlock}>
                <View style={styles.logoHalo} />
                <Image
                  resizeMode="contain"
                  source={logoImage}
                  style={[
                    styles.logo,
                    {width: logoWidth, height: Math.max(logoWidth * 0.62, 110)},
                  ]}
                />
                <View style={styles.brandPill}>
                  <Text style={styles.brandPillLabel}>SUPER VENDOR</Text>
                </View>
              </View>

              <View style={styles.formCard}>
                <Text style={styles.eyebrow}>Sales Workspace</Text>
                <Text style={styles.title}>Staff Sign In</Text>
                <Text style={styles.subtitle}>
                  Use your assigned credentials to access orders, customers, and
                  personal inventory.
                </Text>

                {feedbackMessage ? (
                  <InlineMessage message={feedbackMessage} tone="error" />
                ) : null}

                <AuthTextInput
                  autoCapitalize="none"
                  autoComplete="email"
                  keyboardType="email-address"
                  label="EMAIL ADDRESS"
                  onChangeText={setEmail}
                  placeholder="Enter assigned email"
                  value={formValues.email}
                />

                <AuthTextInput
                  autoCapitalize="none"
                  autoComplete="current-password"
                  label="PASSWORD"
                  onChangeText={setPassword}
                  onSubmitEditing={handleLogin}
                  placeholder="Enter password"
                  secureTextEntry
                  value={formValues.password}
                />

                <PrimaryButton
                  loading={submitState === 'loading'}
                  onPress={handleLogin}
                  title="ENTER WORKSPACE"
                />
              </View>

              <Text style={styles.footer}>Copyright 2026 Super Vendor</Text>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  backgroundGlowMain: {
    backgroundColor: `${palette.primary}55`,
    borderRadius: 999,
    height: 240,
    left: -40,
    position: 'absolute',
    top: 160,
    width: 240,
  },
  backgroundGlowBottom: {
    backgroundColor: `${palette.accent}12`,
    borderRadius: 999,
    bottom: 80,
    height: 180,
    position: 'absolute',
    right: -30,
    width: 180,
  },
  backgroundGlowTop: {
    backgroundColor: `${palette.primaryStrong}18`,
    borderRadius: 999,
    height: 300,
    position: 'absolute',
    right: -90,
    top: -30,
    width: 300,
  },
  brandBlock: {
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  brandPill: {
    backgroundColor: palette.primarySoft,
    borderColor: palette.borderStrong,
    borderRadius: radii.pill,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  brandPillLabel: {
    color: palette.primaryStrong,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
  },
  canvas: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xxl,
  },
  contentWrapper: {
    alignSelf: 'center',
    maxWidth: 460,
    width: '100%',
  },
  eyebrow: {
    color: palette.primaryStrong,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: spacing.sm,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  footer: {
    color: palette.textMuted,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    marginTop: spacing.xl,
    textAlign: 'center',
  },
  formCard: {
    backgroundColor: palette.surface,
    borderColor: palette.border,
    borderRadius: 32,
    borderWidth: 1,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xl,
    ...shadowPresets.card,
  },
  keyboard: {
    flex: 1,
  },
  logo: {
    alignSelf: 'center',
    marginBottom: spacing.md,
  },
  logoHalo: {
    alignSelf: 'center',
    backgroundColor: `${palette.primary}33`,
    borderRadius: 999,
    height: 148,
    marginBottom: -132,
    marginTop: spacing.sm,
    width: 148,
  },
  safeArea: {
    backgroundColor: palette.background,
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  subtitle: {
    color: palette.textSecondary,
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 22,
    marginBottom: spacing.xl,
    textAlign: 'center',
  },
  title: {
    color: palette.textPrimary,
    fontSize: 28,
    fontWeight: '900',
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
});
