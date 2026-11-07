import { Info } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useAuth } from './auth-provider';
import { useOpenLinkDialog } from './link-dialog';

const RECORD_THRESHOLD = 3;
const DISMISS_KEY = 'register-banner-dismissed-at-count';

/** 匿名ログインのまま記録が増えたときだけ、登録を案内する */
export function RegisterBanner() {
  const { isAnonymous, me } = useAuth();
  const openLinkDialog = useOpenLinkDialog();
  const [dismissedAt, setDismissedAt] = useState(() => Number(localStorage.getItem(DISMISS_KEY) ?? 0));

  const recordCount = me?.recordCount ?? 0;
  // 「あとで」を押した後は、記録がさらに倍以上に増えたらもう一度出す
  if (!isAnonymous || recordCount < RECORD_THRESHOLD || recordCount < dismissedAt * 2) return null;

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, String(recordCount));
    setDismissedAt(recordCount);
  };

  return (
    <div className="mb-6 flex flex-wrap items-center gap-3 rounded-md border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
      <Info className="size-4 shrink-0" />
      <p className="flex-1">
        散布記録が{recordCount}件になりました。ブラウザのデータを消すと記録も消えます。登録すると記録を引き継げます。
      </p>
      <div className="flex gap-2">
        <Button size="sm" onClick={openLinkDialog}>
          登録する
        </Button>
        <Button size="sm" variant="ghost" onClick={dismiss}>
          あとで
        </Button>
      </div>
    </div>
  );
}
