export type ContentLoadState = 'loading' | 'ready' | 'empty' | 'error';
export type SubmitState = 'idle' | 'loading' | 'success' | 'error';

export interface LoginFormValues {
  email: string;
  password: string;
}

export interface StoredLoginCredentials {
  email: string;
  password: string;
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
  email: string;
  password: string;
}

export interface AuthUser {
  id: number;
  name: string;
  phone: string;
  email: string;
  role: string;
}

export interface AuthSession {
  token: string;
  user: AuthUser;
  refreshToken?: string;
  userName?: string;
}

export interface ServiceResult<T> {
  ok: boolean;
  data?: T;
  message?: string;
}
