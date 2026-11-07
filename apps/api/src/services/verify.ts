import { sql, type Database } from '@pesticide/db';
import type {
  UsageCount,
  VerifyIngredientResult,
  VerifyPesticideResult,
  VerifyRequest,
  VerifyResponse,
  VerifyStatus,
} from '@pesticide/api-contract';

type VerifyRow = {
  registration_number: string;
  pesticide_name: string;
  registered_for_crop: boolean;
  product_max_count: number | null;
  product_used_count: number;
  ordinal_position: number;
  ingredient_name: string;
  count_group_name: string;
  rac_code: string | null;
  ingredient_max_count: number | null;
  ingredient_used_count: number;
  used_history: VerifyIngredientResult['usedHistory'];
};

const STATUS_SEVERITY: Record<VerifyStatus, number> = {
  not_registered: 4,
  exceeded: 3,
  last_one: 2,
  available: 1,
  no_limit: 0,
};

function toUsageCount(maxCount: number | null, usedCount: number): UsageCount {
  if (maxCount === null) return { maxCount, usedCount, remaining: null, status: 'no_limit' };
  const remaining = maxCount - usedCount;
  const status: VerifyStatus = remaining <= 0 ? 'exceeded' : remaining === 1 ? 'last_one' : 'available';
  return { maxCount, usedCount, remaining, status };
}

/**
 * 商品名が違っても同じ有効成分（total_count_group_name 単位）は合算して総使用回数をカウントする。
 * 1回の散布で同一グループの成分を複数含む農薬は1回として数える。
 * 作物に複数の適用ルールがある場合は、最も厳しい（小さい）上限回数を採用する。
 */
