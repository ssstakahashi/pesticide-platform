import { ChevronDown, HardDrive, LogOut, UserRound } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useAuth } from './auth-provider';
import { useOpenLinkDialog } from './link-dialog';

/** ヘッダー右端の利用者表示。匿名ログイン中は「この端末に保存中」と控えめに出す */
export function AccountMenu() {
  const { enabled, ready, user, isAnonymous, me, signOut } = useAuth();
  const openLinkDialog = useOpenLinkDialog();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  if (!enabled || !ready || !user) return null;

  const handleSignOut = async () => {
    setOpen(false);
    if (
      isAnonymous &&
      (me?.seasonCount ?? 0) > 0 &&
      !window.confirm(
        '未登録のままログアウトすると、この端末の記録は復元できなくなります。\n登録せずにログアウトしますか？',
      )
    ) {
      return;
    }
    await signOut();
  };

  return (
    <div ref={ref} className="relative ml-auto">
      <Button variant="ghost" size="sm" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        {isAnonymous ? <HardDrive /> : <UserRound />}
        <span className="max-w-48 truncate">{isAnonymous ? 'この端末に保存中' : (user.email ?? 'ログイン中')}</span>
        <ChevronDown />
      </Button>
      {open && (
        <div className="bg-card absolute right-0 z-20 mt-1 flex w-64 flex-col gap-3 rounded-md border p-3 text-sm shadow-md">
          {isAnonymous ? (
            <>
              <p className="text-muted-foreground">
                記録はこの端末のブラウザにだけひも付いています。登録すると別の端末でも見られます。
              </p>
              <Button
                size="sm"
                onClick={() => {
                  setOpen(false);
                  openLinkDialog();
                }}
              >
                登録して引き継ぐ
              </Button>
            </>
          ) : (
            <p className="text-muted-foreground truncate">{user.email}</p>
          )}
          <Button variant="ghost" size="sm" className="justify-start" onClick={handleSignOut}>
            <LogOut />
            ログアウト
          </Button>
        </div>
      )}
    </div>
  );
}
