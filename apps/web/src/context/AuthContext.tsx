import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { UnauthorizedError } from '../lib/documentApi';

const API_URL = import.meta.env.VITE_API_URL;

export interface AuthUser {
  id: string;
  email: string;
  name: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  logout: () => void;
  /** True after the session ended on its own (not via logout) */
  sessionExpired: boolean;
  /** End the session if `token` is still the current one */
  expireSession: (token: string) => void;
  dismissSessionExpired: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const TOKEN_KEY = 'hawkdoc-token';
const USER_KEY = 'hawkdoc-user';

// setTimeout's delay is a signed 32-bit int; longer delays fire immediately
const MAX_TIMER_MS = 2 ** 31 - 1;

/** The JWT's `exp` claim in ms, or null if it can't be read */
function tokenExpiresAt(token: string): number | null {
  try {
    const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const { exp } = JSON.parse(atob(payload)) as { exp?: unknown };
    return typeof exp === 'number' ? exp * 1000 : null;
  } catch {
    return null;
  }
}

function isTokenExpired(token: string): boolean {
  const expiresAt = tokenExpiresAt(token);
  return expiresAt !== null && expiresAt <= Date.now();
}

function clearStoredSession(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

/** A stored token that expired while the app was closed is dropped on load */
function loadSession(): { token: string | null; user: AuthUser | null; expired: boolean } {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token && isTokenExpired(token)) {
    clearStoredSession();
    return { token: null, user: null, expired: true };
  }
  return { token, user: token ? loadUser() : null, expired: false };
}

function loadUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [initial] = useState(loadSession);
  const [token, setToken] = useState<string | null>(initial.token);
  const [user, setUser] = useState<AuthUser | null>(initial.user);
  const [sessionExpired, setSessionExpired] = useState(initial.expired);
  const queryClient = useQueryClient();

  // The current token for stable callbacks. Updated at the moment the token
  // changes, not on the next render, so a 401 that lands in between is
  // already compared against the new session.
  const tokenRef = useRef(token);

  const persist = useCallback((t: string, u: AuthUser) => {
    tokenRef.current = t;
    localStorage.setItem(TOKEN_KEY, t);
    localStorage.setItem(USER_KEY, JSON.stringify(u));
    setToken(t);
    setUser(u);
    setSessionExpired(false);
  }, []);

  const expireSession = useCallback((expiredToken: string) => {
    // Ignore a late failure from a session that has already been replaced
    if (tokenRef.current !== expiredToken) return;
    tokenRef.current = null;
    clearStoredSession();
    setToken(null);
    setUser(null);
    setSessionExpired(true);
  }, []);

  const dismissSessionExpired = useCallback(() => setSessionExpired(false), []);

  // Any API call rejected with 401 ends the session, wherever it came from
  useEffect(() => {
    const onError = (error: unknown) => {
      if (error instanceof UnauthorizedError && tokenRef.current && error.isFor(tokenRef.current)) {
        expireSession(tokenRef.current);
      }
    };
    const unsubscribeQueries = queryClient.getQueryCache().subscribe((event) => {
      if (event.type === 'updated' && event.action.type === 'error') onError(event.action.error);
    });
    const unsubscribeMutations = queryClient.getMutationCache().subscribe((event) => {
      if (event.type === 'updated' && event.action.type === 'error') onError(event.action.error);
    });
    return () => {
      unsubscribeQueries();
      unsubscribeMutations();
    };
  }, [queryClient, expireSession]);

  // Sign out when the token's own expiry passes, even if the tab sits idle
  useEffect(() => {
    if (!token) return;
    const expiresAt = tokenExpiresAt(token);
    if (expiresAt === null) return;
    const timer = setTimeout(() => {
      // A capped delay can fire early; only expire once it really has
      if (isTokenExpired(token)) expireSession(token);
    }, Math.min(Math.max(expiresAt - Date.now(), 0), MAX_TIMER_MS));
    return () => clearTimeout(timer);
  }, [token, expireSession]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await fetch(`${API_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      const err = (await res.json()) as { error?: string };
      throw new Error(err.error ?? 'Login failed');
    }
    const data = (await res.json()) as { token: string; user: AuthUser };
    persist(data.token, data.user);
  }, [persist]);

  const register = useCallback(async (email: string, password: string, name: string) => {
    const res = await fetch(`${API_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, name }),
    });
    if (!res.ok) {
      const err = (await res.json()) as { error?: string };
      throw new Error(err.error ?? 'Registration failed');
    }
    const data = (await res.json()) as { token: string; user: AuthUser };
    persist(data.token, data.user);
  }, [persist]);

  const logout = useCallback(() => {
    tokenRef.current = null;
    clearStoredSession();
    setToken(null);
    setUser(null);
    setSessionExpired(false);
  }, []);

  const value = useMemo(
    () => ({ user, token, login, register, logout, sessionExpired, expireSession, dismissSessionExpired }),
    [user, token, login, register, logout, sessionExpired, expireSession, dismissSessionExpired],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
