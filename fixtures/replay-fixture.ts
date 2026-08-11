import { join } from 'node:path';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { DatabaseService } from '@/database/database.service';
import { FixtureReplay, loadPaymentEventFixture } from './fixture-replay';

const database = new DatabaseService(':memory:');

try {
  migrate(database.db, { migrationsFolder: join(process.cwd(), 'drizzle') });

  const fixture = loadPaymentEventFixture();
  const replay = new FixtureReplay(database);
  replay.seed();

  for (let pass = 1; pass <= 3; pass += 1) {
    const outcomes = replay.replay(fixture);
    console.log(`\nReplay ${pass}: ${fixture.length} provider deliveries`);
    console.table(outcomes);
  }

  console.log('\nBalances after three complete replays');
  console.table(
    replay.getBalanceSnapshots().map((balance) => ({
      family: balance.familyReference,
      invoiced: balance.totalInvoiced,
      payments: balance.totalPayments,
      refunds: balance.totalRefunds,
      amountOwed: balance.amountOwed,
      credit: balance.credit,
      attention: balance.attentionItems
        .map((item) => `${item.providerEventId}: ${item.status} (${item.reason ?? 'no reason'})`)
        .join('; '),
    })),
  );
} finally {
  database.close();
}
