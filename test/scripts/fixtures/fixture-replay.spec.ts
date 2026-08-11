import { ledgerEntries, paymentEvents } from '@/database/schema';
import { FixtureReplay, loadPaymentEventFixture } from '@scripts/fixtures/fixture-replay';
import { createTestDatabase, TestDatabase } from '@test/helpers/test-database';

describe('payment event fixture replay', () => {
  let testDatabase: TestDatabase;
  let replay: FixtureReplay;

  beforeEach(() => {
    testDatabase = createTestDatabase();
    replay = new FixtureReplay(testDatabase.database);
    replay.seed();
  });

  afterEach(() => {
    testDatabase.cleanup();
  });

  it('keeps the same explainable balances after three complete deliveries', () => {
    const events = loadPaymentEventFixture();

    expect(events).toHaveLength(11);
    const firstOutcomes = replay.replay(events);
    const firstBalances = replay.getBalanceSnapshots();

    replay.replay(events);
    replay.replay(events);

    expect(replay.getBalanceSnapshots()).toEqual(firstBalances);
    expect(testDatabase.database.db.select().from(paymentEvents).all()).toHaveLength(10);
    expect(testDatabase.database.db.select().from(ledgerEntries).all()).toHaveLength(6);
    expect(firstOutcomes).toEqual([
      { providerEventId: 'evt_001', status: 'applied', reason: null },
      { providerEventId: 'evt_002', status: 'applied', reason: null },
      { providerEventId: 'evt_002', status: 'applied', reason: null },
      {
        providerEventId: 'evt_003',
        status: 'recorded_no_effect',
        reason: 'insufficient_funds',
      },
      { providerEventId: 'evt_004', status: 'applied', reason: null },
      { providerEventId: 'evt_005', status: 'applied', reason: null },
      { providerEventId: 'evt_006', status: 'applied', reason: null },
      { providerEventId: 'evt_007', status: 'applied', reason: null },
      {
        providerEventId: 'evt_008',
        status: 'unresolved',
        reason: 'invoice_not_found',
      },
      { providerEventId: 'evt_009', status: 'rejected', reason: 'invalid_amount' },
      {
        providerEventId: 'evt_010',
        status: 'unresolved',
        reason: 'unsupported_currency_requires_review',
      },
    ]);
    expect(firstBalances).toEqual([
      {
        familyReference: 'fam_100',
        totalInvoicedCents: 450000,
        totalPaymentsCents: 450000,
        totalRefundsCents: 450000,
        amountOwedCents: 450000,
        attentionItems: [],
      },
      {
        familyReference: 'fam_101',
        totalInvoicedCents: 300000,
        totalPaymentsCents: 150000,
        totalRefundsCents: 0,
        amountOwedCents: 150000,
        attentionItems: [
          {
            providerEventId: 'evt_010',
            status: 'unresolved',
            reason: 'unsupported_currency_requires_review',
          },
        ],
      },
      {
        familyReference: 'fam_102',
        totalInvoicedCents: 300000,
        totalPaymentsCents: 300000,
        totalRefundsCents: 0,
        amountOwedCents: 0,
        attentionItems: [
          {
            providerEventId: 'evt_003',
            status: 'recorded_no_effect',
            reason: 'insufficient_funds',
          },
        ],
      },
      {
        familyReference: 'fam_103',
        totalInvoicedCents: 150000,
        totalPaymentsCents: 150000,
        totalRefundsCents: 0,
        amountOwedCents: 0,
        attentionItems: [],
      },
      {
        familyReference: 'fam_104',
        totalInvoicedCents: 0,
        totalPaymentsCents: 0,
        totalRefundsCents: 0,
        amountOwedCents: 0,
        attentionItems: [
          {
            providerEventId: 'evt_008',
            status: 'unresolved',
            reason: 'invoice_not_found',
          },
        ],
      },
      {
        familyReference: 'fam_105',
        totalInvoicedCents: 50000,
        totalPaymentsCents: 0,
        totalRefundsCents: 0,
        amountOwedCents: 50000,
        attentionItems: [
          {
            providerEventId: 'evt_009',
            status: 'rejected',
            reason: 'invalid_amount',
          },
        ],
      },
    ]);
  });
});
