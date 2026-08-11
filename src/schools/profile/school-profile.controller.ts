import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { CreateSchoolDto } from './dto/create-school.dto';
import { UpdateSchoolDto } from './dto/update-school.dto';
import { SchoolProfileService } from './school-profile.service';

@Controller('schools')
export class SchoolProfileController {
  constructor(private readonly schools: SchoolProfileService) {}

  @Get()
  findAll() {
    return this.schools.findAll();
  }

  @Get(':schoolId')
  findById(@Param('schoolId') schoolId: string) {
    return this.schools.findById(schoolId);
  }

  @Post()
  create(@Body() input: CreateSchoolDto) {
    return this.schools.create(input);
  }

  @Patch(':schoolId')
  update(@Param('schoolId') schoolId: string, @Body() input: UpdateSchoolDto) {
    return this.schools.update(schoolId, input);
  }

  @Delete(':schoolId')
  deactivate(@Param('schoolId') schoolId: string) {
    return this.schools.deactivate(schoolId);
  }
}
