export type DeviceType = 'smallPhone' | 'phone' | 'largePhone' | 'tablet';

const guidelineBaseWidth = 390;

export const moderateScale = (
  size: number,
  width: number,
  factor = 0.35,
): number => {
  const scaled = (Math.min(width, 520) / guidelineBaseWidth) * size;
  return Math.round(size + (scaled - size) * factor);
};

export const getDeviceType = (width: number): DeviceType => {
  if (width >= 768) {
    return 'tablet';
  }

  if (width <= 340) {
    return 'smallPhone';
  }

  if (width >= 430) {
    return 'largePhone';
  }

  return 'phone';
};

export const getHorizontalPadding = (width: number): number => {
  if (width >= 768) {
    return 40;
  }

  if (width <= 340) {
    return 16;
  }

  return 20;
};

export const getContentWidth = (width: number): number => {
  const horizontalPadding = getHorizontalPadding(width);
  const maxWidth = width >= 768 ? 680 : 520;
  return Math.min(width - horizontalPadding * 2, maxWidth);
};
