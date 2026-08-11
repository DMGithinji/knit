import { NotFoundException } from '@nestjs/common';
import { SchoolProfileService } from '@/schools/profile/school-profile.service';
import { createTestDatabase, TestDatabase } from '@test/helpers/test-database';

describe('SchoolProfileService', () => {
  let testDatabase: TestDatabase;
  let service: SchoolProfileService;

  beforeEach(() => {
    testDatabase = createTestDatabase();
    service = new SchoolProfileService(testDatabase.database);
  });

  afterEach(() => {
    testDatabase.cleanup();
  });

  it('creates and retrieves a school', () => {
    const created = service.create({ name: 'Knit Academy' });

    expect(service.findById(created.id)).toMatchObject({
      name: 'Knit Academy',
      status: 'active',
    });
  });

  it('updates school metadata without replacing the school', () => {
    const created = service.create({ name: 'Old name' });

    const updated = service.update(created.id, { name: 'New name' });

    expect(updated.id).toBe(created.id);
    expect(updated.name).toBe('New name');
  });

  it('deactivates instead of deleting a school', () => {
    const created = service.create({ name: 'Knit Academy' });

    service.deactivate(created.id);

    expect(service.findById(created.id).status).toBe('inactive');
  });

  it('rejects operations on an unknown school', () => {
    expect(() => service.findById('missing-school')).toThrow(NotFoundException);
  });
});
