import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { AxiosError } from 'axios';
import {
  clearCredentials,
  fetchMe,
  loadStoredAuth,
  loginRequest,
  logoutRequest,
  setUnauthorizedHandler,
  type AuthUser,
} from '@/lib/api';

interface AuthContextValue {
  user: AuthUser | null;
  username: string | null;
  isAuthenticated: boolean;
  /** Returns true on success, false on invalid credentials. Throws on network error. */
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  // Optimistically hydrate from the persisted token so the UI doesn't flash the
  // login screen on reload; the token is then validated against /auth/me/.
  const [user, setUser] = useState<AuthUser | null>(() => loadStoredAuth()?.user ?? null);

  const logout = useCallback(() => {
    // Fire-and-forget: clear local state immediately, invalidate the token server-side.
    void logoutRequest();
    setUser(null);
  }, []);

  // Central 401 handler wired into the axios instance.
  useEffect(() => {
    setUnauthorizedHandler(() => setUser(null));
  }, []);

  // Validate a rehydrated token on boot. A 401 is handled by the interceptor
  // (which clears the token + calls the handler above); other errors are left
  // alone so a transient network blip doesn't log the user out.
  useEffect(() => {
    if (!loadStoredAuth()) return;
    fetchMe()
      .then((me) => setUser(me))
      .catch(() => {
        /* interceptor handles 401; ignore other failures */
      });
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    try {
      const { user: authed } = await loginRequest(username, password);
      setUser(authed);
      return true;
    } catch (err) {
      // 400 (and 401) => invalid credentials; anything else is a real failure.
      if (err instanceof AxiosError) {
        const status = err.response?.status;
        if (status === 400 || status === 401) {
          clearCredentials();
          return false;
        }
      }
      throw err;
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      username: user?.username ?? null,
      isAuthenticated: Boolean(user),
      login,
      logout,
    }),
    [user, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
