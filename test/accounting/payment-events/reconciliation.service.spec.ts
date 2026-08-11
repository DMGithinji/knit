import { PaymentEventDto } from '@/accounting/payment-events/dto/payment-event.dto';
import { ledgerEntries, paymentEvents } from '@/database/schema';
import { baseEvent, createPaymentEventTestContext, PaymentEventTestContext } from './test-context';

describe('PaymentReconciliationService', () => {
  let context: PaymentEventTestContext;

  beforeEach(() => {
    context = createPaymentEventTestContext();
  });

  afterEach(() => {
    context.testDatabase.cleanup();
  });

  it('records a failed payment without creating a financial entry', () => {
    const result = context.paymentCapture.capture(context.schoolId, {
      ...baseEvent,
      event_id: 'evt_failed',
      type: 'payment.failed',
      reason: 'insufficient_funds',
    });

    expect(result.event).toMatchObject({
      familyAccountId: context.familyAccountId,
      processingStatus: 'recorded_no_effect',
      processingReason: 'insufficient_funds',
    });
    expect(context.testDatabase.database.db.select().from(ledgerEntries).all()).toHaveLength(0);
  });

  it('rejects a negative successful payment', () => {
    const result = context.paymentCapture.capture(context.schoolId, {
      ...baseEvent,
      event_id: 'evt_negative',
      amount_cents: -50000,
    });

    expect(result.event).toMatchObject({
      familyAccountId: context.familyAccountId,
      processingStatus: 'rejected',
      processingReason: 'invalid_amount',
    });
  });

  it('retains an unsupported currency for manual review', () => {
    const result = context.paymentCapture.capture(context.schoolId, {
      ...baseEvent,
      event_id: 'evt_usd',
      currency: 'USD',
    });

    expect(result.event).toMatchObject({
      familyAccountId: context.familyAccountId,
      processingStatus: 'unresolved',
      processingReason: 'unsupported_currency_requires_review',
    });
    expect(context.testDatabase.database.db.select().from(ledgerEntries).all()).toHaveLength(0);
  });

  it('applies a payment to its family when the referenced invoice is absent', () => {
    const result = context.paymentCapture.capture(context.schoolId, {
      ...baseEvent,
      event_id: 'evt_late',
      invoice_id: 'inv_late',
    });

    expect(result.event).toMatchObject({
      familyAccountId: context.familyAccountId,
      processingStatus: 'applied_requires_review',
      processingReason: 'invoice_not_found',
    });
    expect(context.testDatabase.database.db.select().from(ledgerEntries).all()).toEqual([
      expect.objectContaining({ invoiceId: null, paymentEventId: result.event.id }),
    ]);
  });

  it('re-drives every received or recoverable unresolved event after an interruption', () => {
    const interruptedPayload: PaymentEventDto = {
      ...baseEvent,
      event_id: 'evt_interrupted',
    };
    const interrupted = context.testDatabase.database.db
      .insert(paymentEvents)
      .values({
        schoolId: context.schoolId,
        providerEventId: interruptedPayload.event_id,
        type: interruptedPayload.type,
        familyReference: interruptedPayload.family_id,
        invoiceReference: interruptedPayload.invoice_id,
        amountCents: interruptedPayload.amount_cents,
        currency: interruptedPayload.currency,
        occurredAt: interruptedPayload.occurred_at,
        rawPayload: { ...interruptedPayload },
      })
      .returning()
      .get();
    context.paymentCapture.capture(context.schoolId, {
      ...baseEvent,
      event_id: 'evt_already_applied',
      occurred_at: '2026-08-01T09:16:22Z',
    });
    const needsHumanReview = context.paymentCapture.capture(context.schoolId, {
      ...baseEvent,
      event_id: 'evt_usd_batch',
      currency: 'USD',
      occurred_at: '2026-08-01T09:17:22Z',
    });

    const result = context.paymentReconciliation.reconcilePending(context.schoolId);

    expect(result).toMatchObject({
      attemptedCount: 1,
      recoveredCount: 1,
      stillPendingCount: 0,
      errorCount: 0,
    });
    expect(result.outcomes).toEqual([
      expect.objectContaining({
        eventId: interrupted.id,
        providerEventId: 'evt_interrupted',
        status: 'applied',
      }),
    ]);
    expect(context.testDatabase.database.db.select().from(ledgerEntries).all()).toHaveLength(2);
    expect(
      context.paymentQueries.findById(context.schoolId, needsHumanReview.event.id),
    ).toMatchObject({
      processingStatus: 'unresolved',
      processingReason: 'unsupported_currency_requires_review',
    });
    expect(context.paymentReconciliation.reconcilePending(context.schoolId)).toMatchObject({
      attemptedCount: 0,
    });
  });

  it('creates a refund entry rather than changing the invoice', () => {
    const result = context.paymentCapture.capture(context.schoolId, {
      ...baseEvent,
      event_id: 'evt_refund',
      type: 'payment.refunded',
    });

    expect(result.event.processingStatus).toBe('applied');
    expect(context.testDatabase.database.db.select().from(ledgerEntries).all()).toEqual([
      expect.objectContaining({ kind: 'refund', amountCents: 450000 }),
    ]);
  });
});
