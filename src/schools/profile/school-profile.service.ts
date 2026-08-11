import { Injectable, NotFoundException } from '@nestjs/common';
import { desc, eq } from 'drizzle-orm';
import { DatabaseService } from '@/database/database.service';
import { schools } from '@/database/schema';
import { CreateSchoolDto } from './dto/create-school.dto';
import { UpdateSchoolDto } from './dto/update-school.dto';

@Injectable()
export class SchoolProfileService {
  constructor(private readonly database: DatabaseService) {}

  findAll() {
    return this.database.db.select().from(schools).orderBy(desc(schools.createdAt)).all();
  }

  findById(id: string) {
    const school = this.database.db.select().from(schools).where(eq(schools.id, id)).get();

    if (!school) {
      throw new NotFoundException(`School ${id} was not found`);
    }

    return school;
  }

  create(input: CreateSchoolDto) {
    return this.database.db.insert(schools).values({ name: input.name }).returning().get();
  }

  update(id: string, input: UpdateSchoolDto) {
    this.findById(id);

    if (!input.name) {
      return this.findById(id);
    }

    return this.database.db
      .update(schools)
      .set({ name: input.name, updatedAt: new Date().toISOString() })
      .where(eq(schools.id, id))
      .returning()
      .get();
  }

  deactivate(id: string) {
    this.findById(id);

    return this.database.db
      .update(schools)
      .set({ status: 'inactive', updatedAt: new Date().toISOString() })
      .where(eq(schools.id, id))
      .returning()
      .get();
  }
}
