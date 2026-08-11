import { FamilyAccountsService } from '@/accounting/family-accounts/family-accounts.service';
import { InvoicesService } from '@/accounting/invoices/invoices.service';
import { PaymentEventDto } from '@/accounting/payment-events/dto/payment-event.dto';
import { PaymentEventsService } from '@/accounting/payment-events/payment-events.service';
import { ledgerEntries, paymentEvents } from '@/database/schema';
import { SchoolProfileService } from '@/schools/profile/school-profile.service';
import { createTestDatabase, TestDatabase } from '@test/helpers/test-database';

const baseEvent: PaymentEventDto = {
  event_id: 'evt_001',
  type: 'payment.succeeded',
  family_id: 'fam_100',
  invoice_id: 'inv_100',
  amount_cents: 450000,
  currency: 'ZAR',
  occurred_at: '2026-08-01T09:14:22Z',
};

describe('PaymentEventsService', () => {
  let testDatabase: TestDatabase;
  let schools: SchoolProfileService;
  let families: FamilyAccountsService;
  let invoices: InvoicesService;
  let service: PaymentEventsService;
  let schoolId: string;
  let familyAccountId: string;

  beforeEach(() => {
    testDatabase = createTestDatabase();
    schools = new SchoolProfileService(testDatabase.database);
    families = new FamilyAccountsService(testDatabase.database, schools);
    invoices = new InvoicesService(testDatabase.database, families);
    service = new PaymentEventsService(testDatabase.database, schools);

    const school = schools.create({ name: 'Knit Academy' });
    schoolId = school.id;
    familyAccountId = families.create(schoolId, {
      accountReference: 'fam_100',
      displayName: 'The Ndlovu family',
    }).id;
    invoices.create(schoolId, familyAccountId, {
      invoiceReference: 'inv_100',
      currency: 'ZAR',
      issuedAt: '2026-08-01T00:00:00Z',
      dueAt: '2026-08-31T00:00:00Z',
      lineItems: [{ description: 'Term fees', amountCents: 450000 }],
    });
  });

  afterEach(() => {
    testDatabase.cleanup();
  });

  it('applies a valid successful payment exactly once', () => {
    const first = service.ingest(schoolId, baseEvent);
    const replay = service.ingest(schoolId, baseEvent);

    expect(first.event.processingStatus).toBe('applied');
    expect(replay.event).toMatchObject({ id: first.event.id, processingStatus: 'applied' });
    expect(testDatabase.database.db.select().from(ledgerEntries).all()).toEqual([
      expect.objectContaining({ kind: 'payment', amountCents: 450000 }),
    ]);
  });

  it('records a failed payment without creating a financial entry', () => {
    const result = service.ingest(schoolId, {
      ...baseEvent,
      event_id: 'evt_failed',
      type: 'payment.failed',
      reason: 'insufficient_funds',
    });

    expect(result.event).toMatchObject({
      processingStatus: 'recorded_no_effect',
      processingReason: 'insufficient_funds',
    });
    expect(testDatabase.database.db.select().from(ledgerEntries).all()).toHaveLength(0);
  });

  it('rejects a negative successful payment', () => {
    const result = service.ingest(schoolId, {
      ...baseEvent,
      event_id: 'evt_negative',
      amount_cents: -50000,
    });

    expect(result.event).toMatchObject({
      processingStatus: 'rejected',
      processingReason: 'invalid_amount',
    });
  });

  it('retains an unsupported currency for manual review', () => {
    const result = service.ingest(schoolId, {
      ...baseEvent,
      event_id: 'evt_usd',
      currency: 'USD',
    });

    expect(result.event).toMatchObject({
      processingStatus: 'unresolved',
      processingReason: 'unsupported_currency_requires_review',
    });
    expect(testDatabase.database.db.select().from(ledgerEntries).all()).toHaveLength(0);
  });

  it('reconciles an event after its invoice arrives', () => {
    const unresolved = service.ingest(schoolId, {
      ...baseEvent,
      event_id: 'evt_late',
      invoice_id: 'inv_late',
    });

    expect(unresolved.event.processingStatus).toBe('unresolved');

    invoices.create(schoolId, familyAccountId, {
      invoiceReference: 'inv_late',
      currency: 'ZAR',
      issuedAt: '2026-08-01T00:00:00Z',
      dueAt: '2026-08-31T00:00:00Z',
      lineItems: [{ description: 'Late invoice', amountCents: 450000 }],
    });

    service.reconcile(schoolId, unresolved.event.id);
    service.reconcile(schoolId, unresolved.event.id);

    expect(service.findById(schoolId, unresolved.event.id).processingStatus).toBe('applied');
    expect(testDatabase.database.db.select().from(ledgerEntries).all()).toHaveLength(1);
  });

  it('creates a refund entry rather than changing the invoice', () => {
    const result = service.ingest(schoolId, {
      ...baseEvent,
      event_id: 'evt_refund',
      type: 'payment.refunded',
    });

    expect(result.event.processingStatus).toBe('applied');
    expect(testDatabase.database.db.select().from(ledgerEntries).all()).toEqual([
      expect.objectContaining({ kind: 'refund', amountCents: 450000 }),
    ]);
  });

  it('treats similar callbacks with different event IDs as distinct payments', () => {
    service.ingest(schoolId, { ...baseEvent, event_id: 'evt_006', amount_cents: 75000 });
    service.ingest(schoolId, { ...baseEvent, event_id: 'evt_007', amount_cents: 75000 });

    expect(testDatabase.database.db.select().from(paymentEvents).all()).toHaveLength(2);
    expect(testDatabase.database.db.select().from(ledgerEntries).all()).toHaveLength(2);
  });
});
