import { Injectable, NotFoundException } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { DatabaseService } from '@/database/database.service';
import { familyAccounts, students } from '@/database/schema';
import { SchoolProfileService } from '@/schools/profile/school-profile.service';
import { CreateFamilyAccountDto, CreateStudentDto } from './dto/family-account.dto';

@Injectable()
export class FamilyAccountsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly schools: SchoolProfileService,
  ) {}

  create(schoolId: string, input: CreateFamilyAccountDto) {
    this.schools.findById(schoolId);

    return this.database.db
      .insert(familyAccounts)
      .values({ schoolId, ...input })
      .returning()
      .get();
  }

  findById(schoolId: string, familyAccountId: string) {
    const family = this.database.db
      .select()
      .from(familyAccounts)
      .where(and(eq(familyAccounts.schoolId, schoolId), eq(familyAccounts.id, familyAccountId)))
      .get();

    if (!family) {
      throw new NotFoundException(`Family account ${familyAccountId} was not found`);
    }

    return family;
  }

  findByReference(schoolId: string, accountReference: string) {
    const family = this.database.db
      .select()
      .from(familyAccounts)
      .where(
        and(
          eq(familyAccounts.schoolId, schoolId),
          eq(familyAccounts.accountReference, accountReference),
        ),
      )
      .get();

    if (!family) {
      throw new NotFoundException(`Family account ${accountReference} was not found`);
    }

    return family;
  }

  addStudent(schoolId: string, familyAccountId: string, input: CreateStudentDto) {
    this.findById(schoolId, familyAccountId);

    return this.database.db
      .insert(students)
      .values({ familyAccountId, ...input })
      .returning()
      .get();
  }

  getStudents(schoolId: string, familyAccountId: string) {
    this.findById(schoolId, familyAccountId);
    return this.database.db
      .select()
      .from(students)
      .where(eq(students.familyAccountId, familyAccountId))
      .all();
  }
}
