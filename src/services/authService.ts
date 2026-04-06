import {AuthSession, LoginRequest, ServiceResult} from '../types/auth';

const wait = (duration: number): Promise<void> =>
  new Promise(resolve => {
    setTimeout(resolve, duration);
  });

export const authService = {
  async login(request: LoginRequest): Promise<ServiceResult<AuthSession>> {
    await wait(900);

    if (request.identifier.trim().toLowerCase().includes('error')) {
      return {
        ok: false,
        message:
          'Simulated sign-in failure. Replace src/services/authService.ts with your real API call.',
      };
    }

    return {
      ok: true,
      data: {
        token: 'demo-token',
        userName: 'Vendor Manager',
      },
    };
  },
};
