'use client';

import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { isSessionValid, clearSession, getRemainingSessionTime, formatRemainingTime } from '@/lib/session';
import { SESSION_CHECK_INTERVAL_MS } from '@/lib/constants';

const SessionContext = createContext(null);

export function SessionProvider({ children }) {
  const [isAdmin, setIsAdmin] = useState(false);
  const [sessionTime, setSessionTime] = useState('');

  const checkSession = useCallback(() => {
    if (isSessionValid()) {
      setIsAdmin(true);
      setSessionTime(formatRemainingTime(getRemainingSessionTime()));
    } else {
      if (isAdmin) {
        // Sesi baru saja expired
        clearSession();
        setIsAdmin(false);
        setSessionTime('');
      }
    }
  }, [isAdmin]);

  useEffect(() => {
    checkSession();
    const interval = setInterval(checkSession, SESSION_CHECK_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [checkSession]);

  const logout = useCallback(() => {
    clearSession();
    setIsAdmin(false);
    setSessionTime('');
  }, []);

  const refreshSession = useCallback(() => {
    checkSession();
  }, [checkSession]);

  return (
    <SessionContext.Provider value={{ isAdmin, sessionTime, logout, refreshSession }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used within SessionProvider');
  return ctx;
}
