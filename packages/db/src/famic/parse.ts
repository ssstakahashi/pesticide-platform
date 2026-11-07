/** 全角英数・全角括弧などを半角に寄せ、前後の空白を除去する */
export function normalizeText(value: string | null | undefined): string | null {
  if (value == null) return null;
  const v = value.normalize('NFKC').replace(/\s+/g, ' ').trim();
  return v === '' || v === '-' ? null : v;
}

const FIRST_COUNT = /(\d+)\s*回/;

/** 「3回以内」「4回以内(定植時の土壌混和は1回以内、散布は3回以内)」→ 先頭の回数 */
export function parseCount(text: string | null): number | null {
  const m = text?.normalize('NFKC').match(FIRST_COUNT);
  return m ? Number(m[1]) : null;
}

/** 「収穫7日前まで」→7, 「収穫前日まで」→1。収穫基準でない時期（定植時など）は null */
export function parsePhiDays(text: string | null): number | null {
  if (!text) return null;
  const v = text.normalize('NFKC');
  if (/収穫前日まで/.test(v)) return 1;
  const m = v.match(/収穫\s*(\d+)\s*日前まで/);
  return m ? Number(m[1]) : null;
}

export type ParsedDilution = { min: string | null; max: string | null; unit: string | null };

/** 「2000~4000倍」「1000倍」「3~6kg/10a」→ 下限・上限・単位 */
export function parseDilution(text: string | null): ParsedDilution {
  const empty = { min: null, max: null, unit: null };
  if (!text) return empty;
  const m = text
    .normalize('NFKC')
    .replace(/,/g, '')
    .match(/^(\d+(?:\.\d+)?)\s*(?:[~〜～\-ー]\s*(\d+(?:\.\d+)?))?\s*(.*)$/);
  if (!m) return empty;
  const unit = m[3]?.trim() || null;
  return { min: m[1] ?? null, max: m[2] ?? m[1] ?? null, unit: unit ? unit.slice(0, 50) : null };
}

export type ParsedCrop = { name: string; condition: string | null; excludedNames: string[] };

/**
 * 「野菜類(ばれいしょを除く)」「すいか(露地栽培)」を作物名・条件・除外作物に分解する。
 */
export function parseCropName(raw: string): ParsedCrop {
  const v = raw.normalize('NFKC').trim();
  const idx = v.indexOf('(');
  if (idx <= 0) return { name: v, condition: null, excludedNames: [] };

  const name = v.slice(0, idx).trim();
  const inner = v
    .slice(idx + 1)
    .replace(/\)\s*$/, '')
    .trim();
  const excluded = inner.match(/^(.*)を除く$/);
  if (excluded?.[1]) {
    const excludedNames = excluded[1]
      .split(/、|,|及び|および/)
      .map((s) => s.replace(/^.*?ただし\s*/, '').trim())
      .filter(Boolean);
    return { name, condition: null, excludedNames };
  }
  return { name, condition: inner || null, excludedNames: [] };
}

/** 「適用病害虫雑草名」を個々の病害虫名に分解する */
export function splitPests(text: string | null): string[] {
  if (!text) return [];
  return [
    ...new Set(
      text
        .normalize('NFKC')
        .split(/、|,/)
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  ];
}

/** 「2005/01/12」「20050112」→「2005-01-12」 */
export function parseDate(text: string | null): string | null {
  const m = text?.normalize('NFKC').match(/^(\d{4})[/\-.]?(\d{1,2})[/\-.]?(\d{1,2})$/);
  if (!m) return null;
  return `${m[1]}-${m[2]!.padStart(2, '0')}-${m[3]!.padStart(2, '0')}`;
}
