// Who is logged in. The session token lives in the phone's secure storage (iOS Keychain / Android Keystore);
// the person and their roles are re-read from the server on every app start, never kept on the phone.
import * as SecureStore from 'expo-secure-store';
import { createContext, use, useCallback, useEffect, useState, type ReactNode } from 'react';

import { fetchMe, logoutOnServer, type User } from './api';

const TOKEN_KEY = 'thunder_session';

type State =
  | { status: 'loading' }
  | { status: 'out' }
  | { status: 'in'; token: string; user: User }
  // A saved login, but the server couldn't be reached to check it.
  | { status: 'offline'; token: string };

type Session = {
  state: State;
  signIn: (token: string) => Promise<void>;
  signOut: () => Promise<void>;
  retry: () => Promise<void>;
};

const SessionContext = createContext<Session | null>(null);

export function useSession(): Session {
  const s = use(SessionContext);
  if (!s) throw new Error('useSession must be used inside SessionProvider');
  return s;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>({ status: 'loading' });

  const check = useCallback(async (token: string | null) => {
    if (!token) return setState({ status: 'out' });
    try {
      const user = await fetchMe(token);
      if (user) return setState({ status: 'in', token, user });
      await SecureStore.deleteItemAsync(TOKEN_KEY);
      setState({ status: 'out' });
    } catch {
      setState({ status: 'offline', token });
    }
  }, []);

  useEffect(() => {
    SecureStore.getItemAsync(TOKEN_KEY)
      .catch(() => null)
      .then(check);
  }, [check]);

  const signIn = useCallback(
    async (token: string) => {
      await SecureStore.setItemAsync(TOKEN_KEY, token);
      await check(token);
    },
    [check],
  );

  const signOut = useCallback(async () => {
    const token = state.status === 'in' || state.status === 'offline' ? state.token : null;
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    setState({ status: 'out' });
    if (token) await logoutOnServer(token);
  }, [state]);

  const retry = useCallback(async () => {
    if (state.status === 'offline') {
      setState({ status: 'loading' });
      await check(state.token);
    }
  }, [state, check]);

  return <SessionContext value={{ state, signIn, signOut, retry }}>{children}</SessionContext>;
}
