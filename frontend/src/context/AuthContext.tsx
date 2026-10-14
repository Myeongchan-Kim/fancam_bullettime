import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import {
  getStoredAdminKey,
  setStoredAdminKey,
  clearStoredAdminKey,
  ADMIN_KEY_CHANGE_EVENT,
} from '../api/client';

export { getStoredAdminKey, setStoredAdminKey, clearStoredAdminKey };

interface AuthContextValue {
  adminKey: string;
  isAdmin: boolean;
  setAdminKey: (key: string) => void;
  clearAdminKey: () => void;
  promptForAdminKey: (message?: string) => string | null;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [adminKey, setAdminKeyState] = useState<string>(() => getStoredAdminKey());

  const setAdminKey = useCallback((key: string) => {
    setStoredAdminKey(key);
    setAdminKeyState(key.trim());
  }, []);

  const clearAdminKey = useCallback(() => {
    clearStoredAdminKey();
    setAdminKeyState('');
  }, []);

  const promptForAdminKey = useCallback(
    (message: string = '관리자 작업에는 Admin Key가 필요합니다. Admin Key를 입력해주세요:') => {
      const current = getStoredAdminKey();
      if (current) return current;
      const input = window.prompt(message);
      if (input && input.trim()) {
        setAdminKey(input.trim());
        return input.trim();
      }
      return null;
    },
    [setAdminKey]
  );

  useEffect(() => {
    const handleStorage = () => {
      setAdminKeyState(getStoredAdminKey());
    };
    window.addEventListener('storage', handleStorage);
    window.addEventListener(ADMIN_KEY_CHANGE_EVENT, handleStorage);
    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener(ADMIN_KEY_CHANGE_EVENT, handleStorage);
    };
  }, []);

  return (
    <AuthContext.Provider
      value={{
        adminKey,
        isAdmin: Boolean(adminKey),
        setAdminKey,
        clearAdminKey,
        promptForAdminKey,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    const fallbackKey = getStoredAdminKey();
    return {
      adminKey: fallbackKey,
      isAdmin: Boolean(fallbackKey),
      setAdminKey: setStoredAdminKey,
      clearAdminKey: clearStoredAdminKey,
      promptForAdminKey: (message = 'Admin Key를 입력해주세요:') => {
        const input = window.prompt(message);
        if (input && input.trim()) {
          setStoredAdminKey(input.trim());
          return input.trim();
        }
        return null;
      },
    };
  }
  return ctx;
}
