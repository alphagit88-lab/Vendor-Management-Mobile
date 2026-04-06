import {Platform} from 'react-native';

export const radii = {
  sm: 12,
  md: 18,
  lg: 24,
  xl: 32,
  pill: 999,
};

export const shadowPresets = {
  card:
    Platform.select({
      ios: {
        shadowColor: '#213027',
        shadowOffset: {width: 0, height: 10},
        shadowOpacity: 0.12,
        shadowRadius: 22,
      },
      android: {
        elevation: 10,
      },
    }) ?? {},
  soft:
    Platform.select({
      ios: {
        shadowColor: '#213027',
        shadowOffset: {width: 0, height: 6},
        shadowOpacity: 0.08,
        shadowRadius: 14,
      },
      android: {
        elevation: 5,
      },
    }) ?? {},
};
