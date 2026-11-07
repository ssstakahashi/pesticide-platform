import {
  agrManufacturerDomains,
  agrPesticideDocuments,
  agrPesticideImages,
  agrPesticides,
  agrPesticideWebPages,
  type Database,
  type ReviewStatus,
  type VerificationDetails,
} from '@pesticide/db';
import { and, eq, isNull, ne, sql } from 'drizzle-orm';
import type { CollectorConfig } from './config';
import { extractPage, extractPdf, readImageInfo, type ImageCandidate, type LinkCandidate } from './extract';

type PdfCandidate = LinkCandidate & { pageUrl?: string };
import { decodeHtml, type PoliteFetcher } from './http';
import { buildQueries, type SearchProvider } from './search';
import { saveAsset, sha256 } from './storage';
import {
  classifyDocument,
  containsName,
  isOfficialUrl,
  safeDecode,
  verifyDocument,
  verifyImage,
  verifyPage,
  type PesticideIdentity,
} from './verify';

export const MAX_IMAGES_PER_PESTICIDE = 5;
const MAX_PAGES = 5;
const MAX_PDFS = 6;
const MAX_IMAGE_DOWNLOADS = 10;
const LIMITS = { html: 5 * 1024 * 1024, pdf: 30 * 1024 * 1024, image: 10 * 1024 * 1024 };
const DOC_KEYWORDS =
  /技術資料|仕様|要覧|製品資料|技術情報|製品情報|パンフ|カタログ|チラシ|リーフレット|sds|安全データ|ラベル/i;
const IMAGE_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
};

export type CollectDeps = {
  db: Database;
  config: CollectorConfig;
  fetcher: PoliteFetcher;
  search: SearchProvider;
  log: (message: string) => void;
};

export type CollectStats = {
  pagesChecked: number;
  pagesSaved: number;
  documentsSaved: number;
  imagesSaved: number;
  autoApproved: number;
  errors: number;
};

const statusFor = (details: VerificationDetails): ReviewStatus => (details.autoApproved ? 'approved' : 'pending');

type AssetTable = typeof agrPesticideWebPages | typeof agrPesticideDocuments | typeof agrPesticideImages;

/** 人が確認済み（reviewed_at あり）の行はステータスを変えず、検証結果だけ更新する */
const keepReviewedStatus = (table: AssetTable, details: VerificationDetails) =>
  sql`CASE WHEN ${table.reviewedAt} IS NULL THEN ${statusFor(details)} ELSE ${table.status} END`;

/** 既に保存済みのファイルを再検証する（公式ドメインの学習後に自動採用へ昇格させるため） */
async function refreshVerification(db: Database, table: AssetTable, id: string, details: VerificationDetails) {
  const [row] = await db
    .update(table)
    .set({
      verificationScore: details.score,
      verificationDetails: details,
      verifiedAt: new Date(),
      updatedAt: new Date(),
      status: keepReviewedStatus(table, details),
    })
    .where(and(eq(table.id, id), sql`${table.reviewedAt} IS NULL`, ne(table.status, 'approved')))
    .returning({ status: table.status });
  return row?.status === 'approved';
}

async function loadIdentity(db: Database, registrationNumber: string): Promise<PesticideIdentity | null> {
  const [p] = await db
    .select({
      registrationNumber: agrPesticides.registrationNumber,
      name: agrPesticides.name,
      registrantName: agrPesticides.registrantName,
      domains: agrManufacturerDomains.domains,
    })
    .from(agrPesticides)
    .leftJoin(agrManufacturerDomains, eq(agrManufacturerDomains.registrantName, agrPesticides.registrantName))
    .where(eq(agrPesticides.registrationNumber, registrationNumber));
  if (!p) return null;
  return {
    registrationNumber: p.registrationNumber,
    name: p.name,
    registrantName: p.registrantName,
    officialDomains: p.domains ?? [],
  };
}

