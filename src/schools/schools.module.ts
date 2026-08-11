import { Module } from '@nestjs/common';
import { SchoolProfileController } from './profile/school-profile.controller';
import { SchoolProfileService } from './profile/school-profile.service';

@Module({
  controllers: [SchoolProfileController],
  providers: [SchoolProfileService],
  exports: [SchoolProfileService],
})
export class SchoolsModule {}
