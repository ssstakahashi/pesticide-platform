import { Loader2, Mail, X } from 'lucide-react';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from './auth-provider';
import { authErrorMessage, type LinkResult } from './link-account';

const LinkDialogContext = createContext<(() => void) | null>(null);

/** 登録（引き継ぎ）ダイアログを開く関数を返す */
export function useOpenLinkDialog(): () => void {
  const open = useContext(LinkDialogContext);
  if (!open) throw new Error('useOpenLinkDialog は LinkDialogProvider の中で使ってください');
  return open;
}

export function LinkDialogProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const openDialog = useCallback(() => setOpen(true), []);
  return (
    <LinkDialogContext value={openDialog}>
      {children}
      <LinkDialog open={open} onClose={() => setOpen(false)} />
    </LinkDialogContext>
  );
}

function resultMessage(result: LinkResult): string {
  if (!result.merged) return '登録しました。記録はそのまま引き継がれています。';
  return result.movedSeasons > 0
    ? `既存のアカウントにログインし、この端末の作付け${result.movedSeasons}件を移しました。`
    : '既存のアカウントにログインしました。';
}

function LinkDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { me, isAnonymous, continueWithGoogle, continueWithEmail } = useAuth();
  const ref = useRef<HTMLDialogElement>(null);
  const [showEmail, setShowEmail] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      setShowEmail(false);
      setPassword('');
      setError(null);
      setDone(null);
      dialog.showModal();
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const run = async (action: () => Promise<LinkResult>) => {
    setPending(true);
    setError(null);
    try {
      setDone(resultMessage(await action()));
    } catch (e) {
      setError(authErrorMessage(e));
    } finally {
      setPending(false);
    }
  };

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      className="bg-card text-card-foreground m-auto w-[min(92vw,400px)] rounded-xl border p-0 shadow-lg backdrop:bg-black/40"
    >
      <div className="flex flex-col gap-4 p-5">
        <div className="flex items-start justify-between gap-2">
          <h2 className="font-semibold">アカウント登録</h2>
          <Button variant="ghost" size="icon" aria-label="閉じる" className="-mt-2 -mr-2" onClick={onClose}>
            <X />
          </Button>
        </div>

        {done ? (
          <>
            <p className="text-sm">{done}</p>
            <Button onClick={onClose}>閉じる</Button>
          </>
        ) : (
          <>
            <p className="text-muted-foreground text-sm">
              {isAnonymous && me && me.recordCount > 0
                ? `いまの記録（${me.recordCount}件）をそのまま引き継いで登録します。`
                : '登録すると、別の端末やブラウザでも記録を見られます。'}
              すでにアカウントをお持ちの場合は、同じ方法でログインすると記録がそちらに移ります。
            </p>

            <Button variant="outline" disabled={pending} onClick={() => run(continueWithGoogle)}>
              {pending && !showEmail ? <Loader2 className="animate-spin" /> : <GoogleIcon />}
              Googleで続ける
            </Button>

            {showEmail ? (
              <form
                className="flex flex-col gap-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  void run(() => continueWithEmail(email.trim(), password));
                }}
              >
                <div className="flex flex-col gap-2">
                  <Label htmlFor="link-email">メールアドレス</Label>
                  <Input
                    id="link-email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="link-password">パスワード（6文字以上）</Label>
                  <Input
                    id="link-password"
                    type="password"
                    autoComplete="current-password"
                    minLength={6}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
                <Button type="submit" disabled={pending}>
                  {pending && <Loader2 className="animate-spin" />}
                  メールアドレスで続ける
                </Button>
              </form>
            ) : (
              <Button variant="outline" disabled={pending} onClick={() => setShowEmail(true)}>
                <Mail />
                メールアドレスで続ける
              </Button>
            )}

            {error && <p className="text-destructive text-sm">{error}</p>}
          </>
        )}
      </div>
    </dialog>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.1A6.6 6.6 0 0 1 5.5 12c0-.73.13-1.44.34-2.1V7.06H2.18A11 11 0 0 0 1 12c0 1.78.43 3.45 1.18 4.94l3.66-2.84z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"
      />
    </svg>
  );
}
