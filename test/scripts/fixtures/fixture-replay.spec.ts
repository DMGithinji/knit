import { ledgerEntries, paymentEvents } from '@/database/schema';
import { FixtureReplay, loadPaymentEventFixture } from '@scripts/fixtures/fixture-replay';
import { createTestDatabase, TestDatabase } from '@test/helpers/test-database';

function deterministicallyShuffle<T>(values: T[]): T[] {
  const shuffled = [...values];
  let state = 20260801;

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    state = (state * 1664525 + 1013904223) >>> 0;
    const replacementIndex = state % (index + 1);
    [shuffled[index], shuffled[replacementIndex]] = [shuffled[replacementIndex], shuffled[index]];
  }

  return shuffled;
}

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
        totalInvoiced: 4500,
        totalPayments: 4500,
        totalRefunds: 4500,
        amountOwed: 4500,
        credit: 0,
        attentionItems: [],
      },
      {
        familyReference: 'fam_101',
        totalInvoiced: 3000,
        totalPayments: 1500,
        totalRefunds: 0,
        amountOwed: 1500,
        credit: 0,
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
        totalInvoiced: 3000,
        totalPayments: 3000,
        totalRefunds: 0,
        amountOwed: 0,
        credit: 0,
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
        totalInvoiced: 750,
        totalPayments: 1500,
        totalRefunds: 0,
        amountOwed: -750,
        credit: 750,
        attentionItems: [],
      },
      {
        familyReference: 'fam_104',
        totalInvoiced: 0,
        totalPayments: 0,
        totalRefunds: 0,
        amountOwed: 0,
        credit: 0,
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
        totalInvoiced: 500,
        totalPayments: 0,
        totalRefunds: 0,
        amountOwed: 500,
        credit: 0,
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

  it('produces the same balances when deliveries arrive in shuffled order', () => {
    const events = loadPaymentEventFixture();
    replay.replay(events);
    const orderedBalances = replay.getBalanceSnapshots();
    const shuffledEvents = deterministicallyShuffle(events);

    expect(shuffledEvents.map((event) => event.event_id)).not.toEqual(
      events.map((event) => event.event_id),
    );

    const shuffledDatabase = createTestDatabase();
    try {
      const shuffledReplay = new FixtureReplay(shuffledDatabase.database);
      shuffledReplay.seed();
      shuffledReplay.replay(shuffledEvents);

      expect(shuffledReplay.getBalanceSnapshots()).toEqual(orderedBalances);
      expect(shuffledDatabase.database.db.select().from(paymentEvents).all()).toHaveLength(10);
      expect(shuffledDatabase.database.db.select().from(ledgerEntries).all()).toHaveLength(6);
    } finally {
      shuffledDatabase.cleanup();
    }
  });
});
