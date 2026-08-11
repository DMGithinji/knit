import { Module } from '@nestjs/common';
import { SchoolsModule } from '@/schools/schools.module';
import { BalancesController } from './balances/balances.controller';
import { BalancesService } from './balances/balances.service';
import { FamilyAccountsController } from './family-accounts/family-accounts.controller';
import { FamilyAccountsService } from './family-accounts/family-accounts.service';
import { InvoicesController } from './invoices/invoices.controller';
import { InvoicesService } from './invoices/invoices.service';
import { PaymentEventsController } from './payment-events/payment-events.controller';
import {
  PaymentCaptureService,
  PaymentQueryService,
  PaymentReconciliationService,
  PaymentReviewService,
} from './payment-events/services';

@Module({
  imports: [SchoolsModule],
  controllers: [
    FamilyAccountsController,
    InvoicesController,
    PaymentEventsController,
    BalancesController,
  ],
  providers: [
    FamilyAccountsService,
    InvoicesService,
    PaymentCaptureService,
    PaymentQueryService,
    PaymentReconciliationService,
    PaymentReviewService,
    BalancesService,
  ],
  exports: [
    FamilyAccountsService,
    InvoicesService,
    PaymentCaptureService,
    PaymentQueryService,
    PaymentReconciliationService,
    PaymentReviewService,
    BalancesService,
  ],
})
export class AccountingModule {}
