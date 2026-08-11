import { Module } from '@nestjs/common';
import { SchoolConfigController } from './configs/school-config.controller';
import { SchoolConfigService } from './configs/school-config.service';
import { SchoolProfileController } from './profile/school-profile.controller';
import { SchoolProfileService } from './profile/school-profile.service';

@Module({
  controllers: [SchoolConfigController, SchoolProfileController],
  providers: [SchoolConfigService, SchoolProfileService],
  exports: [SchoolConfigService, SchoolProfileService],
})
export class SchoolsModule {}
