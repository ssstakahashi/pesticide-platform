import type { DocumentKind, VerificationDetails } from '@pesticide/db';

export type PesticideIdentity = {
  registrationNumber: string;
  name: string;
  registrantName: string | null;
  officialDomains: string[];
};

type Check = VerificationDetails['checks'][number];

/** パーセントエンコードされた日本語ファイル名なども照合できるようにデコードする */
export function safeDecode(text: string): string {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}

/** 全角半角・空白・記号の違いを吸収して比較する */
export function normalizeForMatch(text: string): string {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s\u3000・･\-‐－ー_()（）「」『』"'®™]/g, '');
}

export function isOfficialUrl(url: string, domains: string[]): boolean {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }
  return domains.some((d) => {
    const domain = d.toLowerCase().replace(/^\*\./, '');
    return host === domain || host.endsWith(`.${domain}`);
  });
}

/** 「第23623号」「登録番号 23623」等の表記で登録番号が出現するか */
export function containsRegistrationNumber(text: string, registrationNumber: string): boolean {
  const t = text.normalize('NFKC');
  const n = String(Number(registrationNumber));
  const pattern = new RegExp(`(第\\s*0*${n}\\s*号|登録(番号)?[\\s:：第]*0*${n}(?!\\d))`);
  return pattern.test(t);
}

export function containsName(text: string, name: string): boolean {
  return normalizeForMatch(safeDecode(text)).includes(normalizeForMatch(name));
}

const LEGAL_FORMS =
  /(株式会社|有限会社|合同会社|合資会社|合名会社|(一般|公益)(社団|財団)法人|\(株\)|\(有\)|\(同\)|(?<![a-z])(co\.?,?\s*ltd|corporation|corp|inc|k\.k)\.?(?![a-z]))/gi;

/**
 * 「日本曹達株式会社」→「日本曹達」のように法人格を除いた会社名。
 * 2文字のカナ・英字（「オキ」など）は無関係な文章にも一致しやすいため null（正式名称でのみ照合）
 */
export function registrantCoreName(registrantName: string): string | null {
  const core = normalizeForMatch(registrantName.normalize('NFKC').replace(LEGAL_FORMS, ' ')).replace(/[,.、。]+$/, '');
  if (core.length >= 3) return core;
  return core.length === 2 && /^\p{Script=Han}+$/u.test(core) ? core : null;
}

/** 正式名称のほか、法人格を省いた表記（「日本曹達」「日本曹達(株)」など）でも製造会社名の記載とみなす */
export function containsRegistrantName(text: string, registrantName: string): boolean {
  if (containsName(text, registrantName)) return true;
  const core = registrantCoreName(registrantName);
  return core !== null && normalizeForMatch(safeDecode(text)).includes(core);
}

function result(checks: Check[], autoApproveScore: number): VerificationDetails {
  const score = checks.reduce((s, c) => s + (c.passed ? c.weight : 0), 0);
  return { score, checks, autoApproved: score >= autoApproveScore };
}

export function verifyPage(
  p: PesticideIdentity,
  page: { url: string; title: string; text: string },
  autoApproveScore: number,
): VerificationDetails {
  const text = `${page.title} ${page.text}`;
  return result(
    [
      { name: '製造会社の公式ドメイン', passed: isOfficialUrl(page.url, p.officialDomains), weight: 40 },
      { name: 'ページに登録番号を記載', passed: containsRegistrationNumber(text, p.registrationNumber), weight: 35 },
      { name: 'ページに農薬名を記載', passed: containsName(text, p.name), weight: 20 },
      {
        name: 'ページに製造会社名を記載',
        passed: !!p.registrantName && containsRegistrantName(text, p.registrantName),
        weight: 5,
      },
    ],
    autoApproveScore,
  );
}

export function verifyDocument(
  p: PesticideIdentity,
  doc: { url: string; text: string },
  autoApproveScore: number,
): VerificationDetails {
  return result(
    [
      { name: '製造会社の公式ドメイン', passed: isOfficialUrl(doc.url, p.officialDomains), weight: 40 },
      {
        name: 'PDF本文に登録番号を記載',
        passed: containsRegistrationNumber(doc.text, p.registrationNumber),
        weight: 35,
      },
      { name: 'PDF本文に農薬名を記載', passed: containsName(doc.text, p.name), weight: 25 },
    ],
    autoApproveScore,
  );
}

export function verifyImage(
  p: PesticideIdentity,
  image: { url: string; alt: string; isOgImage: boolean; width: number; height: number; pageVerified: boolean },
  autoApproveScore: number,
): VerificationDetails {
  const label = `${image.alt} ${image.url.split('/').pop() ?? ''}`;
  return result(
    [
      { name: '製造会社の公式ドメイン', passed: isOfficialUrl(image.url, p.officialDomains), weight: 30 },
      { name: '掲載ページが検証済み（公式・登録番号・農薬名）', passed: image.pageVerified, weight: 40 },
      {
        name: '代替テキスト等に農薬名 / ページの代表画像',
        passed: containsName(label, p.name) || image.isOgImage,
        weight: 20,
      },
      { name: '十分な解像度（短辺300px以上）', passed: Math.min(image.width, image.height) >= 300, weight: 10 },
    ],
    autoApproveScore,
  );
}

export function classifyDocument(label: string): DocumentKind {
  const t = safeDecode(label).normalize('NFKC').toLowerCase();
  if (/sds|msds|安全データシート/.test(t)) return 'sds';
  if (/ラベル|label/.test(t)) return 'label';
  if (/技術資料|仕様|要覧|製品資料|技術情報|製品情報|パンフ|カタログ|チラシ|説明|リーフレット|tech/.test(t))
    return 'spec_sheet';
  return 'other';
}
