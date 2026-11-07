import { useEffect, useState } from 'react';

/** Tailwind の md（768px）以上かどうか。仮想スクロールの描画を切り替えるときに使う */
export function useIsMdUp(): boolean {
  const query = '(min-width: 768px)';
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);

  useEffect(() => {
    const media = window.matchMedia(query);
    const onChange = () => setMatches(media.matches);
    onChange();
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  return matches;
}
