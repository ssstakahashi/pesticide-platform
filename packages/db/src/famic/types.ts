export type NormalizedPesticide = {
  registrationNumber: string;
  name: string;
  pesticideType: string | null;
  registrantName: string | null;
  usageCategory: string | null;
  formulationType: string | null;
  mixtureCount: number | null;
  registeredDate: string | null;
  ingredients: { name: string; concentrationText: string | null }[];
};

export type NormalizedUsageRule = {
  registrationNumber: string;
  rawCropName: string;
  pests: string[];
  applicationPlace: string | null;
  purpose: string | null;
  applicationMethod: string | null;
  dilutionText: string | null;
  liquidAmount: string | null;
  usageTimingText: string | null;
  maxApplicationsText: string | null;
  fumigationTime: string | null;
  fumigationTemperature: string | null;
  soilType: string | null;
  zoneName: string | null;
  appliedPesticideName: string | null;
  /** 有効成分①〜の「〜を含む農薬の総使用回数」。添字+1 が ordinal_position */
  ingredientLimitTexts: (string | null)[];
};

export type IngredientMeta = {
  name: string;
  totalCountGroupName?: string | null;
  fracCode?: string | null;
  iracCode?: string | null;
  hracCode?: string | null;
};

export type CropNode = { name: string; synonyms?: string[]; children?: CropNode[] };

export type FamicDataset = {
  pesticides: NormalizedPesticide[];
  usageRules: NormalizedUsageRule[];
};
