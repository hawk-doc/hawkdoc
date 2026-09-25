import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import { AuthProvider, useAuth } from './AuthContext';
import { useDocumentStore } from '../hooks/useDocumentStore';

const USER = { id: 'u1', email: 'a@b.test', name: 'A' };
const b64 = (o: object) => btoa(JSON.stringify(o)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
/** An unsigned JWT is fine here — only the exp claim is read client-side */
const jwt = (expiresInSec: number) => `${b64({ alg: 'HS256' })}.${b64({ userId: USER.id, exp: Math.floor(Date.now() / 1000) + expiresInSec })}.sig`;

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } });
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, createElement(AuthProvider, null, children));
}

const signedIn = (token: string) => {
  localStorage.setItem('hawkdoc-token', token);
  localStorage.setItem('hawkdoc-user', JSON.stringify(USER));
};

const render = () => renderHook(() => ({ auth: useAuth(), store: useDocumentStore(useAuth().token) }), { wrapper: wrapper() });

const respondWith = (status: number, body: unknown = []) => {
  globalThis.fetch = vi.fn(async () => ({ ok: status < 400, status, json: async () => body, text: async () => '' }) as Response) as unknown as typeof fetch;
};

beforeEach(() => {
  respondWith(200, []);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('session expiry', () => {
  it('drops a token that expired while the app was closed', async () => {
    signedIn(jwt(-60));
    const { result } = render();

    expect(result.current.auth.token).toBeNull();
    expect(result.current.auth.sessionExpired).toBe(true);
    expect(localStorage.getItem('hawkdoc-token')).toBeNull();
  });

  it('signs out when the API rejects the token', async () => {
    signedIn(jwt(3600));
    respondWith(401, { error: 'Invalid or expired token' });
    const { result } = render();

    await waitFor(() => expect(result.current.auth.token).toBeNull());
    expect(result.current.auth.sessionExpired).toBe(true);
    expect(localStorage.getItem('hawkdoc-token')).toBeNull();
  });

  it('keeps the session when a request fails for another reason', async () => {
    signedIn(jwt(3600));
    respondWith(500, { error: 'boom' });
    const { result } = render();

    await waitFor(() => expect(result.current.store.docs).toEqual([]));
    expect(result.current.auth.token).not.toBeNull();
    expect(result.current.auth.sessionExpired).toBe(false);
  });

  it('signs out when the token expires while the tab is open', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    signedIn(jwt(2));
    const { result } = render();
    expect(result.current.auth.token).not.toBeNull();

    await act(async () => { await vi.advanceTimersByTimeAsync(2500); });

    expect(result.current.auth.token).toBeNull();
    expect(result.current.auth.sessionExpired).toBe(true);
  });

  it('ignores a 401 meant for a session that has already been replaced', async () => {
    signedIn(jwt(3600));
    const { result } = render();
    await waitFor(() => expect(result.current.auth.token).not.toBeNull());
    const current = result.current.auth.token!;

    act(() => { result.current.auth.expireSession('some-older-token'); });
    expect(result.current.auth.token).toBe(current);

    act(() => { result.current.auth.expireSession(current); });
    expect(result.current.auth.token).toBeNull();
  });

  it('does not show the expiry notice after a deliberate sign out', async () => {
    signedIn(jwt(3600));
    const { result } = render();
    await waitFor(() => expect(result.current.auth.token).not.toBeNull());

    act(() => { result.current.auth.logout(); });

    expect(result.current.auth.token).toBeNull();
    expect(result.current.auth.sessionExpired).toBe(false);
  });
});
