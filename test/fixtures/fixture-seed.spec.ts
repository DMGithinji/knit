import { familyAccounts, invoices, schoolConfigActivations, schools } from '@/database/schema';
import { FIXTURE_FAMILIES, FIXTURE_INVOICES, FIXTURE_SCHOOL } from '@fixtures/fixture-data';
import { seedFixtureData } from '@fixtures/fixture-seed';
import { createTestDatabase, TestDatabase } from '@test/helpers/test-database';

describe('seedFixtureData', () => {
  let testDatabase: TestDatabase;

  beforeEach(() => {
    testDatabase = createTestDatabase();
  });

  afterEach(() => {
    testDatabase.cleanup();
  });

  it('creates the fixture school, active configuration, families and invoices once', () => {
    const first = seedFixtureData(testDatabase.database);
    const second = seedFixtureData(testDatabase.database);

    expect(second.schoolId).toBe(first.schoolId);
    expect(testDatabase.database.db.select().from(schools).all()).toEqual([
      expect.objectContaining({ id: first.schoolId, name: FIXTURE_SCHOOL.name }),
    ]);
    expect(testDatabase.database.db.select().from(schoolConfigActivations).all()).toHaveLength(1);
    expect(testDatabase.database.db.select().from(familyAccounts).all()).toHaveLength(
      FIXTURE_FAMILIES.length,
    );
    expect(testDatabase.database.db.select().from(invoices).all()).toHaveLength(
      FIXTURE_INVOICES.length,
    );
  });
});
