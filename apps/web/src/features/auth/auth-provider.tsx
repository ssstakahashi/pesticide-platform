import { useQuery, useQueryClient } from '@tanstack/react-query';
import { onAuthStateChanged, signInAnonymously, signOut as firebaseSignOut, type User } from 'firebase/auth';
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Me } from '@pesticide/api-contract';
import { meKey, meQuery } from '@/features/records/queries';
import { setAuthTokenProvider } from '@/lib/api';
import { auth } from '@/lib/firebase';
import { continueWithEmail, continueWithGoogle, type LinkResult } from './link-account';

let anonymousSignIn: Promise<unknown> | null = null;

/** 未ログインなら匿名でログインする（同時に呼ばれても1回だけ実行する） */
async function ensureSignedIn(): Promise<User | null> {
  if (!auth) return null;
  await auth.authStateReady();
  if (!auth.currentUser) {
    anonymousSignIn ??= signInAnonymously(auth).finally(() => {
      anonymousSignIn = null;
    });
    await anonymousSignIn;
  }
  return auth.currentUser;
}

if (auth) {
  setAuthTokenProvider(async () => {
    try {
      return (await ensureSignedIn())?.getIdToken() ?? null;
    } catch (e) {
      // 匿名ログインが無効などで失敗しても、トークンなしで送って API の 401 を表示する
      console.error('ログインに失敗しました', e);
      return null;
    }
  });
}

type AuthContextValue = {
  /** Firebase が未設定のローカル開発では false（API は AUTH_MODE=disabled の固定ユーザーで動く） */
  enabled: boolean;
  ready: boolean;
  user: User | null;
  isAnonymous: boolean;
  me: Me | undefined;
  continueWithGoogle: () => Promise<LinkResult>;
  continueWithEmail: (email: string, password: string) => Promise<LinkResult>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<User | null>(null);
  // linkWithPopup などでは User の参照が変わらないため、匿名かどうかは別に持つ
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [ready, setReady] = useState(!auth);
  const uidRef = useRef<string | null>(null);

  useEffect(() => {
    if (!auth) return;
    return onAuthStateChanged(auth, (next) => {
      if (uidRef.current !== (next?.uid ?? null)) {
        uidRef.current = next?.uid ?? null;
        queryClient.removeQueries({ queryKey: meKey });
      }
      setUser(next);
      setIsAnonymous(next?.isAnonymous ?? false);
      if (next) setReady(true);
      else void ensureSignedIn().catch((e) => console.error('匿名ログインに失敗しました', e));
    });
  }, [queryClient]);

  const me = useQuery(meQuery(ready && (!auth || Boolean(user)))).data;

  const value = useMemo<AuthContextValue>(() => {
    const afterLink = async (result: LinkResult) => {
      setIsAnonymous(auth?.currentUser?.isAnonymous ?? false);
      await queryClient.invalidateQueries({ queryKey: meKey });
      return result;
    };
    return {
      enabled: Boolean(auth),
      ready,
      user,
      isAnonymous,
      me,
      continueWithGoogle: async () => afterLink(await continueWithGoogle(auth!)),
      continueWithEmail: async (email, password) => afterLink(await continueWithEmail(auth!, email, password)),
      signOut: async () => {
        if (auth) await firebaseSignOut(auth);
      },
    };
  }, [ready, user, isAnonymous, me, queryClient]);

  return <AuthContext value={value}>{children}</AuthContext>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth は AuthProvider の中で使ってください');
  return value;
}
