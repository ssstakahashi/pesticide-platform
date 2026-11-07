import type { CropNode } from './types';

/**
 * 作物階層マスタの初期値。FAMIC の作物名は上位分類（野菜類・果菜類など）で登録されることがあるため、
 * 下位作物の検索で上位分類の登録もヒットさせるのに使う。
 * FAMIC の「作物分類表」に合わせて運用中に拡充していく前提の最小構成。
 */
export const CROP_HIERARCHY: CropNode[] = [
  {
    name: '野菜類',
    children: [
      {
        name: '果菜類',
        children: [
          { name: 'すいか', synonyms: ['スイカ', '西瓜'] },
          { name: 'メロン', synonyms: ['めろん'] },
          { name: 'トマト', synonyms: ['とまと'] },
          { name: 'ミニトマト' },
          { name: 'きゅうり', synonyms: ['キュウリ', '胡瓜'] },
          { name: 'なす', synonyms: ['ナス', '茄子'] },
          { name: 'ピーマン' },
          { name: 'いちご', synonyms: ['イチゴ', '苺'] },
        ],
      },
      {
        name: '葉菜類',
        children: [
          { name: 'キャベツ' },
          { name: 'はくさい', synonyms: ['ハクサイ', '白菜'] },
          { name: 'レタス' },
          { name: 'ほうれんそう', synonyms: ['ホウレンソウ'] },
        ],
      },
      {
        name: '根菜類',
        children: [
          { name: 'だいこん', synonyms: ['ダイコン', '大根'] },
          { name: 'にんじん', synonyms: ['ニンジン', '人参'] },
        ],
      },
      {
        name: 'いも類',
        children: [
          { name: 'ばれいしょ', synonyms: ['じゃがいも', 'ジャガイモ'] },
          { name: 'かんしょ', synonyms: ['さつまいも', 'サツマイモ'] },
        ],
      },
    ],
  },
  {
    name: '果樹類',
    children: [
      { name: 'かんきつ', synonyms: ['柑橘'] },
      { name: 'りんご', synonyms: ['リンゴ'] },
      { name: 'なし', synonyms: ['ナシ', '梨'] },
      { name: 'ぶどう', synonyms: ['ブドウ'] },
      { name: 'もも', synonyms: ['モモ', '桃'] },
    ],
  },
  {
    name: '穀類',
    children: [
      { name: '稲', synonyms: ['水稲', 'いね'] },
      { name: '麦類', children: [{ name: '小麦' }, { name: '大麦' }] },
    ],
  },
];
