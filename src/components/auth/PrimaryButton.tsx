import React from 'react';
import {ActivityIndicator, Pressable, StyleSheet, Text} from 'react-native';

import {palette} from '../../theme/colors';
import {radii, shadowPresets} from '../../theme/shape';
import {spacing} from '../../theme/spacing';

interface PrimaryButtonProps {
  loading?: boolean;
  onPress: () => void;
  title: string;
}

export const PrimaryButton = ({
  loading = false,
  onPress,
  title,
}: PrimaryButtonProps) => {
  return (
    <Pressable
      disabled={loading}
      onPress={onPress}
      style={({pressed}) => [
        styles.button,
        pressed && !loading ? styles.buttonPressed : null,
        loading ? styles.buttonDisabled : null,
      ]}>
      {loading ? (
        <ActivityIndicator color={palette.textPrimary} />
      ) : (
        <Text style={styles.buttonLabel}>{title}</Text>
      )}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    backgroundColor: palette.primary,
    borderRadius: radii.md,
    height: 56,
    justifyContent: 'center',
    marginTop: spacing.sm,
    ...shadowPresets.soft,
  },
  buttonDisabled: {
    opacity: 0.75,
  },
  buttonLabel: {
    color: palette.textPrimary,
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  buttonPressed: {
    opacity: 0.9,
  },
});
