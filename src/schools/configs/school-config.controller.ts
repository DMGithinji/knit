import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ActivateConfigVersionDto, CreateConfigVersionDto } from './dto/school-config.dto';
import { SchoolConfigService } from './school-config.service';

@Controller('schools/:schoolId/config')
export class SchoolConfigController {
  constructor(private readonly config: SchoolConfigService) {}

  @Get()
  getActive(@Param('schoolId') schoolId: string) {
    return this.config.getActiveConfig(schoolId);
  }

  @Get('history')
  getHistory(@Param('schoolId') schoolId: string) {
    return this.config.getHistory(schoolId);
  }

  @Post('versions')
  createVersion(@Param('schoolId') schoolId: string, @Body() input: CreateConfigVersionDto) {
    return this.config.createVersion(schoolId, input);
  }

  @Post('versions/:versionId/activate')
  activateVersion(
    @Param('schoolId') schoolId: string,
    @Param('versionId') versionId: string,
    @Body() input: ActivateConfigVersionDto,
  ) {
    return this.config.activateVersion(schoolId, versionId, input);
  }
}
