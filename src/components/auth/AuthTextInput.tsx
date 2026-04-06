import React from 'react';
import {
  KeyboardTypeOptions,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
} from 'react-native';

import {palette} from '../../theme/colors';
import {radii, shadowPresets} from '../../theme/shape';
import {spacing} from '../../theme/spacing';

interface AuthTextInputProps {
  autoCapitalize?: TextInputProps['autoCapitalize'];
  iconLabel: string;
  keyboardType?: KeyboardTypeOptions;
  label: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  secureTextEntry?: boolean;
  value: string;
}

export const AuthTextInput = ({
  autoCapitalize = 'none',
  iconLabel,
  keyboardType = 'default',
  label,
  onChangeText,
  placeholder,
  secureTextEntry = false,
  value,
}: AuthTextInputProps) => {
  return (
    <View style={styles.wrapper}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.inputShell}>
        <View style={styles.iconContainer}>
          <Text style={styles.iconLabel}>{iconLabel}</Text>
        </View>
        <TextInput
          autoCapitalize={autoCapitalize}
          autoCorrect={false}
          keyboardType={keyboardType}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={palette.textMuted}
          secureTextEntry={secureTextEntry}
          style={styles.input}
          value={value}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  iconContainer: {
    alignItems: 'center',
    backgroundColor: palette.primarySoft,
    borderRadius: radii.pill,
    height: 38,
    justifyContent: 'center',
    marginRight: spacing.sm,
    width: 38,
  },
  iconLabel: {
    color: palette.textPrimary,
    fontSize: 14,
    fontWeight: '700',
  },
  input: {
    color: palette.textPrimary,
    flex: 1,
    fontSize: 16,
    paddingVertical: spacing.sm,
  },
  inputShell: {
    alignItems: 'center',
    backgroundColor: palette.surface,
    borderColor: palette.border,
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: 'row',
    minHeight: 58,
    paddingHorizontal: spacing.md,
    ...shadowPresets.soft,
  },
  label: {
    color: palette.textSecondary,
    fontSize: 14,
    fontWeight: '600',
    marginBottom: spacing.xs,
  },
  wrapper: {
    marginBottom: spacing.md,
  },
});
