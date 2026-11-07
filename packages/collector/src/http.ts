import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import iconv from 'iconv-lite';
import robotsParser from 'robots-parser';

export type FetchedResource = {
  url: string;
  status: number;
  contentType: string;
  body: Uint8Array;
};

export class FetchError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

type Robots = ReturnType<typeof robotsParser>;

function isPrivateAddress(ip: string): boolean {
  if (isIP(ip) === 6) {
    const v = ip.toLowerCase();
    if (v.startsWith('::ffff:')) return isPrivateAddress(v.slice(7));
    return v === '::1' || v === '::' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80');
  }
  const [a = 0, b = 0] = ip.split('.').map(Number);
  return (
    a === 10 ||
    a === 127 ||
    a === 0 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127)
  );
}

/** 手動登録URL経由で社内ネットワーク（DB等）へアクセスさせないため、プライベートIPを拒否する */
async function assertPublicHost(hostname: string) {
  const addresses = isIP(hostname) ? [{ address: hostname }] : await lookup(hostname, { all: true });
  if (addresses.some((a) => isPrivateAddress(a.address))) {
    throw new FetchError(`プライベートネットワークへのアクセスは許可されていません: ${hostname}`);
  }
}

/**
 * 巡回マナーを守る HTTP クライアント。
 * - robots.txt を尊重（取得失敗時は許可扱い）
 * - 同一ホストへのアクセス間隔を空ける
 * - タイムアウト・サイズ上限
 */
export class PoliteFetcher {
  private robotsCache = new Map<string, { robots: Robots | null; expiresAt: number }>();
  private hostLastAccess = new Map<string, number>();

  constructor(
    private readonly userAgent: string,
    private readonly hostIntervalMs: number,
  ) {}

  private async waitForHost(host: string) {
    const last = this.hostLastAccess.get(host) ?? 0;
    const wait = last + this.hostIntervalMs - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    this.hostLastAccess.set(host, Date.now());
  }

  private async robotsFor(url: URL): Promise<Robots | null> {
    const cached = this.robotsCache.get(url.origin);
    if (cached && cached.expiresAt > Date.now()) return cached.robots;
    const robotsUrl = `${url.origin}/robots.txt`;
    let robots: Robots | null = null;
    try {
      await this.waitForHost(url.host);
      const res = await fetch(robotsUrl, {
        headers: { 'User-Agent': this.userAgent },
        signal: AbortSignal.timeout(10_000),
      });
      if (res.ok) robots = robotsParser(robotsUrl, await res.text());
    } catch {
      robots = null;
    }
    this.robotsCache.set(url.origin, { robots, expiresAt: Date.now() + 24 * 3600_000 });
    return robots;
  }

  private async request(url: URL, accept: string | undefined): Promise<Response> {
    if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new FetchError(`未対応のURLです: ${url.href}`);
    await assertPublicHost(url.hostname);
    const robots = await this.robotsFor(url);
    if (robots && robots.isAllowed(url.href, this.userAgent) === false) {
      throw new FetchError(`robots.txt により巡回が禁止されています: ${url.href}`);
    }
    await this.waitForHost(url.host);
    return fetch(url, {
      headers: { 'User-Agent': this.userAgent, Accept: accept ?? '*/*', 'Accept-Language': 'ja' },
      redirect: 'manual',
      signal: AbortSignal.timeout(30_000),
    });
  }

  async fetch(rawUrl: string, { maxBytes, accept }: { maxBytes: number; accept?: string }): Promise<FetchedResource> {
    let url = new URL(rawUrl);
    let res = await this.request(url, accept);
    for (let hop = 0; res.status >= 300 && res.status < 400 && res.headers.get('location'); hop++) {
      if (hop >= 5) throw new FetchError(`リダイレクトが多すぎます: ${rawUrl}`);
      url = new URL(res.headers.get('location')!, url);
      res = await this.request(url, accept);
    }
    if (!res.ok) throw new FetchError(`HTTP ${res.status}: ${url.href}`, res.status);

    const declared = Number(res.headers.get('content-length') ?? 0);
    if (declared > maxBytes) throw new FetchError(`サイズ上限超過 (${declared} bytes): ${url.href}`);

    const reader = res.body?.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    if (reader) {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > maxBytes) {
          await reader.cancel();
          throw new FetchError(`サイズ上限超過 (>${maxBytes} bytes): ${url.href}`);
        }
        chunks.push(value);
      }
    }
    return {
      url: url.href,
      status: res.status,
      contentType: (res.headers.get('content-type') ?? '').toLowerCase(),
      body: Buffer.concat(chunks),
    };
  }
}

/** Content-Type または meta charset から文字コードを判定して HTML を文字列化する */
export function decodeHtml(body: Uint8Array, contentType: string): string {
  const head = Buffer.from(body.subarray(0, 4096)).toString('latin1');
  const charset =
    contentType.match(/charset=([\w-]+)/i)?.[1] ?? head.match(/<meta[^>]+charset=["']?([\w-]+)/i)?.[1] ?? 'utf-8';
  const normalized = charset.toLowerCase();
  if (/shift_jis|sjis|x-sjis|windows-31j|cp932/.test(normalized)) return iconv.decode(Buffer.from(body), 'cp932');
  if (/euc-jp/.test(normalized)) return iconv.decode(Buffer.from(body), 'euc-jp');
  return new TextDecoder('utf-8').decode(body);
}
