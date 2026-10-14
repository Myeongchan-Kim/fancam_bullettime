import axios from 'axios';
import { API_BASE_URL } from '../constants';

export const ADMIN_KEY_STORAGE_KEY = 'admin_key';
export const ADMIN_KEY_CHANGE_EVENT = 'admin-key-change';

export function getStoredAdminKey(): string {
  return localStorage.getItem(ADMIN_KEY_STORAGE_KEY) || '';
}

export function setStoredAdminKey(key: string): void {
  const trimmed = key.trim();
  if (trimmed) {
    localStorage.setItem(ADMIN_KEY_STORAGE_KEY, trimmed);
  } else {
    localStorage.removeItem(ADMIN_KEY_STORAGE_KEY);
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(ADMIN_KEY_CHANGE_EVENT));
  }
}

export function clearStoredAdminKey(): void {
  localStorage.removeItem(ADMIN_KEY_STORAGE_KEY);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(ADMIN_KEY_CHANGE_EVENT));
  }
}

/**
 * Shared Axios instance that automatically attaches X-Admin-Key when present in localStorage.
 */
export const apiClient = axios.create({
  baseURL: API_BASE_URL,
});

apiClient.interceptors.request.use((config) => {
  const key = getStoredAdminKey();
  if (key) {
    config.headers = config.headers || {};
    if (!config.headers['X-Admin-Key'] && !config.headers['x-admin-key']) {
      config.headers['X-Admin-Key'] = key;
    }
  }
  return config;
});
