import { Link, Outlet } from '@tanstack/react-router';
import { Sprout } from 'lucide-react';
import { AccountMenu } from '@/features/auth/account-menu';
import { LinkDialogProvider } from '@/features/auth/link-dialog';
import { RegisterBanner } from '@/features/auth/register-banner';

const navLinkClass = 'rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground';

export function RootLayout() {
  return (
    <LinkDialogProvider>
      <div className="min-h-screen">
        <header className="border-b">
          <div className="mx-auto flex max-w-7xl items-center gap-6 px-4 py-3">
            <Link to="/" className="flex items-center gap-2 font-semibold">
              <Sprout className="size-5 text-emerald-600" />
              農薬検索
            </Link>
            <nav className="flex gap-1">
              <Link
                to="/"
                className={navLinkClass}
                activeProps={{ className: 'bg-accent text-foreground' }}
                activeOptions={{ exact: true, includeSearch: false }}
              >
                適用検索
              </Link>
              <Link to="/verify" className={navLinkClass} activeProps={{ className: 'bg-accent text-foreground' }}>
                使用回数チェック
              </Link>
              <Link to="/records" className={navLinkClass} activeProps={{ className: 'bg-accent text-foreground' }}>
                散布記録
              </Link>
              <Link to="/review" className={navLinkClass} activeProps={{ className: 'bg-accent text-foreground' }}>
                収集データ確認
              </Link>
            </nav>
            <AccountMenu />
          </div>
        </header>
        <main className="mx-auto max-w-7xl px-4 py-6">
          <RegisterBanner />
          <Outlet />
        </main>
      </div>
    </LinkDialogProvider>
  );
}
