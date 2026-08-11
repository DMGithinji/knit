import { ledgerEntries, paymentEventResolutions } from '@/database/schema';
import { baseEvent, createPaymentEventTestContext, PaymentEventTestContext } from './test-context';

describe('PaymentReviewService', () => {
  let context: PaymentEventTestContext;

  beforeEach(() => {
    context = createPaymentEventTestContext();
  });

  afterEach(() => {
    context.testDatabase.cleanup();
  });

  it('applies a manually verified ZAR settlement without changing the original USD event', () => {
    const unresolved = context.paymentCapture.capture(context.schoolId, {
      ...baseEvent,
      event_id: 'evt_usd_reviewed',
      currency: 'USD',
      amount_cents: 150000,
    });

    const resolved = context.paymentReviews.recordDecision(context.schoolId, unresolved.event.id, {
      decision: 'apply_verified_zar',
      verifiedAmount: 2750,
      resolvedBy: 'bursar@knit.test',
      resolutionReason: 'Provider confirmed a ZAR 2,750 settlement',
    });

    expect(resolved.processingStatus).toBe('applied');
    expect(context.paymentQueries.findById(context.schoolId, unresolved.event.id)).toMatchObject({
      currency: 'USD',
      amount: 1500,
      processingReason: 'manually_verified_zar_settlement',
    });
    expect(context.testDatabase.database.db.select().from(ledgerEntries).all()).toEqual([
      expect.objectContaining({ currency: 'ZAR', amountCents: 275000 }),
    ]);
    expect(context.testDatabase.database.db.select().from(paymentEventResolutions).all()).toEqual([
      expect.objectContaining({
        decision: 'apply_verified_zar',
        verifiedAmountCents: 275000,
        resolvedBy: 'bursar@knit.test',
      }),
    ]);
  });

  it('records a reviewed event as having no financial effect', () => {
    const unresolved = context.paymentCapture.capture(context.schoolId, {
      ...baseEvent,
      event_id: 'evt_usd_ignored',
      currency: 'USD',
    });

    context.paymentReviews.recordDecision(context.schoolId, unresolved.event.id, {
      decision: 'record_no_effect',
      resolvedBy: 'bursar@knit.test',
      resolutionReason: 'Provider confirmed this callback was erroneous',
    });

    expect(
      context.paymentQueries.findById(context.schoolId, unresolved.event.id).processingStatus,
    ).toBe('recorded_no_effect');
    expect(context.testDatabase.database.db.select().from(ledgerEntries).all()).toHaveLength(0);
  });
});
