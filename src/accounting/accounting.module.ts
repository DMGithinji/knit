import { Module } from '@nestjs/common';
import { SchoolsModule } from '@/schools/schools.module';
import { FamilyAccountsController } from './family-accounts/family-accounts.controller';
import { FamilyAccountsService } from './family-accounts/family-accounts.service';
import { InvoicesController } from './invoices/invoices.controller';
import { InvoicesService } from './invoices/invoices.service';

@Module({
  imports: [SchoolsModule],
  controllers: [FamilyAccountsController, InvoicesController],
  providers: [FamilyAccountsService, InvoicesService],
  exports: [FamilyAccountsService, InvoicesService],
})
export class AccountingModule {}
