import type { IngredientMeta } from './types';

/**
 * 有効成分の作用機構分類（RACコード）と、総使用回数を合算するグループ名。
 * FAMIC の CSV には含まれないため、ここで補完する（運用中に拡充していく前提）。
 * total_count_group_name は塩・異性体など「同一成分として合算する」ものに同じ名前を付ける。
 */
export const INGREDIENT_META: IngredientMeta[] = [
  { name: 'アセタミプリド', iracCode: '4A' },
  { name: 'チアメトキサム', iracCode: '4A' },
  { name: 'シアントラニリプロール', iracCode: '28' },
  { name: 'TPN', fracCode: 'M05' },
];
