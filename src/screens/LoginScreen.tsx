import React from 'react';
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';

import {AuthTextInput} from '../components/auth/AuthTextInput';
import {LoginHero} from '../components/auth/LoginHero';
import {PrimaryButton} from '../components/auth/PrimaryButton';
import {InlineMessage} from '../components/common/InlineMessage';
import {ScreenContainer} from '../components/common/ScreenContainer';
import {StatePanel} from '../components/common/StatePanel';
import {useLoginScreen} from '../hooks/useLoginScreen';
import {palette} from '../theme/colors';
import {
  getContentWidth,
  getDeviceType,
  getHorizontalPadding,
  moderateScale,
} from '../theme/responsive';
import {radii, shadowPresets} from '../theme/shape';
import {spacing} from '../theme/spacing';

export const LoginScreen = () => {
  const {height, width} = useWindowDimensions();
  const deviceType = getDeviceType(width);
  const horizontalPadding = getHorizontalPadding(width);
  const contentWidth = getContentWidth(width);
  const cardPadding =
    deviceType === 'tablet'
      ? spacing.xxxl
      : deviceType === 'smallPhone'
      ? spacing.md
      : spacing.xl;

  const {
    content,
    contentState,
    feedbackMessage,
    formValues,
    retryContent,
    setIdentifier,
    setPassword,
    submit,
    submitState,
    toggleRememberMe,
  } = useLoginScreen();

  const showTodo = (label: string, message: string) => {
    Alert.alert(label, message);
  };

  const handleLogin = async () => {
    const success = await submit();

    if (!success) {
      return;
    }

    showTodo(
      'TODO',
      'Connect src/services/authService.ts to your backend and navigate after a successful response.',
    );
  };

  const formTitleSize = moderateScale(26, width, 0.38);

  return (
    <ScreenContainer
      contentContainerStyle={[
        styles.scrollContent,
        {
          paddingHorizontal: horizontalPadding,
          paddingVertical: deviceType === 'tablet' ? spacing.xxxl : spacing.xl,
        },
      ]}>
      <View
        style={[
          styles.canvas,
          {
            minHeight: Math.max(height - 32, 0),
          },
        ]}>
        <View style={styles.backgroundCircleTop} />
        <View style={styles.backgroundCircleBottom} />

        <View style={[styles.contentWrapper, {width: contentWidth}]}>
          <LoginHero
            badgeLabel={content.badgeLabel}
            eyebrow={content.eyebrow}
            subtitle={content.subtitle}
            title={content.title}
            width={contentWidth}
          />

          <View style={[styles.card, {padding: cardPadding}]}>
            {contentState === 'ready' ? (
              <>
                <Text
                  style={[
                    styles.formTitle,
                    {
                      fontSize: formTitleSize,
                      lineHeight: formTitleSize + 6,
                    },
                  ]}>
                  {content.formTitle}
                </Text>
                <Text style={styles.formDescription}>
                  {content.formDescription}
                </Text>

                {feedbackMessage ? (
                  <InlineMessage
                    message={feedbackMessage}
                    tone={submitState === 'success' ? 'success' : 'error'}
                  />
                ) : null}

                <AuthTextInput
                  iconLabel="@"
                  keyboardType="email-address"
                  label={content.identifierLabel}
                  onChangeText={setIdentifier}
                  placeholder={content.identifierPlaceholder}
                  value={formValues.identifier}
                />

                <AuthTextInput
                  iconLabel="*"
                  label={content.passwordLabel}
                  onChangeText={setPassword}
                  placeholder={content.passwordPlaceholder}
                  secureTextEntry
                  value={formValues.password}
                />

                <View style={styles.rowBetween}>
                  <Pressable
                    onPress={toggleRememberMe}
                    style={styles.checkboxRow}>
                    <View
                      style={[
                        styles.checkbox,
                        formValues.rememberMe ? styles.checkboxActive : null,
                      ]}>
                      {formValues.rememberMe ? (
                        <Text style={styles.checkboxTick}>✓</Text>
                      ) : null}
                    </View>
                    <Text style={styles.checkboxLabel}>
                      {content.rememberMeLabel}
                    </Text>
                  </Pressable>

                  <Pressable
                    onPress={() =>
                      showTodo(
                        'TODO',
                        'Add your forgot-password screen or API flow from this button.',
                      )
                    }>
                    <Text style={styles.linkText}>
                      {content.forgotPasswordLabel}
                    </Text>
                  </Pressable>
                </View>

                <PrimaryButton
                  loading={submitState === 'loading'}
                  onPress={handleLogin}
                  title={content.primaryActionLabel}
                />

                <Pressable
                  onPress={() =>
                    showTodo(
                      'TODO',
                      'Add your support or help action here when that flow is ready.',
                    )
                  }
                  style={styles.secondaryAction}>
                  <Text style={styles.secondaryActionLabel}>
                    {content.secondaryActionLabel}
                  </Text>
                </Pressable>

                <View style={styles.footerRow}>
                  <Text style={styles.footerText}>{content.footerPrompt}</Text>
                  <Pressable
                    onPress={() =>
                      showTodo(
                        'TODO',
                        'Link this button to your access request, sign-up, or onboarding screen.',
                      )
                    }>
                    <Text style={styles.footerLink}>
                      {content.footerActionLabel}
                    </Text>
                  </Pressable>
                </View>
              </>
            ) : (
              <StatePanel
                actionLabel={
                  contentState === 'loading' ? undefined : 'Try again'
                }
                message={
                  contentState === 'loading'
                    ? 'Preparing your login experience.'
                    : contentState === 'empty'
                    ? 'Add login copy in src/constants/loginContent.ts or return it from your backend.'
                    : 'Something went wrong while loading the login content.'
                }
                mode={contentState}
                onAction={contentState === 'loading' ? undefined : retryContent}
                title={
                  contentState === 'loading'
                    ? 'Loading screen'
                    : contentState === 'empty'
                    ? 'No content found'
                    : 'Unable to load'
                }
              />
            )}
          </View>
        </View>
      </View>
    </ScreenContainer>
  );
};

