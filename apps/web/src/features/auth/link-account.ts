import { FirebaseError } from 'firebase/app';
import {
  EmailAuthProvider,
  GoogleAuthProvider,
  linkWithCredential,
  linkWithPopup,
  signInWithCredential,
  signInWithEmailAndPassword,
  signInWithPopup,
  type Auth,
} from 'firebase/auth';
import { api, unwrap } from '@/lib/api';

/** merged=true のときは既存アカウントにログインし、匿名ユーザーの記録をそちらへ移した */
export type LinkResult = { merged: boolean; movedSeasons: number };

async function mergeInto(anonymousIdToken: string | null): Promise<LinkResult> {
  if (!anonymousIdToken) return { merged: false, movedSeasons: 0 };
  const res = await unwrap(await api.api.me.merge.$post({ json: { anonymousIdToken } }));
  return { merged: true, movedSeasons: res.movedSeasons };
}

const errorCode = (e: unknown) => (e instanceof FirebaseError ? e.code : '');

/**
 * 匿名ユーザーを Google アカウントにひも付ける（uid は変わらない）。
 * そのアカウントが登録済みなら、そちらにログインして匿名ユーザーの記録を移す。
 */
export async function continueWithGoogle(auth: Auth): Promise<LinkResult> {
  const provider = new GoogleAuthProvider();
  const user = auth.currentUser;
  if (!user?.isAnonymous) {
    await signInWithPopup(auth, provider);
    return { merged: false, movedSeasons: 0 };
  }
  try {
    await linkWithPopup(user, provider);
    await user.getIdToken(true);
    return { merged: false, movedSeasons: 0 };
  } catch (e) {
    const credential = e instanceof FirebaseError ? GoogleAuthProvider.credentialFromError(e) : null;
    if (errorCode(e) !== 'auth/credential-already-in-use' || !credential) throw e;
    const anonymousIdToken = await user.getIdToken();
    await signInWithCredential(auth, credential);
    return mergeInto(anonymousIdToken);
  }
}

/**
 * 匿名ユーザーをメールアドレスとパスワードで登録する（uid は変わらない）。
 * 登録済みのメールアドレスなら、そのアカウントにログインして匿名ユーザーの記録を移す。
 */
export async function continueWithEmail(auth: Auth, email: string, password: string): Promise<LinkResult> {
  const user = auth.currentUser;
  if (!user?.isAnonymous) {
    await signInWithEmailAndPassword(auth, email, password);
    return { merged: false, movedSeasons: 0 };
  }
  try {
    await linkWithCredential(user, EmailAuthProvider.credential(email, password));
    await user.getIdToken(true);
    return { merged: false, movedSeasons: 0 };
  } catch (e) {
    if (errorCode(e) !== 'auth/email-already-in-use') throw e;
    const anonymousIdToken = await user.getIdToken();
    await signInWithEmailAndPassword(auth, email, password);
    return mergeInto(anonymousIdToken);
  }
}

const AUTH_ERROR_MESSAGES: Record<string, string> = {
  'auth/invalid-credential': 'メールアドレスかパスワードが違います',
  'auth/wrong-password': 'メールアドレスかパスワードが違います',
  'auth/invalid-email': 'メールアドレスの形式が正しくありません',
  'auth/weak-password': 'パスワードは6文字以上にしてください',
  'auth/too-many-requests': '試行回数が多すぎます。しばらくしてから再度お試しください',
  'auth/popup-blocked': 'ポップアップがブロックされました。ブラウザの設定を確認してください',
  'auth/network-request-failed': '通信に失敗しました。接続を確認してください',
};

/** ポップアップを閉じただけのときは null */
export function authErrorMessage(e: unknown): string | null {
  const code = errorCode(e);
  if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return null;
  return AUTH_ERROR_MESSAGES[code] ?? (e instanceof Error ? e.message : '登録に失敗しました');
}
