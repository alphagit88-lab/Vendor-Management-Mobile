import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {palette} from '../../theme/colors';

const buttonColors = {
  button: palette.primaryStrong,
  buttonAlt: palette.accent,
  label: palette.white,
  shadow: palette.primaryStrong,
};

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
      <View style={styles.tintLeft} />
      <View style={styles.tintRight} />

      {loading ? (
        <ActivityIndicator color={buttonColors.label} />
      ) : (
        <View style={styles.content}>
          <Text style={styles.buttonLabel}>{title}</Text>
          <ArrowIcon />
        </View>
      )}
    </Pressable>
  );
};

const ArrowIcon = () => (
  <View style={styles.arrowWrap}>
    <View style={styles.arrowLine} />
    <View style={styles.arrowHeadUp} />
    <View style={styles.arrowHeadDown} />
  </View>
);

const styles = StyleSheet.create({
  arrowHeadDown: {
    backgroundColor: buttonColors.label,
    borderRadius: 999,
    height: 2,
    position: 'absolute',
    right: 1,
    top: 11,
    transform: [{rotate: '-45deg'}],
    width: 8,
  },
  arrowHeadUp: {
    backgroundColor: buttonColors.label,
    borderRadius: 999,
    height: 2,
    position: 'absolute',
    right: 1,
    top: 7,
    transform: [{rotate: '45deg'}],
    width: 8,
  },
  arrowLine: {
    backgroundColor: buttonColors.label,
    borderRadius: 999,
    height: 2,
    width: 16,
  },
  arrowWrap: {
    alignItems: 'center',
    height: 20,
    justifyContent: 'center',
    marginLeft: 12,
    position: 'relative',
    width: 20,
  },
  button: {
    alignItems: 'center',
    backgroundColor: buttonColors.button,
    borderRadius: 30,
    elevation: 8,
    height: 52,
    justifyContent: 'center',
    marginTop: 6,
    overflow: 'hidden',
    shadowColor: buttonColors.shadow,
    shadowOffset: {width: 0, height: 14},
    shadowOpacity: 0.32,
    shadowRadius: 24,
  },
  buttonDisabled: {
    opacity: 0.82,
  },
  buttonLabel: {
    color: buttonColors.label,
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  buttonPressed: {
    opacity: 0.94,
  },
  content: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    zIndex: 1,
  },
  tintLeft: {
    backgroundColor: buttonColors.buttonAlt,
    borderRadius: 999,
    height: 120,
    left: -24,
    opacity: 0.45,
    position: 'absolute',
    top: -26,
    width: 120,
  },
  tintRight: {
    backgroundColor: palette.primary,
    borderRadius: 999,
    height: 120,
    opacity: 0.35,
    position: 'absolute',
    right: -36,
    top: -28,
    width: 120,
  },
});
