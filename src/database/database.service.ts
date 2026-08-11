import { Injectable, OnModuleDestroy } from '@nestjs/common';
import Database from 'better-sqlite3';
import { BetterSQLite3Database, drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';

export type KnitDatabase = BetterSQLite3Database<typeof schema>;

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  readonly connection: Database.Database;
  readonly db: KnitDatabase;

  constructor(databasePath = process.env.DATABASE_PATH ?? './knit.sqlite') {
    this.connection = new Database(databasePath);
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
