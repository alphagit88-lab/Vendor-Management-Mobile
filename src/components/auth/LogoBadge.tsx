import React from 'react';
import {StyleSheet, Text, View} from 'react-native';

import {palette} from '../../theme/colors';
import {radii, shadowPresets} from '../../theme/shape';

interface LogoBadgeProps {
  label: string;
  large?: boolean;
}

export const LogoBadge = ({label, large = false}: LogoBadgeProps) => {
  return (
    <View style={[styles.outer, large && styles.outerLarge]}>
      <View style={[styles.inner, large && styles.innerLarge]}>
        <Text style={[styles.label, large && styles.labelLarge]}>{label}</Text>
      </View>
      <View style={[styles.accent, large && styles.accentLarge]} />
    </View>
  );
};

const styles = StyleSheet.create({
  accent: {
    backgroundColor: palette.accent,
    borderRadius: radii.pill,
    height: 14,
    position: 'absolute',
    right: -2,
    top: 2,
    width: 14,
  },
  accentLarge: {
    height: 18,
    width: 18,
  },
  inner: {
    alignItems: 'center',
    backgroundColor: palette.primarySoft,
    borderRadius: radii.pill,
    height: 56,
    justifyContent: 'center',
    width: 56,
  },
  innerLarge: {
    height: 72,
    width: 72,
  },
  label: {
    color: palette.textPrimary,
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  labelLarge: {
    fontSize: 24,
  },
  outer: {
    alignItems: 'center',
    backgroundColor: palette.surface,
    borderRadius: radii.pill,
    height: 64,
    justifyContent: 'center',
    position: 'relative',
    width: 64,
    ...shadowPresets.soft,
  },
  outerLarge: {
    height: 82,
    width: 82,
  },
});
