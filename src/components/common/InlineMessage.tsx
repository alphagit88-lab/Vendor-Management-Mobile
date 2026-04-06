import React from 'react';
import {StyleSheet, Text, View} from 'react-native';

import {palette} from '../../theme/colors';
import {radii} from '../../theme/shape';
import {spacing} from '../../theme/spacing';

type MessageTone = 'error' | 'info' | 'success';

interface InlineMessageProps {
  message: string;
  tone?: MessageTone;
}

const toneStyles = {
  error: {
    backgroundColor: '#FBECEE',
    borderColor: '#F3C4CA',
    textColor: palette.danger,
  },
  info: {
    backgroundColor: '#EDF4FD',
    borderColor: '#C7DCF8',
    textColor: palette.info,
  },
  success: {
    backgroundColor: '#EBF8F1',
    borderColor: '#C4E9D6',
    textColor: palette.success,
  },
};

export const InlineMessage = ({
  message,
  tone = 'error',
}: InlineMessageProps) => {
  const selectedTone = toneStyles[tone];

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: selectedTone.backgroundColor,
          borderColor: selectedTone.borderColor,
        },
      ]}>
      <Text style={[styles.message, {color: selectedTone.textColor}]}>
        {message}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    borderRadius: radii.md,
    borderWidth: 1,
    marginBottom: spacing.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  message: {
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 20,
  },
});
