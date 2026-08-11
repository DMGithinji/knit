import { FamilyAccountsService } from '@/accounting/family-accounts/family-accounts.service';
import { InvoicesService } from '@/accounting/invoices/invoices.service';
import { invoices } from '@/database/schema';
import { SchoolProfileService } from '@/schools/profile/school-profile.service';
import { createTestDatabase, TestDatabase } from '@test/helpers/test-database';

describe('InvoicesService', () => {
  let testDatabase: TestDatabase;
  let schools: SchoolProfileService;
  let families: FamilyAccountsService;
  let service: InvoicesService;

  beforeEach(() => {
    testDatabase = createTestDatabase();
    schools = new SchoolProfileService(testDatabase.database);
    families = new FamilyAccountsService(testDatabase.database, schools);
    service = new InvoicesService(testDatabase.database, families);
  });

  afterEach(() => {
    testDatabase.cleanup();
  });

  it('creates a family invoice with student and family-level line items', () => {
    const school = schools.create({ name: 'Knit Academy' });
    const family = families.create(school.id, {
      accountReference: 'fam_100',
      displayName: 'The Ndlovu family',
    });
    const student = families.addStudent(school.id, family.id, {
      studentReference: 'student_100',
      name: 'Anele Ndlovu',
    });

    const invoice = service.create(school.id, family.id, {
      invoiceReference: 'inv_100',
      currency: 'ZAR',
      issuedAt: '2026-08-01T00:00:00Z',
      dueAt: '2026-08-31T00:00:00Z',
      lineItems: [
        { studentId: student.id, description: 'Tuition', amountCents: 400000 },
        { description: 'Family administration fee', amountCents: 50000 },
      ],
    });

    expect(invoice.totalCents).toBe(450000);
    expect(invoice.lineItems).toEqual([
      expect.objectContaining({ studentId: student.id, amountCents: 400000 }),
      expect.objectContaining({ studentId: null, amountCents: 50000 }),
    ]);
  });

  it('rejects a line item for a student from another family and rolls back the invoice', () => {
    const school = schools.create({ name: 'Knit Academy' });
    const firstFamily = families.create(school.id, {
      accountReference: 'fam_100',
      displayName: 'First family',
    });
    const secondFamily = families.create(school.id, {
      accountReference: 'fam_101',
      displayName: 'Second family',
    });
    const otherStudent = families.addStudent(school.id, secondFamily.id, {
      studentReference: 'student_101',
      name: 'Other student',
    });

    expect(() =>
      service.create(school.id, firstFamily.id, {
        invoiceReference: 'inv_100',
        currency: 'ZAR',
        issuedAt: '2026-08-01T00:00:00Z',
        dueAt: '2026-08-31T00:00:00Z',
        lineItems: [{ studentId: otherStudent.id, description: 'Tuition', amountCents: 450000 }],
      }),
    ).toThrow();

    expect(testDatabase.database.db.select().from(invoices).all()).toHaveLength(0);
  });
});
