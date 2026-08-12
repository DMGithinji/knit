import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CreateSchoolDto } from './dto/create-school.dto';
import { UpdateSchoolDto } from './dto/update-school.dto';
import { SchoolProfileService } from './school-profile.service';

@ApiTags('Schools')
@Controller('schools')
export class SchoolProfileController {
  constructor(private readonly schools: SchoolProfileService) {}

  @Get()
  @ApiOperation({ summary: 'List schools' })
  findAll() {
    return this.schools.findAll();
  }

  @Get(':schoolId')
  @ApiOperation({ summary: 'Get a school' })
  findById(@Param('schoolId') schoolId: string) {
    return this.schools.findById(schoolId);
  }

  @Post()
  @ApiOperation({ summary: 'Create a school' })
  create(@Body() input: CreateSchoolDto) {
    return this.schools.create(input);
  }

  @Patch(':schoolId')
  @ApiOperation({ summary: 'Update a school' })
  update(@Param('schoolId') schoolId: string, @Body() input: UpdateSchoolDto) {
    return this.schools.update(schoolId, input);
  }

  @Delete(':schoolId')
  @ApiOperation({ summary: 'Deactivate a school' })
  deactivate(@Param('schoolId') schoolId: string) {
    return this.schools.deactivate(schoolId);
  }
}
