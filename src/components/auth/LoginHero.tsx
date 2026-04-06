import React from 'react';
import {StyleSheet, Text, View} from 'react-native';

import {palette} from '../../theme/colors';
import {moderateScale} from '../../theme/responsive';
import {radii, shadowPresets} from '../../theme/shape';
import {spacing} from '../../theme/spacing';
import {LogoBadge} from './LogoBadge';

interface LoginHeroProps {
  badgeLabel: string;
  subtitle: string;
  title: string;
  width: number;
  eyebrow: string;
}

const previewStats = [
  {label: 'Active vendors', value: '128'},
  {label: 'Open approvals', value: '12'},
  {label: 'Pending payments', value: '08'},
];

export const LoginHero = ({
  badgeLabel,
  subtitle,
  title,
  width,
  eyebrow,
}: LoginHeroProps) => {
  const titleSize = moderateScale(32, width, 0.42);
  const subtitleSize = moderateScale(15, width, 0.26);
  const eyebrowSize = moderateScale(13, width, 0.2);

  return (
    <View style={styles.wrapper}>
      <LogoBadge label={badgeLabel} large />
      <Text style={[styles.eyebrow, {fontSize: eyebrowSize}]}>{eyebrow}</Text>
      <Text
        style={[
          styles.title,
          {fontSize: titleSize, lineHeight: titleSize + 8},
        ]}>
        {title}
      </Text>
      <Text
        style={[
          styles.subtitle,
          {fontSize: subtitleSize, lineHeight: subtitleSize + 8},
        ]}>
        {subtitle}
      </Text>

      <View style={styles.previewShell}>
        <View style={styles.previewGlowOne} />
        <View style={styles.previewGlowTwo} />
        <View style={styles.previewCard}>
          <View style={styles.previewHeader}>
            <Text style={styles.previewTitle}>Workspace snapshot</Text>
            <View style={styles.previewPill}>
              <View style={styles.previewDot} />
              <Text style={styles.previewPillText}>Ready</Text>
            </View>
          </View>

          <View style={styles.metricsRow}>
            {previewStats.map(stat => (
              <View key={stat.label} style={styles.metricCard}>
                <Text style={styles.metricValue}>{stat.value}</Text>
                <Text style={styles.metricLabel}>{stat.label}</Text>
              </View>
            ))}
          </View>

          <View style={styles.listCard}>
            <View style={styles.listRow}>
              <View
                style={[
                  styles.listBadge,
                  {backgroundColor: `${palette.info}20`},
                ]}
              />
              <View style={styles.listCopy}>
                <View style={[styles.copyLine, styles.copyLinePrimary]} />
                <View style={[styles.copyLine, styles.copyLineSecondary]} />
              </View>
            </View>

            <View style={styles.listRow}>
              <View
                style={[
                  styles.listBadge,
                  {backgroundColor: `${palette.success}20`},
                ]}
              />
              <View style={styles.listCopy}>
                <View style={[styles.copyLine, styles.copyLinePrimary]} />
                <View style={[styles.copyLine, styles.copyLineTertiary]} />
              </View>
            </View>

            <View style={styles.helperCard}>
              <View style={styles.helperIcon}>
                <Text style={styles.helperCheck}>✓</Text>
              </View>
              <View style={styles.helperCopyBlock}>
                <Text style={styles.helperTitle}>Responsive by default</Text>
                <Text style={styles.helperText}>
                  Clean reusable structure for the next screens you add in
                  `src`.
                </Text>
              </View>
            </View>
          </View>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  copyLine: {
    backgroundColor: palette.borderStrong,
    borderRadius: radii.pill,
    height: 8,
  },
  copyLinePrimary: {
    marginBottom: spacing.xs,
    width: '78%',
  },
  copyLineSecondary: {
    width: '56%',
  },
  copyLineTertiary: {
    width: '48%',
  },
  eyebrow: {
    color: palette.accent,
    fontWeight: '800',
    letterSpacing: 0.8,
    marginBottom: spacing.sm,
    marginTop: spacing.md,
    textTransform: 'uppercase',
  },
  helperCard: {
    alignItems: 'center',
    backgroundColor: palette.surface,
    borderRadius: radii.md,
    flexDirection: 'row',
    marginTop: spacing.md,
    padding: spacing.md,
    ...shadowPresets.soft,
  },
  helperCheck: {
    color: palette.success,
    fontSize: 18,
    fontWeight: '800',
  },
  helperCopyBlock: {
    flex: 1,
  },
  helperIcon: {
    alignItems: 'center',
    backgroundColor: `${palette.success}18`,
    borderRadius: radii.pill,
    height: 40,
    justifyContent: 'center',
    marginRight: spacing.sm,
    width: 40,
  },
  helperText: {
    color: palette.textMuted,
    fontSize: 13,
    lineHeight: 19,
  },
  helperTitle: {
    color: palette.textPrimary,
    fontSize: 14,
    fontWeight: '700',
    marginBottom: spacing.xxs,
  },
  listBadge: {
    borderRadius: radii.pill,
    height: 18,
    marginRight: spacing.sm,
    width: 18,
  },
  listCard: {
    backgroundColor: `${palette.surface}CC`,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: palette.border,
    marginTop: spacing.lg,
    padding: spacing.lg,
  },
  listCopy: {
    flex: 1,
  },
  listRow: {
    alignItems: 'center',
    flexDirection: 'row',
    marginBottom: spacing.md,
  },
  metricCard: {
    backgroundColor: palette.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: palette.border,
    flex: 1,
    marginHorizontal: spacing.xxs,
    minHeight: 88,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.md,
  },
  metricLabel: {
    color: palette.textMuted,
    fontSize: 12,
    lineHeight: 17,
  },
  metricValue: {
    color: palette.textPrimary,
    fontSize: 24,
    fontWeight: '800',
    marginBottom: spacing.xs,
  },
  metricsRow: {
    flexDirection: 'row',
    marginHorizontal: -spacing.xxs,
    marginTop: spacing.lg,
  },
  previewCard: {
    backgroundColor: `${palette.primarySoft}F2`,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: palette.borderStrong,
    overflow: 'hidden',
    padding: spacing.lg,
    position: 'relative',
    ...shadowPresets.card,
  },
  previewDot: {
    backgroundColor: palette.success,
    borderRadius: radii.pill,
    height: 8,
    marginRight: spacing.xs,
    width: 8,
  },
  previewGlowOne: {
    backgroundColor: `${palette.primary}A6`,
    borderRadius: radii.pill,
    height: 120,
    position: 'absolute',
    right: -20,
    top: -12,
    width: 120,
  },
  previewGlowTwo: {
    backgroundColor: `${palette.accent}1A`,
    borderRadius: radii.pill,
    height: 84,
    left: -18,
    position: 'absolute',
    top: 70,
    width: 84,
  },
  previewHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  previewPill: {
    alignItems: 'center',
    backgroundColor: palette.surface,
    borderRadius: radii.pill,
    flexDirection: 'row',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  previewPillText: {
    color: palette.textSecondary,
    fontSize: 12,
    fontWeight: '700',
  },
  previewShell: {
    marginTop: spacing.xl,
    position: 'relative',
    width: '100%',
  },
  previewTitle: {
    color: palette.textPrimary,
    fontSize: 15,
    fontWeight: '700',
  },
  subtitle: {
    color: palette.textSecondary,
    maxWidth: 540,
    textAlign: 'center',
  },
  title: {
    color: palette.textPrimary,
    fontWeight: '800',
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  wrapper: {
    alignItems: 'center',
    width: '100%',
  },
});
