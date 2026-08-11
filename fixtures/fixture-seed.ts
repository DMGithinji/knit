import { and, asc, desc, eq } from 'drizzle-orm';
import { FamilyAccountsService } from '@/accounting/family-accounts/family-accounts.service';
import { InvoicesService } from '@/accounting/invoices/invoices.service';
import { DatabaseService } from '@/database/database.service';
import {
  familyAccounts,
  invoices,
  schoolConfigActivations,
  schoolConfigVersions,
  schools,
} from '@/database/schema';
import { SchoolConfigService } from '@/schools/configs/school-config.service';
import { SchoolProfileService } from '@/schools/profile/school-profile.service';
import { FIXTURE_CONFIG, FIXTURE_FAMILIES, FIXTURE_INVOICES, FIXTURE_SCHOOL } from './fixture-data';

export interface FixtureSeedResult {
  schoolId: string;
  familyIdsByReference: Map<string, string>;
}

const SEED_ACTOR = 'fixture-seed@knit.test';

export function seedFixtureData(database: DatabaseService): FixtureSeedResult {
  const schoolsService = new SchoolProfileService(database);
  const familiesService = new FamilyAccountsService(database, schoolsService);
  const invoicesService = new InvoicesService(database, familiesService);
  const configsService = new SchoolConfigService(database, schoolsService);

  const school =
    database.db
      .select()
      .from(schools)
      .where(eq(schools.name, FIXTURE_SCHOOL.name))
      .orderBy(asc(schools.id))
      .get() ?? schoolsService.create(FIXTURE_SCHOOL);

  const activeConfig = database.db
    .select()
    .from(schoolConfigActivations)
    .where(eq(schoolConfigActivations.schoolId, school.id))
    .orderBy(asc(schoolConfigActivations.sequence))
    .get();

  if (!activeConfig) {
    const latestConfig = database.db
      .select()
      .from(schoolConfigVersions)
      .where(eq(schoolConfigVersions.schoolId, school.id))
      .orderBy(desc(schoolConfigVersions.version))
      .get();
    const configVersion =
      latestConfig ??
      configsService.createVersion(school.id, {
        config: { ...FIXTURE_CONFIG, reminderCadenceDays: [...FIXTURE_CONFIG.reminderCadenceDays] },
        createdBy: SEED_ACTOR,
        changeReason: 'Initial fixture configuration',
      });

    configsService.activateVersion(school.id, configVersion.id, {
      expectedCurrentVersionId: null,
      activatedBy: SEED_ACTOR,
      activationReason: 'Initial fixture activation',
    });
  }

  const familyIdsByReference = new Map<string, string>();
  for (const familyInput of FIXTURE_FAMILIES) {
    const family =
      database.db
        .select()
        .from(familyAccounts)
        .where(
          and(
            eq(familyAccounts.schoolId, school.id),
            eq(familyAccounts.accountReference, familyInput.accountReference),
          ),
        )
        .get() ?? familiesService.create(school.id, familyInput);
    familyIdsByReference.set(family.accountReference, family.id);
  }

  for (const invoiceInput of FIXTURE_INVOICES) {
    const familyAccountId = familyIdsByReference.get(invoiceInput.familyReference)!;
    const existingInvoice = database.db
      .select({ id: invoices.id })
      .from(invoices)
      .where(
        and(
          eq(invoices.familyAccountId, familyAccountId),
          eq(invoices.invoiceReference, invoiceInput.invoiceReference),
        ),
      )
      .get();

    if (!existingInvoice) {
      invoicesService.create(school.id, familyAccountId, {
        invoiceReference: invoiceInput.invoiceReference,
        currency: 'ZAR',
        issuedAt: '2026-08-01T00:00:00Z',
        dueAt: '2026-08-31T23:59:59Z',
        lineItems: [{ description: 'Fixture school fees', amount: invoiceInput.amount }],
      });
    }
  }

  return { schoolId: school.id, familyIdsByReference };
}
