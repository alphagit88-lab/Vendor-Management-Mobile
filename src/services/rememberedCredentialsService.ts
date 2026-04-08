import * as Keychain from 'react-native-keychain';

import {StoredLoginCredentials} from '../types/auth';

const REMEMBERED_LOGIN_SERVICE = 'vendor-management-mobile.remembered-login';

const handleStorageError = (action: string, error: unknown) => {
  console.warn(`Unable to ${action} remembered credentials.`, error);
};

export const rememberedCredentialsService = {
  async load(): Promise<StoredLoginCredentials | null> {
    try {
      const credentials = await Keychain.getGenericPassword({
        service: REMEMBERED_LOGIN_SERVICE,
      });

      if (!credentials) {
        return null;
      }

      return {
        email: credentials.username,
        password: credentials.password,
      };
    } catch (error) {
      handleStorageError('load', error);
      return null;
    }
  },

  async save(credentials: StoredLoginCredentials): Promise<void> {
    try {
      await Keychain.setGenericPassword(
        credentials.email.trim(),
        credentials.password,
        {
          service: REMEMBERED_LOGIN_SERVICE,
        },
      );
    } catch (error) {
      handleStorageError('save', error);
    }
  },

  async clear(): Promise<void> {
    try {
      await Keychain.resetGenericPassword({
        service: REMEMBERED_LOGIN_SERVICE,
      });
    } catch (error) {
      handleStorageError('clear', error);
    }
  },
};