export async function verifyUsage(db: Database, input: VerifyRequest): Promise<VerifyResponse> {
  const history = input.history.map((h, idx) => ({
    idx,
    registration_number: h.registrationNumber,
    sprayed_date: h.sprayedDate,
  }));
  const candidates = input.candidates ? JSON.stringify(input.candidates) : null;

  const unknown = await db.execute<{ registration_number: string }>(sql`
    SELECT DISTINCT h.registration_number
    FROM jsonb_to_recordset(${JSON.stringify(history)}::jsonb) AS h(registration_number text)
    WHERE NOT EXISTS (SELECT 1 FROM agr_pesticides p WHERE p.registration_number = h.registration_number)
    ORDER BY 1
  `);

  const result = await db.execute<VerifyRow>(sql`
    WITH history AS (
      SELECT h.idx, h.registration_number, h.sprayed_date
      FROM jsonb_to_recordset(${JSON.stringify(history)}::jsonb)
        AS h(idx int, registration_number text, sprayed_date date)
    ),
    history_groups AS (
      SELECT DISTINCT
        h.idx, h.sprayed_date, p.registration_number, p.name AS pesticide_name,
        COALESCE(ai.total_count_group_name, ai.name) AS group_name
      FROM history h
      JOIN agr_pesticides p ON p.registration_number = h.registration_number
      JOIN agr_pesticide_ingredients pi ON pi.registration_number = p.registration_number
      JOIN agr_ingredients ai ON ai.id = pi.ingredient_id
    ),
    used_groups AS (
      SELECT
        group_name,
        COUNT(*)::int AS used_count,
        jsonb_agg(
          jsonb_build_object(
            'registrationNumber', registration_number,
            'pesticideName', pesticide_name,
            'sprayedDate', sprayed_date
          ) ORDER BY sprayed_date, idx
        ) AS used_history
      FROM history_groups
      GROUP BY group_name
    ),
    used_products AS (
      SELECT registration_number, COUNT(*)::int AS used_count
      FROM history
      GROUP BY registration_number
    ),
    crop_rules AS (
      SELECT
        ur.registration_number,
        MIN(ur.max_applications_count) AS max_applications_count,
        array_agg(ur.id) AS usage_rule_ids
      FROM agr_applicable_usage_rules(${input.crop}) a
      JOIN agr_usage_rules ur ON ur.id = a.usage_rule_id
      GROUP BY ur.registration_number
    ),
    candidate_pesticides AS (
      SELECT p.registration_number
      FROM agr_pesticides p
      WHERE CASE
        WHEN ${candidates}::jsonb IS NOT NULL
          THEN p.registration_number IN (SELECT jsonb_array_elements_text(${candidates}::jsonb))
        ELSE p.registration_number IN (SELECT registration_number FROM crop_rules)
      END
    ),
    rows AS (
      SELECT
        p.registration_number,
        p.name AS pesticide_name,
        (cr.registration_number IS NOT NULL) AS registered_for_crop,
        cr.max_applications_count AS product_max_count,
        COALESCE(up.used_count, 0) AS product_used_count,
        pi.ordinal_position,
        ai.name AS ingredient_name,
        COALESCE(ai.total_count_group_name, ai.name) AS count_group_name,
        COALESCE(ai.irac_code, ai.frac_code, ai.hrac_code) AS rac_code,
        (
          SELECT MIN(uil.max_total_count)
          FROM agr_usage_ingredient_limits uil
          WHERE uil.usage_rule_id = ANY(cr.usage_rule_ids)
            AND uil.ordinal_position = pi.ordinal_position
        ) AS ingredient_max_count,
        COALESCE(ug.used_count, 0) AS ingredient_used_count,
        COALESCE(ug.used_history, '[]'::jsonb) AS used_history
      FROM candidate_pesticides c
      JOIN agr_pesticides p ON p.registration_number = c.registration_number
      JOIN agr_pesticide_ingredients pi ON pi.registration_number = p.registration_number
      JOIN agr_ingredients ai ON ai.id = pi.ingredient_id
      LEFT JOIN crop_rules cr ON cr.registration_number = p.registration_number
      LEFT JOIN used_products up ON up.registration_number = p.registration_number
      LEFT JOIN used_groups ug ON ug.group_name = COALESCE(ai.total_count_group_name, ai.name)
    )
    SELECT *
    FROM (
      SELECT
        rows.*,
        bool_or(ingredient_used_count > 0 OR product_used_count > 0)
          OVER (PARTITION BY registration_number) AS related_to_history
      FROM rows
    ) r
    WHERE ${candidates}::jsonb IS NOT NULL OR r.related_to_history
    ORDER BY r.registration_number, r.ordinal_position
  `);

  const byPesticide = new Map<string, VerifyPesticideResult>();
  for (const row of result.rows) {
    let item = byPesticide.get(row.registration_number);
    if (!item) {
      item = {
        registrationNumber: row.registration_number,
        pesticideName: row.pesticide_name,
        registeredForCrop: row.registered_for_crop,
        status: 'no_limit',
        product: toUsageCount(row.product_max_count, row.product_used_count),
        ingredients: [],
      };
      byPesticide.set(row.registration_number, item);
    }
    item.ingredients.push({
      ordinalPosition: row.ordinal_position,
      ingredientName: row.ingredient_name,
      countGroupName: row.count_group_name,
      racCode: row.rac_code,
      usedHistory: row.used_history,
      ...toUsageCount(row.ingredient_max_count, row.ingredient_used_count),
    });
  }

  const items = [...byPesticide.values()].map((item) => {
    const statuses: VerifyStatus[] = item.registeredForCrop
      ? [item.product.status, ...item.ingredients.map((i) => i.status)]
      : ['not_registered'];
    const status = statuses.reduce((worst, s) => (STATUS_SEVERITY[s] > STATUS_SEVERITY[worst] ? s : worst));
    return { ...item, status };
  });

  items.sort(
    (a, b) =>
      STATUS_SEVERITY[b.status] - STATUS_SEVERITY[a.status] || a.registrationNumber.localeCompare(b.registrationNumber),
  );

  return {
    crop: input.crop,
    unknownRegistrationNumbers: unknown.rows.map((r) => r.registration_number),
    items,
  };
}
