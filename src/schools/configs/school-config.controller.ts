import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ActivateConfigVersionDto, CreateConfigVersionDto } from './dto/school-config.dto';
import { SchoolConfigService } from './school-config.service';

@ApiTags('School configuration')
@Controller('schools/:schoolId/config')
export class SchoolConfigController {
  constructor(private readonly config: SchoolConfigService) {}

  @Get()
  @ApiOperation({ summary: 'Get the active school configuration' })
  getActive(@Param('schoolId') schoolId: string) {
    return this.config.getActiveConfig(schoolId);
  }

  @Get('history')
  @ApiOperation({ summary: 'Get immutable configuration history' })
  getHistory(@Param('schoolId') schoolId: string) {
    return this.config.getHistory(schoolId);
  }

  @Post('versions')
  @ApiOperation({ summary: 'Create a configuration version' })
  createVersion(@Param('schoolId') schoolId: string, @Body() input: CreateConfigVersionDto) {
    return this.config.createVersion(schoolId, input);
  }

  @Post('versions/:versionId/activate')
  @ApiOperation({ summary: 'Activate a configuration version' })
  activateVersion(
    @Param('schoolId') schoolId: string,
    @Param('versionId') versionId: string,
    @Body() input: ActivateConfigVersionDto,
  ) {
    return this.config.activateVersion(schoolId, versionId, input);
  }
}