async function discoverUrls(deps: CollectDeps, p: PesticideIdentity) {
  const existing = await deps.db
    .select({ url: agrPesticideWebPages.url })
    .from(agrPesticideWebPages)
    .where(
      and(
        eq(agrPesticideWebPages.registrationNumber, p.registrationNumber),
        ne(agrPesticideWebPages.status, 'rejected'),
      ),
    );
  const rejected = new Set(
    (
      await deps.db
        .select({ url: agrPesticideWebPages.url })
        .from(agrPesticideWebPages)
        .where(
          and(
            eq(agrPesticideWebPages.registrationNumber, p.registrationNumber),
            eq(agrPesticideWebPages.status, 'rejected'),
          ),
        )
    ).map((r) => r.url),
  );

  const found: { url: string; title: string }[] = [];
  for (const query of buildQueries(p.name, p.registrantName, p.officialDomains)) {
    if (deps.search.name === 'none') break;
    try {
      found.push(...(await deps.search.search(query, { num: 10 })));
    } catch (err) {
      deps.log(`  検索に失敗: ${(err as Error).message}`);
    }
  }
  // 公式ドメインの結果を優先し、タイトル等に農薬名があるものだけを候補にする
  const ranked = found
    .filter((r) => !rejected.has(r.url) && containsName(`${r.title} ${r.url}`, p.name))
    .sort((a, b) => Number(isOfficialUrl(b.url, p.officialDomains)) - Number(isOfficialUrl(a.url, p.officialDomains)));

  const pages = new Set(existing.map((e) => e.url));
  const pdfs: PdfCandidate[] = [];
  for (const r of ranked) {
    if (/\.pdf($|\?)/i.test(r.url)) pdfs.push({ url: r.url, text: r.title });
    else if (pages.size < MAX_PAGES + existing.length) pages.add(r.url);
  }
  return { pageUrls: [...pages], pdfs, manual: new Set(existing.map((e) => e.url)) };
}

