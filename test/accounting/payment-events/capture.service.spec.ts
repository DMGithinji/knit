import { Logger } from '@nestjs/common';
import { ledgerEntries, paymentEvents } from '@/database/schema';
import { baseEvent, createPaymentEventTestContext, PaymentEventTestContext } from './test-context';

describe('PaymentCaptureService', () => {
  let context: PaymentEventTestContext;

  beforeEach(() => {
    context = createPaymentEventTestContext();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    context.testDatabase.cleanup();
  });

  it('applies a valid successful payment exactly once', () => {
    const first = context.paymentCapture.capture(context.schoolId, baseEvent);
    const replay = context.paymentCapture.capture(context.schoolId, baseEvent);

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
    expect(context.testDatabase.database.db.select().from(ledgerEntries).all()).toEqual([
      expect.objectContaining({ kind: 'payment', amountCents: 450000 }),
    ]);
  });

  it('flags changed money facts without changing the stored event', () => {
    const logError = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    context.paymentCapture.capture(context.schoolId, baseEvent);

    const conflict = context.paymentCapture.capture(context.schoolId, {
      ...baseEvent,
      amount_cents: 900000,
    });

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
    expect(context.testDatabase.database.db.select().from(paymentEvents).all()).toEqual([
      expect.objectContaining({ amountCents: 450000 }),
    ]);
    expect(context.testDatabase.database.db.select().from(ledgerEntries).all()).toHaveLength(1);
  });

  it('ignores reason changes and equivalent timestamp formatting on a retry', () => {
    context.paymentCapture.capture(context.schoolId, baseEvent);

    const retry = context.paymentCapture.capture(context.schoolId, {
      ...baseEvent,
      occurred_at: '2026-08-01T11:14:22+02:00',
      reason: 'provider added context on retry',
    });

    expect(retry).toMatchObject({
      deliveryOutcome: 'duplicate',
      conflictingFields: [],
      event: { amount: 4500, occurredAt: baseEvent.occurred_at },
    });
    expect(context.testDatabase.database.db.select().from(ledgerEntries).all()).toHaveLength(1);
  });

  it('applies different event IDs separately and marks a similar payment for review', () => {
    const first = context.paymentCapture.capture(context.schoolId, {
      ...baseEvent,
      event_id: 'evt_006',
      amount_cents: 75000,
      occurred_at: '2026-08-01T10:44:10Z',
    });
    const second = context.paymentCapture.capture(context.schoolId, {
      ...baseEvent,
      event_id: 'evt_007',
      amount_cents: 75000,
      occurred_at: '2026-08-01T10:44:11Z',
    });

    expect(context.testDatabase.database.db.select().from(paymentEvents).all()).toHaveLength(2);
    expect(context.testDatabase.database.db.select().from(ledgerEntries).all()).toHaveLength(2);
    expect(first.event).toMatchObject({
      processingStatus: 'applied',
      processingReason: null,
      relatedProviderEventId: null,
    });
    expect(second.event).toMatchObject({
      processingStatus: 'applied_requires_review',
      processingReason: 'similar_payment',
      relatedProviderEventId: 'evt_006',
    });
  });

  it('does not flag matching payments outside the review window', () => {
    context.paymentCapture.capture(context.schoolId, {
      ...baseEvent,
      event_id: 'evt_first',
      occurred_at: '2026-08-01T10:44:10Z',
    });
    context.paymentCapture.capture(context.schoolId, {
      ...baseEvent,
      event_id: 'evt_later',
      occurred_at: '2026-08-01T10:46:10Z',
    });

    expect(context.testDatabase.database.db.select().from(ledgerEntries).all()).toHaveLength(2);
    expect(context.testDatabase.database.db.select().from(paymentEvents).all()).toEqual([
      expect.objectContaining({ processingStatus: 'applied', relatedProviderEventId: null }),
      expect.objectContaining({ processingStatus: 'applied', relatedProviderEventId: null }),
    ]);
  });
});
