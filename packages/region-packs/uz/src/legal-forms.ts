import type { LegalForm } from '@fincore/region-pack-contract';

/**
 * The three forms FinCore supports at launch. Codes are the Uzbek
 * abbreviations because that is what appears on the registration certificate;
 * everything a user reads comes from `nameKey`.
 */
export const LEGAL_FORMS: readonly LegalForm[] = [
  {
    code: 'MCHJ',
    nameKey: 'legalForm.mchj',
    isIndividual: false,
    canRegisterForVat: true,
  },
  {
    code: 'YaTT',
    nameKey: 'legalForm.yatt',
    isIndividual: true,
    canRegisterForVat: true,
  },
  {
    code: 'XK',
    nameKey: 'legalForm.xk',
    isIndividual: false,
    canRegisterForVat: true,
  },
];
