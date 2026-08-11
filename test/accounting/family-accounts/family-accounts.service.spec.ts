import { NotFoundException } from '@nestjs/common';
import { FamilyAccountsService } from '@/accounting/family-accounts/family-accounts.service';
import { SchoolProfileService } from '@/schools/profile/school-profile.service';
import { createTestDatabase, TestDatabase } from '@test/helpers/test-database';

describe('FamilyAccountsService', () => {
  let testDatabase: TestDatabase;
  let schools: SchoolProfileService;
  let families: FamilyAccountsService;

  beforeEach(() => {
    testDatabase = createTestDatabase();
    schools = new SchoolProfileService(testDatabase.database);
    families = new FamilyAccountsService(testDatabase.database, schools);
  });

  afterEach(() => {
    testDatabase.cleanup();
  });

  it('creates a family account and its students', () => {
    const school = schools.create({ name: 'Knit Academy' });
    const family = families.create(school.id, {
      accountReference: 'fam_100',
      displayName: 'The Ndlovu family',
    });

    families.addStudent(school.id, family.id, {
      studentReference: 'student_100',
      name: 'Anele Ndlovu',
    });

    expect(families.getStudents(school.id, family.id)).toEqual([
      expect.objectContaining({ name: 'Anele Ndlovu', familyAccountId: family.id }),
    ]);
  });

  it('scopes family references to a school', () => {
    const schoolOne = schools.create({ name: 'School One' });
    const schoolTwo = schools.create({ name: 'School Two' });
    const first = families.create(schoolOne.id, {
      accountReference: 'fam_100',
      displayName: 'First family',
    });
    const second = families.create(schoolTwo.id, {
      accountReference: 'fam_100',
      displayName: 'Second family',
    });

    expect(first.id).not.toBe(second.id);
    expect(() => families.findById(schoolTwo.id, first.id)).toThrow(NotFoundException);
  });
});
