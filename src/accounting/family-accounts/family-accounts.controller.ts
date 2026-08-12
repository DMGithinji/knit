import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CreateFamilyAccountDto, CreateStudentDto } from './dto/family-account.dto';
import { FamilyAccountsService } from './family-accounts.service';

@ApiTags('Families')
@Controller('schools/:schoolId/families')
export class FamilyAccountsController {
  constructor(private readonly families: FamilyAccountsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a family account' })
  create(@Param('schoolId') schoolId: string, @Body() input: CreateFamilyAccountDto) {
    return this.families.create(schoolId, input);
  }

  @Get(':familyAccountId')
  @ApiOperation({ summary: 'Get a family account' })
  findById(@Param('schoolId') schoolId: string, @Param('familyAccountId') familyAccountId: string) {
    return this.families.findById(schoolId, familyAccountId);
  }

  @Post(':familyAccountId/students')
  @ApiOperation({ summary: 'Add a student to a family account' })
  addStudent(
    @Param('schoolId') schoolId: string,
    @Param('familyAccountId') familyAccountId: string,
    @Body() input: CreateStudentDto,
  ) {
    return this.families.addStudent(schoolId, familyAccountId, input);
  }

  @Get(':familyAccountId/students')
  @ApiOperation({ summary: 'List students in a family account' })
  getStudents(
    @Param('schoolId') schoolId: string,
    @Param('familyAccountId') familyAccountId: string,
  ) {
    return this.families.getStudents(schoolId, familyAccountId);
  }
}
