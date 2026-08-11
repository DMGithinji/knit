import { Module } from '@nestjs/common';
import { SchoolsModule } from '@/schools/schools.module';
import { FamilyAccountsController } from './family-accounts/family-accounts.controller';
import { FamilyAccountsService } from './family-accounts/family-accounts.service';

@Module({
  imports: [SchoolsModule],
  controllers: [FamilyAccountsController],
  providers: [FamilyAccountsService],
  exports: [FamilyAccountsService],
})
export class AccountingModule {}
