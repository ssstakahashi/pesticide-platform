import type { CollectorConfig } from './config';

export type SearchResult = { url: string; title: string; snippet: string };

export interface SearchProvider {
  readonly name: string;
  search(query: string, options?: { num?: number }): Promise<SearchResult[]>;
}

/** 検索APIキー未設定時。手動登録URLの巡回だけを行う */
const noneProvider: SearchProvider = {
  name: 'none',
  search: async () => [],
};

function googleCse(apiKey: string, cx: string): SearchProvider {
  return {
    name: 'google_cse',
    async search(query, { num = 10 } = {}) {
      const url = new URL('https://www.googleapis.com/customsearch/v1');
      url.search = new URLSearchParams({
        key: apiKey,
        cx,
        q: query,
        num: String(Math.min(num, 10)),
        hl: 'ja',
      }).toString();
      const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
      if (!res.ok) throw new Error(`Google CSE エラー: ${res.status} ${await res.text()}`);
      const body = (await res.json()) as { items?: { link: string; title: string; snippet?: string }[] };
      return (body.items ?? []).map((i) => ({ url: i.link, title: i.title, snippet: i.snippet ?? '' }));
    },
  };
}

function brave(apiKey: string): SearchProvider {
  return {
    name: 'brave',
    async search(query, { num = 10 } = {}) {
      const url = new URL('https://api.search.brave.com/res/v1/web/search');
      url.search = new URLSearchParams({
        q: query,
        count: String(Math.min(num, 20)),
        country: 'JP',
        search_lang: 'jp',
      }).toString();
      const res = await fetch(url, {
        headers: { Accept: 'application/json', 'X-Subscription-Token': apiKey },
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) throw new Error(`Brave Search エラー: ${res.status} ${await res.text()}`);
      const body = (await res.json()) as { web?: { results?: { url: string; title: string; description?: string }[] } };
      return (body.web?.results ?? []).map((r) => ({ url: r.url, title: r.title, snippet: r.description ?? '' }));
    },
  };
}

export function createSearchProvider(config: CollectorConfig): SearchProvider {
  switch (config.SEARCH_PROVIDER) {
    case 'google_cse':
      if (!config.GOOGLE_CSE_API_KEY || !config.GOOGLE_CSE_CX) {
        throw new Error('SEARCH_PROVIDER=google_cse には GOOGLE_CSE_API_KEY と GOOGLE_CSE_CX が必要です');
      }
      return googleCse(config.GOOGLE_CSE_API_KEY, config.GOOGLE_CSE_CX);
    case 'brave':
      if (!config.BRAVE_SEARCH_API_KEY) throw new Error('SEARCH_PROVIDER=brave には BRAVE_SEARCH_API_KEY が必要です');
      return brave(config.BRAVE_SEARCH_API_KEY);
    default:
      return noneProvider;
  }
}

/** 公式ドメインが分かっていれば site: で絞り込む */
export function buildQueries(name: string, registrant: string | null, domains: string[]): string[] {
  const site = domains.length ? ` (${domains.map((d) => `site:${d}`).join(' OR ')})` : '';
  const maker = !domains.length && registrant ? ` ${registrant.replace(/株式会社|\(株\)/g, '').trim()}` : '';
  return [`"${name}"${maker} 農薬${site}`, `"${name}" filetype:pdf${site}`];
}
