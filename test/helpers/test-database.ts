import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { DatabaseService } from '@/database/database.service';

export interface TestDatabase {
  database: DatabaseService;
  cleanup: () => void;
}

export function createTestDatabase(): TestDatabase {
  const directory = mkdtempSync(join(tmpdir(), 'knit-assessment-'));
  const database = new DatabaseService(join(directory, 'test.sqlite'));

  migrate(database.db, { migrationsFolder: join(process.cwd(), 'drizzle') });

  return {
    database,
    cleanup: () => {
      database.close();
      rmSync(directory, { recursive: true, force: true });
    },
  };
}
