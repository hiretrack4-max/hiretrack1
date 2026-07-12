import axios, { AxiosError } from 'axios';
import type {
  DashboardStats,
  Notification,
  Paginated,
  UnreadCount,
} from '@/types/api';

/**
 * Axios instance for the HireTrack API.
 *
 * Auth model: DRF TokenAuthentication. The user logs in once via
 * `POST /api/auth/login/`; the backend returns an opaque token that we persist
 * in localStorage and attach to every request as `Authorization: Token <key>`.
 * Unlike HTTP Basic, the token never carries the raw password and avoids the
 * per-request password re-hash. `withCredentials` stays on so a session cookie
 * still flows if one is present.
 *
 * In dev, requests hit `/api` which Vite proxies to Django on :8000, keeping
 * everything same-origin.
 */

const STORAGE_KEY = 'hiretrack.auth';

/**
 * API base URL. In dev this is unset, so requests go to `/api` and the Vite
 * proxy forwards them to Django on :8000. In production (Vercel) set
 * `VITE_API_URL` to the deployed Render API base (e.g.
 * `https://hiretrack-api.onrender.com/api`) so the SPA calls it cross-origin.
 */
const API_BASE = import.meta.env.VITE_API_URL ?? '/api';

/** The authenticated user shape returned by the auth endpoints. */
export interface AuthUser {
  username: string;
  email: string;
}

export interface StoredAuth {
  token: string;
  user: AuthUser;
}

let authToken: string | null = null;

/** Persist the token + user and prime the in-memory token used by interceptors. */
export function setAuth(token: string, user: AuthUser): void {
  authToken = token;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ token, user }));
  } catch {
    /* storage may be unavailable (private mode) — keep the in-memory token */
  }
}

export function clearCredentials(): void {
  authToken = null;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* noop */
  }
}

/** Rehydrate the token + user from localStorage on app boot. */
export function loadStoredAuth(): StoredAuth | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredAuth;
    if (parsed?.token && parsed.user?.username) {
      authToken = parsed.token;
      return parsed;
    }
  } catch {
    /* corrupt entry — ignore */
  }
  return null;
}

export const api = axios.create({
  baseURL: API_BASE,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

// Attach the token header on every request when we have one.
api.interceptors.request.use((config) => {
  if (authToken) {
    config.headers.Authorization = `Token ${authToken}`;
  }
  return config;
});

/** Callback invoked on a 401 so the app can force a logout / redirect. */
let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(handler: () => void): void {
  onUnauthorized = handler;
}

api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    // The login probe uses a bare axios call (not this instance), so any 401
    // reaching here is a genuine expired/invalid session — force a logout.
    if (error.response?.status === 401) {
      clearCredentials();
      onUnauthorized?.();
    }
    return Promise.reject(error);
  },
);

// ------------------------------------------------------------------------
// Typed endpoint helpers
// ------------------------------------------------------------------------

interface LoginResponse {
  token: string;
  user: AuthUser;
}

/**
 * Exchange username + password for a token via `POST /api/auth/login/`.
 * On success the token + user are persisted and primed for subsequent requests.
 * A 400 (bad credentials) rejects with the AxiosError so the caller can show a
 * friendly message; other failures (network/server) propagate as well.
 */
export async function loginRequest(username: string, password: string): Promise<StoredAuth> {
  // Bare axios (not the shared instance) so no stale token header is attached.
  const { data } = await axios.post<LoginResponse>(
    `${API_BASE}/auth/login/`,
    { username, password },
    { withCredentials: true, headers: { 'Content-Type': 'application/json' } },
  );
  setAuth(data.token, data.user);
  return data;
}

/** Validate the stored token against `GET /api/auth/me/`. */
export async function fetchMe(): Promise<AuthUser> {
  const { data } = await api.get<AuthUser>('/auth/me/');
  return data;
}

/** Invalidate the token server-side, then clear it locally. */
export async function logoutRequest(): Promise<void> {
  try {
    await api.post('/auth/logout/');
  } catch {
    /* even if the server call fails, drop the local token below */
  } finally {
    clearCredentials();
  }
}

export async function fetchDashboardStats(): Promise<DashboardStats> {
  const { data } = await api.get<DashboardStats>('/dashboard/stats/');
  return data;
}

export async function fetchUnreadCount(): Promise<number> {
  const { data } = await api.get<UnreadCount>('/notifications/unread_count/');
  return data.unread;
}

export async function fetchNotifications(): Promise<Notification[]> {
  const { data } = await api.get<Paginated<Notification>>('/notifications/', {
    params: { ordering: '-created_at' },
  });
  return data.results;
}
