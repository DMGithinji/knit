import { join } from 'node:path';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { DatabaseService } from './database.service';

const database = new DatabaseService();

try {
  migrate(database.db, { migrationsFolder: join(process.cwd(), 'drizzle') });
} finally {
  database.close();
}
