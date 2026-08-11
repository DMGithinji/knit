export const FIXTURE_SCHOOL = {
  name: 'Knit Fixture School',
} as const;

export const FIXTURE_CONFIG = {
  currency: 'ZAR',
  gracePeriodDays: 14,
  reminderCadenceDays: [7, 14],
  allowPartialPayments: true,
  arrearsAfterDays: 30,
} as const;

export const FIXTURE_FAMILIES = [
  { accountReference: 'fam_100', displayName: 'Fixture family 100' },
  { accountReference: 'fam_101', displayName: 'Fixture family 101' },
  { accountReference: 'fam_102', displayName: 'Fixture family 102' },
  { accountReference: 'fam_103', displayName: 'Fixture family 103' },
  { accountReference: 'fam_104', displayName: 'Fixture family 104' },
  { accountReference: 'fam_105', displayName: 'Fixture family 105' },
] as const;

export const FIXTURE_INVOICES = [
  { familyReference: 'fam_100', invoiceReference: 'inv_100', amount: 4500 },
  { familyReference: 'fam_101', invoiceReference: 'inv_101', amount: 3000 },
  { familyReference: 'fam_102', invoiceReference: 'inv_102', amount: 3000 },
  { familyReference: 'fam_103', invoiceReference: 'inv_103', amount: 750 },
  { familyReference: 'fam_105', invoiceReference: 'inv_105', amount: 500 },
] as const;
