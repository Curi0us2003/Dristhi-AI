'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { getCachedProfile, getCachedToken, cacheProfile, cacheToken, clearAuthCache } from '@/lib/auth-cache';
import {
  getIdToken,
  loginWithEmail,
  loginWithGoogle,
  logoutUser,
  resolveProfileFromFirebaseUser,
} from '@/lib/auth-service';
const AuthContext = createContext(undefined);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [firebaseUser, setFirebaseUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Optimistically load from session cache on client-side mount
    const cachedProfile = getCachedProfile();
    const cachedTokenValue = getCachedToken();
    if (cachedProfile && cachedTokenValue) {
      setUser(cachedProfile);
      setToken(cachedTokenValue);
      setLoading(false);
    } else {
      // If no cache, stop blocking loading instantly so the login page can render
      setLoading(false);
    }

    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      setFirebaseUser(fbUser);

      if (!fbUser) {
        clearAuthCache();
        setUser(null);
        setToken(null);
        setLoading(false);
        return;
      }

      try {
        const freshToken = await fbUser.getIdToken();
        cacheToken(freshToken);
        setToken(freshToken);

        const profile = await resolveProfileFromFirebaseUser(fbUser);
        if (profile) {
          cacheProfile(profile);
          setUser(profile);
        }
      } catch (error) {
        console.error('Auth state sync failed:', error);
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  const loginEmail = useCallback(async (email, password, role, adminCredentials) => {
    const profile = await loginWithEmail(email, password, role, adminCredentials);
    const freshToken = await getIdToken();
    setUser(profile);
    setToken(freshToken);
    return profile;
  }, []);

  const loginGoogle = useCallback(async (role, adminCredentials) => {
    const profile = await loginWithGoogle(role, adminCredentials);
    const freshToken = await getIdToken();
    setUser(profile);
    setToken(freshToken);
    return profile;
  }, []);

  const logout = useCallback(async () => {
    await logoutUser();
    setUser(null);
    setFirebaseUser(null);
    setToken(null);
  }, []);

  const refreshToken = useCallback(async () => {
    const freshToken = await getIdToken(true);
    setToken(freshToken);
    return freshToken;
  }, []);

  const value = useMemo(
    () => ({
      user,
      firebaseUser,
      token,
      loading,
      loginEmail,
      loginGoogle,
      logout,
      refreshToken,
    }),
    [user, firebaseUser, token, loading, loginEmail, loginGoogle, logout, refreshToken],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
