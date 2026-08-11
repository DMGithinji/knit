import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const schools = sqliteTable('schools', {
  id: text().primaryKey().$defaultFn(randomUUID),
  name: text().notNull(),
  status: text({ enum: ['active', 'inactive'] })
    .notNull()
    .default('active'),
  createdAt: text()
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text()
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});