const styles = StyleSheet.create({
  backgroundCircleBottom: {
    backgroundColor: `${palette.primarySoft}A6`,
    borderRadius: radii.pill,
    bottom: 70,
    height: 160,
    left: -70,
    position: 'absolute',
    width: 160,
  },
  backgroundCircleTop: {
    backgroundColor: `${palette.primary}70`,
    borderRadius: radii.pill,
    height: 180,
    position: 'absolute',
    right: -80,
    top: -12,
    width: 180,
  },
  canvas: {
    flex: 1,
    justifyContent: 'center',
    position: 'relative',
  },
  card: {
    backgroundColor: palette.surface,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: palette.border,
    marginTop: spacing.xxl,
    ...shadowPresets.card,
  },
  checkbox: {
    alignItems: 'center',
    backgroundColor: palette.surfaceMuted,
    borderColor: palette.borderStrong,
    borderRadius: 10,
    borderWidth: 1,
    height: 24,
    justifyContent: 'center',
    marginRight: spacing.sm,
    width: 24,
  },
  checkboxActive: {
    backgroundColor: palette.primary,
    borderColor: palette.primaryStrong,
  },
  checkboxLabel: {
    color: palette.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
  checkboxRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexShrink: 1,
    marginRight: spacing.md,
  },
  checkboxTick: {
    color: palette.textPrimary,
    fontSize: 13,
    fontWeight: '800',
  },
  contentWrapper: {
    alignSelf: 'center',
    width: '100%',
  },
  footerLink: {
    color: palette.textPrimary,
    fontSize: 14,
    fontWeight: '800',
  },
  footerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginTop: spacing.lg,
  },
  footerText: {
    color: palette.textMuted,
    fontSize: 14,
    marginRight: spacing.xs,
  },
  formDescription: {
    color: palette.textMuted,
    fontSize: 15,
    lineHeight: 22,
    marginBottom: spacing.xl,
  },
  formTitle: {
    color: palette.textPrimary,
    fontWeight: '800',
    marginBottom: spacing.xs,
  },
  linkText: {
    color: palette.textPrimary,
    fontSize: 14,
    fontWeight: '700',
  },
  rowBetween: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
    marginTop: spacing.xs,
  },
  scrollContent: {
    flexGrow: 1,
  },
  secondaryAction: {
    alignItems: 'center',
    marginTop: spacing.lg,
  },
  secondaryActionLabel: {
    color: palette.textSecondary,
    fontSize: 15,
    fontWeight: '700',
  },
});