export async function collectForPesticide(deps: CollectDeps, registrationNumber: string): Promise<CollectStats> {
  const { db, config, fetcher, log } = deps;
  const stats: CollectStats = {
    pagesChecked: 0,
    pagesSaved: 0,
    documentsSaved: 0,
    imagesSaved: 0,
    autoApproved: 0,
    errors: 0,
  };
  const p = await loadIdentity(db, registrationNumber);
  if (!p) throw new Error(`登録番号 ${registrationNumber} の農薬がありません`);
  log(`[${p.registrationNumber}] ${p.name}（${p.registrantName ?? '登録者不明'}）`);

  const { pageUrls, pdfs, manual } = await discoverUrls(deps, p);
  const imageCandidates: (ImageCandidate & { pageUrl: string; pageVerified: boolean })[] = [];

  for (const url of pageUrls) {
    stats.pagesChecked++;
    try {
      const res = await fetcher.fetch(url, { maxBytes: LIMITS.html, accept: 'text/html,application/xhtml+xml' });
      if (res.contentType.includes('pdf')) {
        pdfs.push({ url: res.url, text: '' });
        continue;
      }
      const page = extractPage(decodeHtml(res.body, res.contentType), res.url);
      const details = verifyPage(p, { url, ...page }, config.AUTO_APPROVE_SCORE);
      const relevant = details.checks.some((c) => c.passed && c.name !== '製造会社の公式ドメイン');
      if (!relevant && !manual.has(url)) continue;

      const [row] = await db
        .insert(agrPesticideWebPages)
        .values({
          registrationNumber,
          url,
          title: page.title || null,
          source: manual.has(url) ? 'manual' : 'search',
          httpStatus: res.status,
          lastCheckedAt: new Date(),
          status: statusFor(details),
          verificationScore: details.score,
          verificationDetails: details,
          verifiedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [agrPesticideWebPages.registrationNumber, agrPesticideWebPages.url],
          set: {
            title: page.title || null,
            httpStatus: res.status,
            lastCheckedAt: new Date(),
            verificationScore: details.score,
            verificationDetails: details,
            verifiedAt: new Date(),
            updatedAt: new Date(),
            status: keepReviewedStatus(agrPesticideWebPages, details),
          },
        })
        .returning({ status: agrPesticideWebPages.status });
      stats.pagesSaved++;
      if (details.autoApproved) stats.autoApproved++;
      if (!relevant) continue;

      const pageVerified = row?.status === 'approved';
      // 同一サイト上の PDF を候補にし、資料らしいもの・農薬名を含むものを優先する
      // （無関係な PDF は保存時の本文検証で除外される）
      const host = new URL(res.url).host;
      const relevance = (l: LinkCandidate) => {
        const label = safeDecode(`${l.text} ${l.url}`);
        return Number(containsName(label, p.name)) * 2 + Number(DOC_KEYWORDS.test(label));
      };
      pdfs.push(
        ...page.pdfLinks
          .filter((l) => new URL(l.url).host === host || relevance(l) > 0)
          .sort((a, b) => relevance(b) - relevance(a))
          .slice(0, MAX_PDFS)
          .map((l) => ({ ...l, pageUrl: res.url })),
      );
      imageCandidates.push(
        ...page.images
          .filter((i) => i.isOgImage || containsName(`${i.alt} ${i.url}`, p.name) || pageVerified)
          .map((i) => ({ ...i, pageUrl: url, pageVerified })),
      );
    } catch (err) {
      stats.errors++;
      log(`  ページ取得失敗: ${url} (${(err as Error).message})`);
      const status = (err as { status?: number }).status;
      await db
        .update(agrPesticideWebPages)
        .set({ httpStatus: status ?? null, lastCheckedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(agrPesticideWebPages.registrationNumber, registrationNumber), eq(agrPesticideWebPages.url, url)));
    }
  }

  const seenPdf = new Set<string>();
  for (const link of pdfs) {
    if (seenPdf.has(link.url) || seenPdf.size >= MAX_PDFS) continue;
    seenPdf.add(link.url);
    try {
      if (await saveDocument(deps, p, link, stats)) stats.documentsSaved++;
    } catch (err) {
      stats.errors++;
      log(`  PDF取得失敗: ${link.url} (${(err as Error).message})`);
    }
  }

  await saveImages(deps, p, imageCandidates, stats);
  log(`  → ${JSON.stringify(stats)}`);
  return stats;
}

async function saveDocument(
  deps: CollectDeps,
  p: PesticideIdentity,
  link: PdfCandidate,
  stats: CollectStats,
): Promise<boolean> {
  const res = await deps.fetcher.fetch(link.url, { maxBytes: LIMITS.pdf, accept: 'application/pdf' });
  if (Buffer.from(res.body.subarray(0, 5)).toString('latin1') !== '%PDF-') return false;

  const hash = sha256(res.body);
  const [dup] = await deps.db
    .select({ id: agrPesticideDocuments.id })
    .from(agrPesticideDocuments)
    .where(
      and(eq(agrPesticideDocuments.registrationNumber, p.registrationNumber), eq(agrPesticideDocuments.sha256, hash)),
    );

  const { text, pageCount } = await extractPdf(res.body).catch(() => ({ text: '', pageCount: 0 }));
  const details = verifyDocument(p, { url: res.url, text }, deps.config.AUTO_APPROVE_SCORE);
  if (dup) {
    if (await refreshVerification(deps.db, agrPesticideDocuments, dup.id, details)) stats.autoApproved++;
    if (link.pageUrl) {
      await deps.db
        .update(agrPesticideDocuments)
        .set({ pageUrl: link.pageUrl })
        .where(and(eq(agrPesticideDocuments.id, dup.id), isNull(agrPesticideDocuments.pageUrl)));
    }
    return false;
  }
  // 登録番号・農薬名のどちらも本文に無い PDF は別製品の資料とみなし保存しない
  if (!details.checks.some((c) => c.passed && c.name !== '製造会社の公式ドメイン')) return false;

  const { storagePath } = await saveAsset(deps.config.STORAGE_DIR, p.registrationNumber, 'documents', res.body, 'pdf');
  const fileName = decodeURIComponent(new URL(res.url).pathname.split('/').pop() ?? '');
  const inserted = await deps.db
    .insert(agrPesticideDocuments)
    .values({
      registrationNumber: p.registrationNumber,
      kind: classifyDocument(`${link.text} ${fileName}`),
      title: link.text || fileName || null,
      pageUrl: link.pageUrl ?? null,
      sourceUrl: res.url,
      storagePath,
      sha256: hash,
      byteSize: res.body.byteLength,
      contentType: 'application/pdf',
      pageCount: pageCount || null,
      status: statusFor(details),
      verificationScore: details.score,
      verificationDetails: details,
      verifiedAt: new Date(),
    })
    .onConflictDoNothing()
    .returning({ id: agrPesticideDocuments.id });
  if (inserted.length && details.autoApproved) stats.autoApproved++;
  return inserted.length > 0;
}

