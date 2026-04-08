import * as Keychain from 'react-native-keychain';

import {AuthSession} from '../types/auth';

const AUTH_SESSION_SERVICE = 'vendor-management-mobile.auth-session';

const isStoredSession = (value: unknown): value is AuthSession => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const session = value as Partial<AuthSession>;
  const user = session.user;

  return (
    typeof session.token === 'string' &&
    !!user &&
    typeof user === 'object' &&
    typeof user.id === 'number' &&
    typeof user.name === 'string' &&
    typeof user.email === 'string' &&
    typeof user.phone === 'string' &&
    typeof user.role === 'string'
  );
};

const handleStorageError = (action: string, error: unknown) => {
  console.warn(`Unable to ${action} auth session.`, error);
};

export const authSessionStorageService = {
  async load(): Promise<AuthSession | null> {
    try {
      const credentials = await Keychain.getGenericPassword({
        service: AUTH_SESSION_SERVICE,
      });

      if (!credentials) {
        return null;
      }

      const parsedSession = JSON.parse(credentials.password) as unknown;

      if (!isStoredSession(parsedSession)) {
        await this.clear();
        return null;
      }

      return parsedSession;
    } catch (error) {
      handleStorageError('load', error);
      return null;
    }
  },

  async save(session: AuthSession): Promise<void> {
    try {
      await Keychain.setGenericPassword(
        session.user.email || String(session.user.id),
        JSON.stringify(session),
        {
          service: AUTH_SESSION_SERVICE,
        },
      );
    } catch (error) {
      handleStorageError('save', error);
    }
  },

  async clear(): Promise<void> {
    try {
      await Keychain.resetGenericPassword({
        service: AUTH_SESSION_SERVICE,
      });
    } catch (error) {
      handleStorageError('clear', error);
    }
  },
};
