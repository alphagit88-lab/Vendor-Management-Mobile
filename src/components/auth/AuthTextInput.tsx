import React, {useState} from 'react';
import {
  KeyboardTypeOptions,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
} from 'react-native';

import {palette} from '../../theme/colors';

const fieldColors = {
  accent: palette.primaryStrong,
  border: palette.border,
  label: palette.textMuted,
  placeholder: '#99A79F',
  shadow: palette.shadow,
  text: palette.textPrimary,
  white: palette.white,
};

interface AuthTextInputProps {
  autoCapitalize?: TextInputProps['autoCapitalize'];
  autoComplete?: TextInputProps['autoComplete'];
  keyboardType?: KeyboardTypeOptions;
  label: string;
  onChangeText: (value: string) => void;
  onSubmitEditing?: () => void;
  placeholder: string;
  secureTextEntry?: boolean;
  value: string;
}

export const AuthTextInput = ({
  autoCapitalize = 'none',
  autoComplete,
  keyboardType = 'default',
  label,
  onChangeText,
  onSubmitEditing,
  placeholder,
  secureTextEntry = false,
  value,
}: AuthTextInputProps) => {
  const [isHidden, setIsHidden] = useState(secureTextEntry);

  return (
    <View style={styles.wrapper}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.inputShell}>
        <View style={styles.leadingIcon}>
          {secureTextEntry ? <LockIcon /> : <MailIcon />}
        </View>

        <TextInput
          autoCapitalize={autoCapitalize}
          autoComplete={autoComplete}
          autoCorrect={false}
          keyboardType={keyboardType}
          onChangeText={onChangeText}
          onSubmitEditing={onSubmitEditing}
          placeholder={placeholder}
          placeholderTextColor={fieldColors.placeholder}
          returnKeyType={secureTextEntry ? 'go' : 'next'}
          secureTextEntry={isHidden}
          selectionColor={fieldColors.accent}
          style={styles.input}
          value={value}
        />

        {secureTextEntry ? (
          <Pressable
            hitSlop={10}
            onPress={() => setIsHidden(current => !current)}
            style={styles.trailingIcon}>
            <EyeIcon />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
};

const MailIcon = () => (
  <View style={styles.iconFrame}>
    <View style={styles.mailBox} />
    <View style={[styles.mailFlap, styles.mailFlapLeft]} />
    <View style={[styles.mailFlap, styles.mailFlapRight]} />
  </View>
);

const LockIcon = () => (
  <View style={styles.iconFrame}>
    <View style={styles.lockHandle} />
    <View style={styles.lockBody} />
  </View>
);

const EyeIcon = () => (
  <View style={styles.eyeShell}>
    <View style={styles.eyePupil} />
  </View>
);

const styles = StyleSheet.create({
  eyePupil: {
    backgroundColor: fieldColors.accent,
    borderRadius: 999,
    height: 4,
    width: 4,
  },
  eyeShell: {
    alignItems: 'center',
    borderColor: fieldColors.label,
    borderRadius: 999,
    borderWidth: 1.5,
    height: 12,
    justifyContent: 'center',
    width: 18,
  },
  iconFrame: {
    alignItems: 'center',
    height: 18,
    justifyContent: 'center',
    width: 18,
  },
  input: {
    color: fieldColors.text,
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    paddingVertical: 16,
  },
  inputShell: {
    alignItems: 'center',
    backgroundColor: fieldColors.white,
    borderColor: fieldColors.border,
    borderRadius: 28,
    borderWidth: 1,
    elevation: 4,
    flexDirection: 'row',
    minHeight: 56,
    paddingHorizontal: 16,
    shadowColor: fieldColors.shadow,
    shadowOffset: {width: 0, height: 6},
    shadowOpacity: 0.1,
    shadowRadius: 16,
  },
  label: {
    color: fieldColors.label,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.2,
    marginBottom: 10,
  },
  leadingIcon: {
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    width: 20,
  },
  lockBody: {
    borderColor: fieldColors.accent,
    borderRadius: 4,
    borderWidth: 1.7,
    height: 10,
    marginTop: 7,
    width: 14,
  },
  lockHandle: {
    borderColor: fieldColors.accent,
    borderTopLeftRadius: 7,
    borderTopRightRadius: 7,
    borderWidth: 1.7,
    borderBottomWidth: 0,
    height: 9,
    position: 'absolute',
    top: 0,
    width: 10,
  },
  mailBox: {
    borderColor: fieldColors.accent,
    borderRadius: 3,
    borderWidth: 1.7,
    height: 12,
    width: 16,
  },
  mailFlap: {
    backgroundColor: fieldColors.accent,
    height: 1.7,
    position: 'absolute',
    top: 8,
    width: 8,
  },
  mailFlapLeft: {
    left: 1,
    transform: [{rotate: '34deg'}],
  },
  mailFlapRight: {
    right: 1,
    transform: [{rotate: '-34deg'}],
  },
  trailingIcon: {
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 12,
    paddingVertical: 8,
    width: 22,
  },
  wrapper: {
    marginBottom: 22,
  },
});
