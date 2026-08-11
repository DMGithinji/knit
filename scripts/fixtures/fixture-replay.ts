import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { BalancesService } from '@/accounting/balances/balances.service';
import { FamilyAccountsService } from '@/accounting/family-accounts/family-accounts.service';
import { InvoicesService } from '@/accounting/invoices/invoices.service';
import { PaymentEventDto } from '@/accounting/payment-events/dto/payment-event.dto';
import { PaymentEventsService } from '@/accounting/payment-events/payment-events.service';
import { DatabaseService } from '@/database/database.service';
import { SchoolProfileService } from '@/schools/profile/school-profile.service';

const FIXTURE_FAMILIES = [
  { accountReference: 'fam_100', displayName: 'Fixture family 100' },
  { accountReference: 'fam_101', displayName: 'Fixture family 101' },
  { accountReference: 'fam_102', displayName: 'Fixture family 102' },
  { accountReference: 'fam_103', displayName: 'Fixture family 103' },
  { accountReference: 'fam_104', displayName: 'Fixture family 104' },
  { accountReference: 'fam_105', displayName: 'Fixture family 105' },
] as const;

const FIXTURE_INVOICES = [
  { familyReference: 'fam_100', invoiceReference: 'inv_100', amountCents: 450000 },
  { familyReference: 'fam_101', invoiceReference: 'inv_101', amountCents: 300000 },
  { familyReference: 'fam_102', invoiceReference: 'inv_102', amountCents: 300000 },
  { familyReference: 'fam_103', invoiceReference: 'inv_103', amountCents: 75000 },
  { familyReference: 'fam_105', invoiceReference: 'inv_105', amountCents: 50000 },
] as const;

export interface FixtureEventOutcome {
  providerEventId: string;
  status: string;
  reason: string | null;
}

export interface FixtureBalanceSnapshot {
  familyReference: string;
  totalInvoicedCents: number;
  totalPaymentsCents: number;
  totalRefundsCents: number;
  amountOwedCents: number;
  creditCents: number;
  attentionItems: Array<{
    providerEventId: string;
    status: string;
    reason: string | null;
  }>;
}

interface FixtureSeed {
  schoolId: string;
  familyIdsByReference: Map<string, string>;
}

export function loadPaymentEventFixture(
  fixturePath = join(process.cwd(), 'scripts', 'fixtures', 'events.json'),
): PaymentEventDto[] {
  const parsed = JSON.parse(readFileSync(fixturePath, 'utf8')) as unknown;

  if (!Array.isArray(parsed)) {
    throw new Error(`Payment fixture ${fixturePath} must contain a JSON array`);
  }

  return parsed.map((value: unknown, index) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error(`Payment fixture entry ${index} must be an object`);
    }

    const event = plainToInstance(PaymentEventDto, value);
    const validationErrors = validateSync(event, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });

    if (validationErrors.length > 0) {
      const fields = validationErrors.map((error) => error.property).join(', ');
      throw new Error(`Payment fixture entry ${index} is invalid: ${fields}`);
    }

    return event;
  });
}

export class FixtureReplay {
  private readonly schools: SchoolProfileService;
  private readonly families: FamilyAccountsService;
  private readonly invoices: InvoicesService;
  private readonly paymentEvents: PaymentEventsService;
  private readonly balances: BalancesService;
  private seedState?: FixtureSeed;

  constructor(database: DatabaseService) {
    this.schools = new SchoolProfileService(database);
    this.families = new FamilyAccountsService(database, this.schools);
    this.invoices = new InvoicesService(database, this.families);
    this.paymentEvents = new PaymentEventsService(database, this.schools);
    this.balances = new BalancesService(database, this.families);
  }

  seed(): FixtureSeed {
    if (this.seedState) {
      return this.seedState;
    }

    const school = this.schools.create({ name: 'Knit Fixture School' });
    const familyIdsByReference = new Map<string, string>();

    for (const input of FIXTURE_FAMILIES) {
      const family = this.families.create(school.id, input);
      familyIdsByReference.set(family.accountReference, family.id);
    }

    for (const input of FIXTURE_INVOICES) {
      const familyId = familyIdsByReference.get(input.familyReference)!;
      this.invoices.create(school.id, familyId, {
        invoiceReference: input.invoiceReference,
        currency: 'ZAR',
        issuedAt: '2026-08-01T00:00:00Z',
        dueAt: '2026-08-31T23:59:59Z',
        lineItems: [{ description: 'Fixture school fees', amountCents: input.amountCents }],
      });
    }

    this.seedState = { schoolId: school.id, familyIdsByReference };
    return this.seedState;
  }

  replay(events: PaymentEventDto[]): FixtureEventOutcome[] {
    const { schoolId } = this.requireSeed();

    return events.map((payload) => {
      const { event } = this.paymentEvents.ingest(schoolId, payload);
      return {
        providerEventId: payload.event_id,
        status: event.processingStatus,
        reason: event.processingReason,
      };
    });
  }

  getBalanceSnapshots(): FixtureBalanceSnapshot[] {
    const { schoolId, familyIdsByReference } = this.requireSeed();

    return FIXTURE_FAMILIES.map(({ accountReference }) => {
      const familyId = familyIdsByReference.get(accountReference)!;
      const balance = this.balances.getFamilyBalance(schoolId, familyId);

      return {
        familyReference: accountReference,
        totalInvoicedCents: balance.summary.totalInvoicedCents,
        totalPaymentsCents: balance.summary.totalPaymentsCents,
        totalRefundsCents: balance.summary.totalRefundsCents,
        amountOwedCents: balance.summary.amountOwedCents,
        creditCents: balance.summary.creditCents,
        attentionItems: balance.attentionItems.map((item) => ({
          providerEventId: item.providerEventId,
          status: item.status,
          reason: item.reason,
        })),
      };
    });
  }

  private requireSeed(): FixtureSeed {
    if (!this.seedState) {
      throw new Error('Fixture data must be seeded before events can be replayed');
    }

    return this.seedState;
  }
}
