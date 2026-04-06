import {
  defaultLoginScreenContent,
  LOGIN_CONTENT_PREVIEW_MODE,
} from '../constants/loginContent';
import {LoginScreenContent} from '../types/auth';

export const loginContentService = {
  async fetch(): Promise<LoginScreenContent | null> {
    if (LOGIN_CONTENT_PREVIEW_MODE === 'empty') {
      return null;
    }

    if (LOGIN_CONTENT_PREVIEW_MODE === 'error') {
      throw new Error(
        'Login content failed to load. Change the preview mode in src/constants/loginContent.ts or connect this service to your backend.',
      );
    }

    return defaultLoginScreenContent;
  },
};
