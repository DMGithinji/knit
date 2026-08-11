import { FamilyAccountsService } from '@/accounting/family-accounts/family-accounts.service';
import { InvoicesService } from '@/accounting/invoices/invoices.service';
import { PaymentEventDto } from '@/accounting/payment-events/dto/payment-event.dto';
import {
  PaymentCaptureService,
  PaymentQueryService,
  PaymentReconciliationService,
  PaymentReviewService,
} from '@/accounting/payment-events/services';
import { SchoolProfileService } from '@/schools/profile/school-profile.service';
import { createTestDatabase } from '@test/helpers/test-database';

export const baseEvent: PaymentEventDto = {
  event_id: 'evt_001',
  type: 'payment.succeeded',
  family_id: 'fam_100',
  invoice_id: 'inv_100',
  amount_cents: 450000,
  currency: 'ZAR',
  occurred_at: '2026-08-01T09:14:22Z',
};

export function createPaymentEventTestContext() {
  const testDatabase = createTestDatabase();
  const schools = new SchoolProfileService(testDatabase.database);
  const families = new FamilyAccountsService(testDatabase.database, schools);
  const invoices = new InvoicesService(testDatabase.database, families);
  const paymentQueries = new PaymentQueryService(testDatabase.database, schools);
  const paymentReconciliation = new PaymentReconciliationService(testDatabase.database, schools);
  const paymentReviews = new PaymentReviewService(testDatabase.database);
  const paymentCapture = new PaymentCaptureService(
    testDatabase.database,
    schools,
    paymentQueries,
    paymentReconciliation,
  );
  const schoolId = schools.create({ name: 'Knit Academy' }).id;
  const familyAccountId = families.create(schoolId, {
    accountReference: 'fam_100',
    displayName: 'The Ndlovu family',
  }).id;

  invoices.create(schoolId, familyAccountId, {
    invoiceReference: 'inv_100',
    currency: 'ZAR',
    issuedAt: '2026-08-01T00:00:00Z',
    dueAt: '2026-08-31T00:00:00Z',
    lineItems: [{ description: 'Term fees', amount: 4500 }],
  });

  return {
    testDatabase,
    schools,
    families,
    invoices,
    paymentQueries,
    paymentReconciliation,
    paymentReviews,
    paymentCapture,
    schoolId,
    familyAccountId,
  };
}

export type PaymentEventTestContext = ReturnType<typeof createPaymentEventTestContext>;
