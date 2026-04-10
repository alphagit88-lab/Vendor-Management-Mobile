const BASE_URL = 'https://svsoft.io/';

const normalizedBaseUrl = BASE_URL.replace(/\/+$/, '');

export const API_BASE_URL = `${normalizedBaseUrl}/api`;

export const buildApiUrl = (path: string) =>
  `${API_BASE_URL}/${path.replace(/^\/+/, '')}`;
