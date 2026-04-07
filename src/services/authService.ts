import {
  AuthSession,
  AuthUser,
  LoginRequest,
  ServiceResult,
} from '../types/auth';

const LOGIN_ENDPOINT =
  'https://vendor-management-backend.vercel.app/api/auth/login';

interface LoginApiResponse {
  success?: boolean;
  token?: string;
  user?: AuthUser;
  message?: string;
}

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return 'Unable to sign in right now. Please try again.';
};

export const authService = {
  async login(request: LoginRequest): Promise<ServiceResult<AuthSession>> {
    try {
      const response = await fetch(LOGIN_ENDPOINT, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: request.email.trim(),
          password: request.password,
        }),
      });

      const payload = (await response.json()) as LoginApiResponse;

      if (!response.ok || !payload.success || !payload.token || !payload.user) {
        return {
          ok: false,
          message:
            payload.message ??
            'Sign-in failed. Please check your email and password.',
        };
      }

      return {
        ok: true,
        data: {
          token: payload.token,
          user: payload.user,
          userName: payload.user.name,
        },
      };
    } catch (error) {
      return {
        ok: false,
        message: getErrorMessage(error),
      };
    }
  },
};
