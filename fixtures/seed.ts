import { join } from 'node:path';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { DatabaseService } from '@/database/database.service';
import { FIXTURE_FAMILIES } from './fixture-data';
import { seedFixtureData } from './fixture-seed';

const database = new DatabaseService();

try {
  migrate(database.db, { migrationsFolder: join(process.cwd(), 'drizzle') });
  const seed = seedFixtureData(database);
  const apiUrl = (process.env.API_URL ?? 'http://localhost:3000').replace(/\/$/, '');

  console.log(`Fixture data is ready for school ${seed.schoolId}.`);
  console.log('\nFamily balance URLs:');
  for (const family of FIXTURE_FAMILIES) {
    const familyAccountId = seed.familyIdsByReference.get(family.accountReference);
    console.log(
      `  ${family.accountReference}: ${apiUrl}/schools/${seed.schoolId}/families/${familyAccountId}/balance`,
    );
  }
  console.log('Start the API with pnpm start:dev, then run pnpm fixture:post.');
} finally {
  database.close();
}
