//const BASE_URL = 'https://jenkocoffee.com/';
const BASE_URL = 'http://192.168.8.120:5000/';

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