async function saveImages(
  deps: CollectDeps,
  p: PesticideIdentity,
  candidates: (ImageCandidate & { pageUrl: string; pageVerified: boolean })[],
  stats: CollectStats,
) {
  const { db, config, fetcher, log } = deps;
  const [{ count } = { count: 0 }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(agrPesticideImages)
    .where(
      and(eq(agrPesticideImages.registrationNumber, p.registrationNumber), ne(agrPesticideImages.status, 'rejected')),
    );
  let slots = MAX_IMAGES_PER_PESTICIDE - count;
  if (slots <= 0) return;

  const unique = [...new Map(candidates.map((c) => [c.url, c])).values()];
  unique.sort(
    (a, b) =>
      Number(containsName(`${b.alt} ${b.url}`, p.name)) - Number(containsName(`${a.alt} ${a.url}`, p.name)) ||
      Number(b.isOgImage) - Number(a.isOgImage),
  );

  for (const candidate of unique.slice(0, MAX_IMAGE_DOWNLOADS)) {
    if (slots <= 0) break;
    try {
      const res = await fetcher.fetch(candidate.url, { maxBytes: LIMITS.image, accept: 'image/*' });
      const info = readImageInfo(res.body);
      const ext = info?.type === 'jpeg' ? 'jpg' : info?.type;
      if (!info || !ext || !IMAGE_TYPES[ext] || Math.min(info.width, info.height) < 150) continue;

      const hash = sha256(res.body);
      const [dup] = await db
        .select({ id: agrPesticideImages.id })
        .from(agrPesticideImages)
        .where(
          and(eq(agrPesticideImages.registrationNumber, p.registrationNumber), eq(agrPesticideImages.sha256, hash)),
        );
      const details = verifyImage(p, { ...candidate, url: res.url, ...info }, config.AUTO_APPROVE_SCORE);
      if (dup) {
        if (await refreshVerification(db, agrPesticideImages, dup.id, details)) stats.autoApproved++;
        continue;
      }

      const { storagePath } = await saveAsset(config.STORAGE_DIR, p.registrationNumber, 'images', res.body, ext);
      const inserted = await db
        .insert(agrPesticideImages)
        .values({
          registrationNumber: p.registrationNumber,
          altText: candidate.alt || null,
          pageUrl: candidate.pageUrl,
          width: info.width,
          height: info.height,
          sortOrder: MAX_IMAGES_PER_PESTICIDE - slots,
          sourceUrl: res.url,
          storagePath,
          sha256: hash,
          byteSize: res.body.byteLength,
          contentType: IMAGE_TYPES[ext]!,
          status: statusFor(details),
          verificationScore: details.score,
          verificationDetails: details,
          verifiedAt: new Date(),
        })
        .onConflictDoNothing()
        .returning({ id: agrPesticideImages.id });
      if (inserted.length) {
        slots--;
        stats.imagesSaved++;
        if (details.autoApproved) stats.autoApproved++;
      }
    } catch (err) {
      stats.errors++;
      log(`  画像取得失敗: ${candidate.url} (${(err as Error).message})`);
    }
  }
}
