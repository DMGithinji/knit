import { baseEvent, createPaymentEventTestContext, PaymentEventTestContext } from './test-context';

describe('PaymentQueryService', () => {
  let context: PaymentEventTestContext;

  beforeEach(() => {
    context = createPaymentEventTestContext();
  });

  afterEach(() => {
    context.testDatabase.cleanup();
  });

  it('searches school payment events and makes unlinked events discoverable', () => {
    context.paymentCapture.capture(context.schoolId, baseEvent);
    context.paymentCapture.capture(context.schoolId, {
      ...baseEvent,
      event_id: 'evt_unlinked',
      family_id: 'fam_missing',
      occurred_at: '2026-08-02T09:14:22Z',
    });
    context.paymentCapture.capture(context.schoolId, {
      ...baseEvent,
      event_id: 'evt_usd_search',
      currency: 'USD',
      occurred_at: '2026-08-03T09:14:22Z',
    });

    const unlinked = context.paymentQueries.search(context.schoolId, {
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

    const usdInRange = context.paymentQueries.search(context.schoolId, {
      status: 'unresolved',
      linked: 'true',
      occurredFrom: '2026-08-03T00:00:00Z',
      occurredTo: '2026-08-03T23:59:59Z',
    });

    expect(usdInRange.items).toEqual([
      expect.objectContaining({
        providerEventId: 'evt_usd_search',
        familyAccountId: context.familyAccountId,
        currency: 'USD',
      }),
    ]);
  });

  it('paginates payment-event searches in a deterministic order', () => {
    context.paymentCapture.capture(context.schoolId, { ...baseEvent, event_id: 'evt_first' });
    context.paymentCapture.capture(context.schoolId, {
      ...baseEvent,
      event_id: 'evt_second',
      occurred_at: '2026-08-02T09:14:22Z',
    });
    context.paymentCapture.capture(context.schoolId, {
      ...baseEvent,
      event_id: 'evt_third',
      occurred_at: '2026-08-03T09:14:22Z',
    });

    const result = context.paymentQueries.search(context.schoolId, { limit: 1, offset: 1 });

    expect(result.items).toEqual([expect.objectContaining({ providerEventId: 'evt_second' })]);
    expect(result.pagination).toEqual({
      limit: 1,
      offset: 1,
      total: 3,
      hasMore: true,
    });
  });
});
