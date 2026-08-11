import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CreateFamilyAccountDto, CreateStudentDto } from './dto/family-account.dto';
import { FamilyAccountsService } from './family-accounts.service';

@Controller('schools/:schoolId/families')
export class FamilyAccountsController {
  constructor(private readonly families: FamilyAccountsService) {}

  @Post()
  create(@Param('schoolId') schoolId: string, @Body() input: CreateFamilyAccountDto) {
    return this.families.create(schoolId, input);
  }

  @Get(':familyAccountId')
  findById(@Param('schoolId') schoolId: string, @Param('familyAccountId') familyAccountId: string) {
    return this.families.findById(schoolId, familyAccountId);
  }

  @Post(':familyAccountId/students')
  addStudent(
    @Param('schoolId') schoolId: string,
    @Param('familyAccountId') familyAccountId: string,
    @Body() input: CreateStudentDto,
  ) {
    return this.families.addStudent(schoolId, familyAccountId, input);
  }

  @Get(':familyAccountId/students')
  getStudents(
    @Param('schoolId') schoolId: string,
    @Param('familyAccountId') familyAccountId: string,
  ) {
    return this.families.getStudents(schoolId, familyAccountId);
  }
}
