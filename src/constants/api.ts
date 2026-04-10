const BASE_URL = 'https://svsoft.io/';

const normalizedBaseUrl = BASE_URL.replace(/\/+$/, '');

export const BACKEND_BASE_URL = normalizedBaseUrl;
export const API_BASE_URL = `${BACKEND_BASE_URL}/api`;

export const buildApiUrl = (path: string) =>
  `${API_BASE_URL}/${path.replace(/^\/+/, '')}`;

export const buildBackendUrl = (path: string) => {
  if (/^https?:\/\//i.test(path)) {
    return path;
  }

  return `${BACKEND_BASE_URL}/${path.replace(/^\/+/, '')}`;
};
