import { sql, type Database } from '@pesticide/db';
import type {
  PesticideDetail,
  PesticideSearchQuery,
  PesticideSearchResult,
  SuggestItem,
} from '@pesticide/api-contract';

export async function searchPesticides(
  db: Database,
  { crop, pest, category }: PesticideSearchQuery,
): Promise<PesticideSearchResult[]> {
  const result = await db.execute<PesticideSearchResult>(sql`
    SELECT * FROM search_agr_pesticides(${crop}, ${pest || null}, ${category || null})
  `);
  return result.rows;
}

type SuggestTable = 'agr_pesticides' | 'agr_crops' | 'agr_pests';

const SUGGEST_ID_COLUMN: Record<SuggestTable, string> = {
  agr_pesticides: 'registration_number',
  agr_crops: 'id',
  agr_pests: 'id',
};

/**
 * pg_trgm の GIN インデックスを使ったあいまい検索。
 * 部分一致（ILIKE）を優先し、表記ゆれは word_similarity で拾う。
 */
export async function suggestByName(
  db: Database,
  table: SuggestTable,
  q: string,
  limit: number,
): Promise<SuggestItem[]> {
  const tableSql = sql.identifier(table);
  const idSql = sql.identifier(SUGGEST_ID_COLUMN[table]);
  const synonymsMatch =
    table === 'agr_crops'
      ? sql`OR EXISTS (SELECT 1 FROM unnest(synonyms) s WHERE agr_to_hiragana(s) LIKE '%' || agr_to_hiragana(${q}) || '%')`
      : sql``;

  const result = await db.execute<{ id: string; name: string; similarity: number }>(sql`
    SELECT ${idSql}::text AS id, name, word_similarity(${q}, name)::float8 AS similarity
    FROM ${tableSql}
    WHERE name ILIKE '%' || ${q} || '%'
       OR ${q} <% name
       OR agr_to_hiragana(name) LIKE '%' || agr_to_hiragana(${q}) || '%'
       ${synonymsMatch}
    ORDER BY (name ILIKE ${q} || '%') DESC, similarity DESC, length(name), name
    LIMIT ${limit}
  `);
  return result.rows;
}

export async function getPesticideDetail(db: Database, registrationNumber: string): Promise<PesticideDetail | null> {
  const pesticide = await db.query.agrPesticides.findFirst({
    where: (t, { eq }) => eq(t.registrationNumber, registrationNumber),
    with: {
      ingredients: {
        with: { ingredient: true },
        orderBy: (t, { asc }) => [asc(t.ordinalPosition)],
      },
    },
  });
  if (!pesticide) return null;

  return {
    registrationNumber: pesticide.registrationNumber,
    name: pesticide.name,
    pesticideType: pesticide.pesticideType,
    registrantName: pesticide.registrantName,
    usageCategory: pesticide.usageCategory,
    formulationType: pesticide.formulationType,
    mixtureCount: pesticide.mixtureCount,
    registeredDate: pesticide.registeredDate,
    ingredients: pesticide.ingredients.map(({ ordinalPosition, concentrationText, ingredient }) => ({
      ordinalPosition,
      name: ingredient.name,
      concentrationText,
      totalCountGroupName: ingredient.totalCountGroupName,
      racCode: ingredient.iracCode ?? ingredient.fracCode ?? ingredient.hracCode,
    })),
  };
}
