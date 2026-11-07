import { Link, Outlet } from '@tanstack/react-router';
import { Sprout } from 'lucide-react';

const navLinkClass = 'rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground';

export function RootLayout() {
  return (
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
            <Link to="/review" className={navLinkClass} activeProps={{ className: 'bg-accent text-foreground' }}>
              収集データ確認
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
