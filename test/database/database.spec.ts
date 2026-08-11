import { DatabaseService } from '@/database/database.service';

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
});
