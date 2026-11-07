-- カタカナをひらがなに寄せる（「スイカ」「すいか」の表記ゆれ吸収用）
CREATE OR REPLACE FUNCTION agr_to_hiragana(p_text text)
RETURNS text
LANGUAGE sql
IMMUTABLE PARALLEL SAFE
AS $$
  SELECT translate(
    p_text,
    'ァアィイゥウェエォオカガキギクグケゲコゴサザシジスズセゼソゾタダチヂッツヅテデトドナニヌネノハバパヒビピフブプヘベペホボポマミムメモャヤュユョヨラリルレロヮワヰヱヲンヴヵヶ',
    'ぁあぃいぅうぇえぉおかがきぎくぐけげこごさざしじすずせぜそぞただちぢっつづてでとどなにぬねのはばぱひびぴふぶぷへべぺほぼぽまみむめもゃやゅゆょよらりるれろゎわゐゑをんゔゕゖ'
  )
$$;
--> statement-breakpoint

-- 指定作物に適用可能な適用ルールを返す。
-- 作物そのもの（depth=0）に加え、上位分類（果菜類=1, 野菜類=2 ...）への登録もヒットさせる。
-- 適用ルールの除外作物（「〜を除く」）に、検索作物またはその途中の分類が含まれる場合は除外する。
CREATE OR REPLACE FUNCTION agr_applicable_usage_rules(p_crop text)
RETURNS TABLE (usage_rule_id uuid, matched_crop_id uuid, hierarchy_depth integer)
LANGUAGE sql
STABLE
AS $$
  WITH RECURSIVE target AS (
    SELECT c.id
    FROM agr_crops c
    WHERE agr_to_hiragana(c.name) = agr_to_hiragana(btrim(p_crop))
       OR EXISTS (
         SELECT 1 FROM unnest(c.synonyms) s
         WHERE agr_to_hiragana(s) = agr_to_hiragana(btrim(p_crop))
       )
  ),
  ancestors AS (
    SELECT c.id AS origin_id, c.id, c.parent_id, 0 AS depth, ARRAY[c.id] AS path
    FROM agr_crops c
    JOIN target t ON t.id = c.id
    UNION ALL
    SELECT a.origin_id, p.id, p.parent_id, a.depth + 1, a.path || p.id
    FROM ancestors a
    JOIN agr_crops p ON p.id = a.parent_id
    WHERE NOT p.id = ANY (a.path)
  )
  SELECT DISTINCT ON (ur.id) ur.id, a.origin_id, a.depth
  FROM ancestors a
  JOIN agr_usage_rules ur ON ur.crop_id = a.id
  WHERE NOT COALESCE(ur.excluded_crop_ids && a.path[1:a.depth], false)
  ORDER BY ur.id, a.depth
$$;
--> statement-breakpoint

-- 作物名（必須）・病害虫名・用途で農薬の適用ルールを検索する
CREATE OR REPLACE FUNCTION search_agr_pesticides(
  p_crop text,
  p_pest text DEFAULT NULL,
  p_category text DEFAULT NULL
)
RETURNS TABLE (
  usage_rule_id uuid,
  registration_number text,
  pesticide_name text,
  usage_category text,
  formulation_type text,
  registered_crop_name text,
  crop_condition text,
  hierarchy_depth integer,
  target_pests text,
  dilution_text text,
  liquid_amount text,
  usage_timing_text text,
  phi_days integer,
  max_applications_count integer,
  application_method text,
  ingredient_limits_summary text
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    ur.id,
    p.registration_number::text,
    p.name,
    p.usage_category,
    p.formulation_type,
    c.name,
    ur.crop_condition,
    a.hierarchy_depth,
    (
      SELECT string_agg(
        pe.name || CASE WHEN up.condition_note <> '' THEN '（' || up.condition_note || '）' ELSE '' END,
        '、' ORDER BY pe.name
      )
      FROM agr_usage_pests up
      JOIN agr_pests pe ON pe.id = up.pest_id
      WHERE up.usage_rule_id = ur.id
    ),
    ur.dilution_text,
    ur.liquid_amount,
    ur.usage_timing_text,
    ur.phi_days,
    ur.max_applications_count,
    ur.application_method,
    (
      SELECT string_agg(
        COALESCE(ai.name, pai.name, '成分' || uil.ordinal_position) || ': ' || uil.limit_text,
        ' / ' ORDER BY uil.ordinal_position
      )
      FROM agr_usage_ingredient_limits uil
      LEFT JOIN agr_ingredients ai ON ai.id = uil.ingredient_id
      LEFT JOIN agr_pesticide_ingredients pi
        ON pi.registration_number = ur.registration_number AND pi.ordinal_position = uil.ordinal_position
      LEFT JOIN agr_ingredients pai ON pai.id = pi.ingredient_id
      WHERE uil.usage_rule_id = ur.id
    )
  FROM agr_applicable_usage_rules(p_crop) a
  JOIN agr_usage_rules ur ON ur.id = a.usage_rule_id
  JOIN agr_pesticides p ON p.registration_number = ur.registration_number
  JOIN agr_crops c ON c.id = ur.crop_id
  WHERE (
      NULLIF(btrim(p_category), '') IS NULL
      OR p.usage_category ILIKE '%' || btrim(p_category) || '%'
    )
    AND (
      NULLIF(btrim(p_pest), '') IS NULL
      OR EXISTS (
        SELECT 1
        FROM agr_usage_pests up
        JOIN agr_pests pe ON pe.id = up.pest_id
        WHERE up.usage_rule_id = ur.id
          AND agr_to_hiragana(pe.name) LIKE '%' || agr_to_hiragana(btrim(p_pest)) || '%'
      )
    )
  ORDER BY a.hierarchy_depth, p.name, c.name
$$;
