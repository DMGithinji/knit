import { DatabaseService } from '@/database/database.service';
import { createTestDatabase } from '@test/helpers/test-database';

describe('DatabaseService', () => {
  it('enables SQLite foreign-key enforcement', () => {
    const database = new DatabaseService(':memory:');

    try {
      const result = database.connection.pragma('foreign_keys', { simple: true });
      expect(result).toBe(1);
    } finally {
      database.close();
    }
  });

  it('keeps every immutability trigger after all migrations run', () => {
    const testDatabase = createTestDatabase();

    try {
      const triggers = testDatabase.database.connection
        .prepare("SELECT name FROM sqlite_master WHERE type = 'trigger' ORDER BY name")
        .all() as Array<{ name: string }>;

      expect(triggers.map(({ name }) => name)).toEqual([
        'ledger_entries_prevent_delete',
        'ledger_entries_prevent_update',
        'payment_event_resolutions_prevent_delete',
        'payment_event_resolutions_prevent_update',
        'payment_events_prevent_delete',
        'payment_events_prevent_provider_fact_update',
        'school_config_activations_prevent_delete',
        'school_config_activations_prevent_update',
        'school_config_versions_prevent_delete',
        'school_config_versions_prevent_update',
      ]);
    } finally {
      testDatabase.cleanup();
    }
  });
});
