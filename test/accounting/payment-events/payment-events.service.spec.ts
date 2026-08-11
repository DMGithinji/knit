import { Logger } from '@nestjs/common';
import { FamilyAccountsService } from '@/accounting/family-accounts/family-accounts.service';
import { InvoicesService } from '@/accounting/invoices/invoices.service';
import { PaymentEventDto } from '@/accounting/payment-events/dto/payment-event.dto';
import { PaymentEventsService } from '@/accounting/payment-events/payment-events.service';
import { ledgerEntries, paymentEventResolutions, paymentEvents } from '@/database/schema';
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
      lineItems: [{ description: 'Term fees', amount: 4500 }],
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    testDatabase.cleanup();
  });

  it('applies a valid successful payment exactly once', () => {
    const first = service.ingest(schoolId, baseEvent);
    const replay = service.ingest(schoolId, baseEvent);

    expect(first).toMatchObject({
      deliveryOutcome: 'accepted',
      conflictingFields: [],
      event: { processingStatus: 'applied' },
    });
    expect(replay).toMatchObject({
      deliveryOutcome: 'duplicate',
      conflictingFields: [],
      event: { id: first.event.id, processingStatus: 'applied' },
    });
    expect(testDatabase.database.db.select().from(ledgerEntries).all()).toEqual([
      expect.objectContaining({ kind: 'payment', amountCents: 450000 }),
    ]);
  });

  it('flags changed money facts without changing the stored event', () => {
    const logError = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    service.ingest(schoolId, baseEvent);

    const conflict = service.ingest(schoolId, { ...baseEvent, amount_cents: 900000 });

    expect(conflict).toMatchObject({
      deliveryOutcome: 'conflicting_duplicate',
      conflictingFields: ['amount_cents'],
      event: { amount: 4500, processingStatus: 'applied' },
    });
    expect(logError).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Conflicting payment event re-delivery',
        providerEventId: baseEvent.event_id,
        conflictingFields: ['amount_cents'],
      }),
    );
    expect(testDatabase.database.db.select().from(paymentEvents).all()).toEqual([
      expect.objectContaining({ amountCents: 450000 }),
    ]);
    expect(testDatabase.database.db.select().from(ledgerEntries).all()).toHaveLength(1);
  });

  it('ignores reason changes and equivalent timestamp formatting on a retry', () => {
    service.ingest(schoolId, baseEvent);

    const retry = service.ingest(schoolId, {
      ...baseEvent,
      occurred_at: '2026-08-01T11:14:22+02:00',
      reason: 'provider added context on retry',
    });

    expect(retry).toMatchObject({
      deliveryOutcome: 'duplicate',
      conflictingFields: [],
      event: { amount: 4500, occurredAt: baseEvent.occurred_at },
    });
    expect(testDatabase.database.db.select().from(ledgerEntries).all()).toHaveLength(1);
  });

  it('records a failed payment without creating a financial entry', () => {
    const result = service.ingest(schoolId, {
      ...baseEvent,
      event_id: 'evt_failed',
      type: 'payment.failed',
      reason: 'insufficient_funds',
    });

    expect(result.event).toMatchObject({
      familyAccountId,
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
      familyAccountId,
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
      familyAccountId,
      processingStatus: 'unresolved',
      processingReason: 'unsupported_currency_requires_review',
    });
    expect(testDatabase.database.db.select().from(ledgerEntries).all()).toHaveLength(0);
  });

  it('applies a manually verified ZAR settlement without changing the original USD event', () => {
    const unresolved = service.ingest(schoolId, {
      ...baseEvent,
      event_id: 'evt_usd_reviewed',
      currency: 'USD',
      amount_cents: 150000,
    });

    const resolved = service.resolveManually(schoolId, unresolved.event.id, {
      decision: 'apply_verified_zar',
      verifiedAmount: 2750,
      resolvedBy: 'bursar@knit.test',
      resolutionReason: 'Provider confirmed a ZAR 2,750 settlement',
    });

    expect(resolved.processingStatus).toBe('applied');
    expect(service.findById(schoolId, unresolved.event.id)).toMatchObject({
      currency: 'USD',
      amount: 1500,
      processingReason: 'manually_verified_zar_settlement',
    });
    expect(testDatabase.database.db.select().from(ledgerEntries).all()).toEqual([
      expect.objectContaining({ currency: 'ZAR', amountCents: 275000 }),
    ]);
    expect(testDatabase.database.db.select().from(paymentEventResolutions).all()).toEqual([
      expect.objectContaining({
        decision: 'apply_verified_zar',
        verifiedAmountCents: 275000,
        resolvedBy: 'bursar@knit.test',
      }),
    ]);
  });

  it('records a reviewed event as having no financial effect', () => {
    const unresolved = service.ingest(schoolId, {
      ...baseEvent,
      event_id: 'evt_usd_ignored',
      currency: 'USD',
    });

    service.resolveManually(schoolId, unresolved.event.id, {
      decision: 'record_no_effect',
      resolvedBy: 'bursar@knit.test',
      resolutionReason: 'Provider confirmed this callback was erroneous',
    });

    expect(service.findById(schoolId, unresolved.event.id).processingStatus).toBe(
      'recorded_no_effect',
    );
    expect(testDatabase.database.db.select().from(ledgerEntries).all()).toHaveLength(0);
  });

  it('reconciles an event after its invoice arrives', () => {
    const unresolved = service.ingest(schoolId, {
      ...baseEvent,
      event_id: 'evt_late',
      invoice_id: 'inv_late',
    });

    expect(unresolved.event.familyAccountId).toBe(familyAccountId);
    expect(unresolved.event.processingStatus).toBe('unresolved');

    invoices.create(schoolId, familyAccountId, {
      invoiceReference: 'inv_late',
      currency: 'ZAR',
      issuedAt: '2026-08-01T00:00:00Z',
      dueAt: '2026-08-31T00:00:00Z',
      lineItems: [{ description: 'Late invoice', amount: 4500 }],
    });

    service.reconcile(schoolId, unresolved.event.id);
    service.reconcile(schoolId, unresolved.event.id);

    expect(service.findById(schoolId, unresolved.event.id).processingStatus).toBe('applied');
    expect(testDatabase.database.db.select().from(ledgerEntries).all()).toHaveLength(1);
  });

  it('re-drives every received or unresolved event after an interruption', () => {
    const interruptedPayload: PaymentEventDto = {
      ...baseEvent,
      event_id: 'evt_interrupted',
    };
    const interrupted = testDatabase.database.db
      .insert(paymentEvents)
      .values({
        schoolId,
        providerEventId: interruptedPayload.event_id,
        type: interruptedPayload.type,
        familyReference: interruptedPayload.family_id,
        invoiceReference: interruptedPayload.invoice_id,
        amountCents: interruptedPayload.amount_cents,
        currency: interruptedPayload.currency,
        occurredAt: interruptedPayload.occurred_at,
        rawPayload: interruptedPayload,
      })
      .returning()
      .get();
    const unresolved = service.ingest(schoolId, {
      ...baseEvent,
      event_id: 'evt_late_batch',
      invoice_id: 'inv_late_batch',
      occurred_at: '2026-08-01T09:15:22Z',
    });
    service.ingest(schoolId, {
      ...baseEvent,
      event_id: 'evt_already_applied',
      occurred_at: '2026-08-01T09:16:22Z',
    });
    const needsHumanReview = service.ingest(schoolId, {
      ...baseEvent,
      event_id: 'evt_usd_batch',
      currency: 'USD',
      occurred_at: '2026-08-01T09:17:22Z',
    });

    invoices.create(schoolId, familyAccountId, {
      invoiceReference: 'inv_late_batch',
      currency: 'ZAR',
      issuedAt: '2026-08-01T00:00:00Z',
      dueAt: '2026-08-31T00:00:00Z',
      lineItems: [{ description: 'Late batch invoice', amount: 4500 }],
    });

    const result = service.reconcilePending(schoolId);

    expect(result).toMatchObject({
      attemptedCount: 2,
      recoveredCount: 2,
      stillPendingCount: 0,
      errorCount: 0,
    });
    expect(result.outcomes).toEqual([
      expect.objectContaining({
        eventId: interrupted.id,
        providerEventId: 'evt_interrupted',
        status: 'applied',
      }),
      expect.objectContaining({
        eventId: unresolved.event.id,
        providerEventId: 'evt_late_batch',
        status: 'applied',
      }),
    ]);
    expect(testDatabase.database.db.select().from(ledgerEntries).all()).toHaveLength(3);
    expect(service.findById(schoolId, needsHumanReview.event.id)).toMatchObject({
      processingStatus: 'unresolved',
      processingReason: 'unsupported_currency_requires_review',
    });

    expect(service.reconcilePending(schoolId)).toMatchObject({ attemptedCount: 0 });
    expect(testDatabase.database.db.select().from(ledgerEntries).all()).toHaveLength(3);
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

  it('searches school payment events and makes unlinked events discoverable', () => {
    service.ingest(schoolId, baseEvent);
    service.ingest(schoolId, {
      ...baseEvent,
      event_id: 'evt_unlinked',
      family_id: 'fam_missing',
      occurred_at: '2026-08-02T09:14:22Z',
    });
    service.ingest(schoolId, {
      ...baseEvent,
      event_id: 'evt_usd_search',
      currency: 'USD',
      occurred_at: '2026-08-03T09:14:22Z',
    });

    const unlinked = service.search(schoolId, {
      status: 'unresolved',
      linked: 'false',
    });

    expect(unlinked).toEqual({
      items: [
        expect.objectContaining({
          providerEventId: 'evt_unlinked',
          familyAccountId: null,
          familyReference: 'fam_missing',
          status: 'unresolved',
          reason: 'family_not_found',
          amount: 4500,
        }),
      ],
      pagination: { limit: 50, offset: 0, total: 1, hasMore: false },
    });
    expect(unlinked.items[0]).not.toHaveProperty('rawPayload');
    expect(unlinked.items[0]).not.toHaveProperty('amountCents');
    expect(unlinked.items[0]).not.toHaveProperty('processingStatus');

    const usdInRange = service.search(schoolId, {
      status: 'unresolved',
      linked: 'true',
      occurredFrom: '2026-08-03T00:00:00Z',
      occurredTo: '2026-08-03T23:59:59Z',
    });

    expect(usdInRange.items).toEqual([
      expect.objectContaining({
        providerEventId: 'evt_usd_search',
        familyAccountId,
        currency: 'USD',
      }),
    ]);
  });

  it('paginates payment-event searches in a deterministic order', () => {
    service.ingest(schoolId, { ...baseEvent, event_id: 'evt_first' });
    service.ingest(schoolId, {
      ...baseEvent,
      event_id: 'evt_second',
      occurred_at: '2026-08-02T09:14:22Z',
    });
    service.ingest(schoolId, {
      ...baseEvent,
      event_id: 'evt_third',
      occurred_at: '2026-08-03T09:14:22Z',
    });

    const result = service.search(schoolId, { limit: 1, offset: 1 });

    expect(result.items).toEqual([expect.objectContaining({ providerEventId: 'evt_second' })]);
    expect(result.pagination).toEqual({
      limit: 1,
      offset: 1,
      total: 3,
      hasMore: true,
    });
  });
});
