import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import AdmZip from 'adm-zip';
import { parse } from 'csv-parse/sync';
import iconv from 'iconv-lite';

export type CsvTable = { name: string; header: string[]; rows: Record<string, string>[] };

async function fetchBytes(source: string): Promise<Buffer> {
  if (/^https?:\/\//.test(source)) {
    const res = await fetch(source);
    if (!res.ok) throw new Error(`ダウンロードに失敗しました: ${source} (${res.status})`);
    return Buffer.from(await res.arrayBuffer());
  }
  return readFile(source);
}

/** UTF-8 として不正なバイト列なら Shift_JIS(CP932) とみなして変換する */
export function decodeCsv(bytes: Buffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^\uFEFF/, '');
  } catch {
    return iconv.decode(bytes, 'cp932');
  }
}

function parseCsv(name: string, text: string): CsvTable {
  const records: string[][] = parse(text, { relax_column_count: true, skip_empty_lines: true, bom: true });
  const [header = [], ...body] = records;
  const keys = header.map((h) => h.normalize('NFKC').replace(/\s+/g, ''));
  const rows = body.map((cells) => Object.fromEntries(keys.map((k, i) => [k, cells[i] ?? ''])));
  return { name, header: keys, rows };
}

/** ZIP（複数CSV）または CSV 単体をダウンロード／読み込みしてテーブル化する */
export async function loadCsvTables(source: string): Promise<CsvTable[]> {
  const bytes = await fetchBytes(source);
  const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b;
  if (!isZip) return [parseCsv(basename(source), decodeCsv(bytes))];

  return new AdmZip(bytes)
    .getEntries()
    .filter((e) => !e.isDirectory && /\.csv$/i.test(e.entryName))
    .map((e) => parseCsv(e.entryName, decodeCsv(e.getData())));
}
