import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { BalancesService } from '@/accounting/balances/balances.service';
import { FamilyAccountsService } from '@/accounting/family-accounts/family-accounts.service';
import { PaymentEventDto } from '@/accounting/payment-events/dto/payment-event.dto';
import {
  PaymentCaptureService,
  PaymentQueryService,
  PaymentReconciliationService,
} from '@/accounting/payment-events/services';
import { DatabaseService } from '@/database/database.service';
import { SchoolProfileService } from '@/schools/profile/school-profile.service';
import { FIXTURE_FAMILIES } from './fixture-data';
import { FixtureSeedResult, seedFixtureData } from './fixture-seed';

export interface FixtureEventOutcome {
  providerEventId: string;
  status: string;
  reason: string | null;
}

export interface FixtureBalanceSnapshot {
  familyReference: string;
  totalInvoiced: number;
  totalPayments: number;
  totalRefunds: number;
  amountOwed: number;
  credit: number;
  attentionItems: Array<{
    providerEventId: string;
    status: string;
    reason: string | null;
  }>;
}

export function loadPaymentEventFixture(
  fixturePath = join(process.cwd(), 'fixtures', 'events.json'),
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
  private readonly paymentCapture: PaymentCaptureService;
  private readonly balances: BalancesService;
  private seedState?: FixtureSeedResult;

  constructor(private readonly database: DatabaseService) {
    const schools = new SchoolProfileService(database);
    const families = new FamilyAccountsService(database, schools);
    const paymentEventQueries = new PaymentQueryService(database, schools);
    const paymentEventReconciliation = new PaymentReconciliationService(database, schools);
    this.paymentCapture = new PaymentCaptureService(
      database,
      schools,
      paymentEventQueries,
      paymentEventReconciliation,
    );
    this.balances = new BalancesService(database, families);
  }

  seed(): FixtureSeedResult {
    if (this.seedState) {
      return this.seedState;
    }

    this.seedState = seedFixtureData(this.database);
    return this.seedState;
  }

  replay(events: PaymentEventDto[]): FixtureEventOutcome[] {
    const { schoolId } = this.requireSeed();

    return events.map((payload) => {
      const { event } = this.paymentCapture.capture(schoolId, payload);
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
        totalInvoiced: balance.summary.totalInvoiced,
        totalPayments: balance.summary.totalPayments,
        totalRefunds: balance.summary.totalRefunds,
        amountOwed: balance.summary.amountOwed,
        credit: balance.summary.credit,
        attentionItems: balance.attentionItems.map((item) => ({
          providerEventId: item.providerEventId,
          status: item.status,
          reason: item.reason,
        })),
      };
    });
  }

  private requireSeed(): FixtureSeedResult {
    if (!this.seedState) {
      throw new Error('Fixture data must be seeded before events can be replayed');
    }

    return this.seedState;
  }
}
