import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {palette} from '../../theme/colors';
import {radii, shadowPresets} from '../../theme/shape';
import {spacing} from '../../theme/spacing';

type PanelMode = 'loading' | 'empty' | 'error';

interface StatePanelProps {
  actionLabel?: string;
  message: string;
  mode: PanelMode;
  onAction?: () => void;
  title: string;
}

const panelMeta = {
  loading: {
    accent: palette.info,
    icon: '…',
  },
  empty: {
    accent: palette.warning,
    icon: '0',
  },
  error: {
    accent: palette.danger,
    icon: '!',
  },
};

export const StatePanel = ({
  actionLabel,
  message,
  mode,
  onAction,
  title,
}: StatePanelProps) => {
  const meta = panelMeta[mode];

  return (
    <View style={styles.container}>
      <View style={[styles.iconShell, {backgroundColor: `${meta.accent}20`}]}>
        {mode === 'loading' ? (
          <ActivityIndicator color={meta.accent} />
        ) : (
          <Text style={[styles.iconText, {color: meta.accent}]}>
            {meta.icon}
          </Text>
        )}
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.message}>{message}</Text>
      {actionLabel && onAction ? (
        <Pressable onPress={onAction} style={styles.actionButton}>
          <Text style={styles.actionLabel}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  actionButton: {
    marginTop: spacing.lg,
  },
  actionLabel: {
    color: palette.textPrimary,
    fontSize: 15,
    fontWeight: '700',
  },
  container: {
    alignItems: 'center',
    backgroundColor: palette.surfaceMuted,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: palette.border,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xxl,
    ...shadowPresets.soft,
  },
  iconShell: {
    alignItems: 'center',
    borderRadius: radii.pill,
    height: 56,
    justifyContent: 'center',
    marginBottom: spacing.md,
    width: 56,
  },
  iconText: {
    fontSize: 24,
    fontWeight: '700',
  },
  message: {
    color: palette.textMuted,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
  title: {
    color: palette.textPrimary,
    fontSize: 20,
    fontWeight: '700',
    marginBottom: spacing.xs,
    textAlign: 'center',
  },
});
