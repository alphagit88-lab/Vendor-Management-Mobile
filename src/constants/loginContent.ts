import {LoginScreenContent} from '../types/auth';

export type LoginContentPreviewMode = 'ready' | 'empty' | 'error';

export const LOGIN_CONTENT_PREVIEW_MODE: LoginContentPreviewMode = 'ready';

export const defaultLoginScreenContent: LoginScreenContent = {
  badgeLabel: 'VM',
  eyebrow: 'Jenko Coffee Vendor',
  title: 'Sign in to your workspace',
  subtitle:
    'Keep vendors, approvals, and operations aligned from one clean mobile experience.',
  formTitle: 'Welcome back',
  formDescription: 'Use your work credentials to continue.',
  identifierLabel: 'Email or phone',
  identifierPlaceholder: 'name@company.com',
  passwordLabel: 'Password',
  passwordPlaceholder: 'Enter your password',
  rememberMeLabel: 'Remember me',
  forgotPasswordLabel: 'Forgot password?',
  primaryActionLabel: 'Login',
  secondaryActionLabel: 'Need help?',
  footerPrompt: 'No account yet?',
  footerActionLabel: 'Request access',
};
