import { Module } from '@nestjs/common';
import { SchoolsModule } from '@/schools/schools.module';
import { BalancesController } from './balances/balances.controller';
import { BalancesService } from './balances/balances.service';
import { FamilyAccountsController } from './family-accounts/family-accounts.controller';
import { FamilyAccountsService } from './family-accounts/family-accounts.service';
import { InvoicesController } from './invoices/invoices.controller';
import { InvoicesService } from './invoices/invoices.service';
import { PaymentEventsController } from './payment-events/payment-events.controller';
import { PaymentEventsService } from './payment-events/payment-events.service';

@Module({
  imports: [SchoolsModule],
  controllers: [
    FamilyAccountsController,
    InvoicesController,
    PaymentEventsController,
    BalancesController,
  ],
  providers: [FamilyAccountsService, InvoicesService, PaymentEventsService, BalancesService],
  exports: [FamilyAccountsService, InvoicesService, PaymentEventsService, BalancesService],
})
export class AccountingModule {}
