import { Inject, Injectable, OnModuleDestroy, Optional } from '@nestjs/common';
import Database from 'better-sqlite3';
import { BetterSQLite3Database, drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';

export type KnitDatabase = BetterSQLite3Database<typeof schema>;
/** The handle passed to a `db.transaction(...)` callback. */
export type KnitTransaction = Parameters<Parameters<KnitDatabase['transaction']>[0]>[0];
export const DATABASE_PATH = Symbol('DATABASE_PATH');

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  readonly connection: Database.Database;
  readonly db: KnitDatabase;

  constructor(@Optional() @Inject(DATABASE_PATH) databasePath?: string) {
    this.connection = new Database(databasePath ?? process.env.DATABASE_PATH ?? './knit.sqlite');
    this.connection.pragma('foreign_keys = ON');
    this.connection.pragma('busy_timeout = 5000');
    this.db = drizzle(this.connection, { schema, casing: 'snake_case' });
  }

  onModuleDestroy(): void {
    this.close();
  }

  close(): void {
    if (this.connection.open) {
      this.connection.close();
    }
  }
}
