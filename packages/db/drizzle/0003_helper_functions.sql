-- agri DB など search_agr_pesticides が既に存在する DB 向けに、API が使う補助関数だけを冪等に作成する
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
