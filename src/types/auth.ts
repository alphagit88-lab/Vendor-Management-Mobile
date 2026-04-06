export type ContentLoadState = 'loading' | 'ready' | 'empty' | 'error';
export type SubmitState = 'idle' | 'loading' | 'success' | 'error';

export interface LoginFormValues {
  identifier: string;
  password: string;
  rememberMe: boolean;
}

export interface LoginScreenContent {
  badgeLabel: string;
  eyebrow: string;
  title: string;
  subtitle: string;
  formTitle: string;
  formDescription: string;
  identifierLabel: string;
  identifierPlaceholder: string;
  passwordLabel: string;
  passwordPlaceholder: string;
  rememberMeLabel: string;
  forgotPasswordLabel: string;
  primaryActionLabel: string;
  secondaryActionLabel: string;
  footerPrompt: string;
  footerActionLabel: string;
}

export interface LoginRequest {
  identifier: string;
  password: string;
  rememberMe: boolean;
}

export interface AuthSession {
  token: string;
  refreshToken?: string;
  userName?: string;
}

export interface ServiceResult<T> {
  ok: boolean;
  data?: T;
  message?: string;
}
