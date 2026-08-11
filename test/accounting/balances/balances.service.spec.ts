import { BalancesService } from '@/accounting/balances/balances.service';
import { FamilyAccountsService } from '@/accounting/family-accounts/family-accounts.service';
import { InvoicesService } from '@/accounting/invoices/invoices.service';
import { PaymentEventsService } from '@/accounting/payment-events/payment-events.service';
import { SchoolProfileService } from '@/schools/profile/school-profile.service';
import { createTestDatabase, TestDatabase } from '@test/helpers/test-database';

describe('BalancesService', () => {
  let testDatabase: TestDatabase;
  let schools: SchoolProfileService;
  let families: FamilyAccountsService;
  let invoices: InvoicesService;
  let paymentEvents: PaymentEventsService;
  let balances: BalancesService;

  beforeEach(() => {
    testDatabase = createTestDatabase();
    schools = new SchoolProfileService(testDatabase.database);
    families = new FamilyAccountsService(testDatabase.database, schools);
    invoices = new InvoicesService(testDatabase.database, families);
    paymentEvents = new PaymentEventsService(testDatabase.database, schools);
    balances = new BalancesService(testDatabase.database, families);
  });

  afterEach(() => {
    testDatabase.cleanup();
  });

  it('explains a family balance from invoice lines, payments, refunds and attention items', () => {
    const school = schools.create({ name: 'Knit Academy' });
    const family = families.create(school.id, {
      accountReference: 'fam_100',
      displayName: 'The Ndlovu family',
    });
    const student = families.addStudent(school.id, family.id, {
      studentReference: 'student_100',
      name: 'Anele Ndlovu',
    });
    invoices.create(school.id, family.id, {
      invoiceReference: 'inv_100',
      currency: 'ZAR',
      issuedAt: '2026-08-01T00:00:00Z',
      dueAt: '2026-08-31T00:00:00Z',
      lineItems: [
        { studentId: student.id, description: 'Tuition', amountCents: 400000 },
        { description: 'Family administration fee', amountCents: 50000 },
      ],
    });

    paymentEvents.ingest(school.id, {
      event_id: 'evt_payment',
      type: 'payment.succeeded',
      family_id: 'fam_100',
      invoice_id: 'inv_100',
      amount_cents: 450000,
      currency: 'ZAR',
      occurred_at: '2026-08-01T09:14:22Z',
    });
    paymentEvents.ingest(school.id, {
      event_id: 'evt_refund',
      type: 'payment.refunded',
      family_id: 'fam_100',
      invoice_id: 'inv_100',
      amount_cents: 100000,
      currency: 'ZAR',
      occurred_at: '2026-08-01T14:02:55Z',
    });
    paymentEvents.ingest(school.id, {
      event_id: 'evt_failed',
      type: 'payment.failed',
      family_id: 'fam_100',
      invoice_id: 'inv_100',
      amount_cents: 450000,
      currency: 'ZAR',
      occurred_at: '2026-08-01T15:02:55Z',
      reason: 'insufficient_funds',
    });
    paymentEvents.ingest(school.id, {
      event_id: 'evt_usd',
      type: 'payment.succeeded',
      family_id: 'fam_100',
      invoice_id: 'inv_100',
      amount_cents: 50000,
      currency: 'USD',
      occurred_at: '2026-08-01T16:02:55Z',
    });

    const balance = balances.getFamilyBalance(school.id, family.id);

    expect(balance.summary).toEqual({
      totalInvoicedCents: 450000,
      totalPaymentsCents: 450000,
      totalRefundsCents: 100000,
      amountOwedCents: 100000,
      creditCents: 0,
      formula: 'total invoices - successful payments + refunds',
    });
    expect(balance.invoices[0]).toMatchObject({
      invoiceReference: 'inv_100',
      invoicedCents: 450000,
      paidCents: 450000,
      refundedCents: 100000,
      amountOwedCents: 100000,
    });
    expect(balance.invoices[0]?.lineItems[0]?.student).toMatchObject({
      id: student.id,
      name: 'Anele Ndlovu',
    });
    expect(balance.financialEntries.map((entry) => entry.effectOnAmountOwedCents)).toEqual([
      -450000, 100000,
    ]);
    expect(balance.attentionItems).toEqual([
      expect.objectContaining({
        providerEventId: 'evt_failed',
        status: 'recorded_no_effect',
        balanceEffectCents: 0,
      }),
      expect.objectContaining({
        providerEventId: 'evt_usd',
        status: 'unresolved',
        reason: 'unsupported_currency_requires_review',
        balanceEffectCents: 0,
      }),
    ]);
  });

  it('shows a negative amount owed as family credit', () => {
    const school = schools.create({ name: 'Knit Academy' });
    const family = families.create(school.id, {
      accountReference: 'fam_credit',
      displayName: 'Credit family',
    });
    invoices.create(school.id, family.id, {
      invoiceReference: 'inv_credit',
      currency: 'ZAR',
      issuedAt: '2026-08-01T00:00:00Z',
      dueAt: '2026-08-31T00:00:00Z',
      lineItems: [{ description: 'Fees', amountCents: 100000 }],
    });
    paymentEvents.ingest(school.id, {
      event_id: 'evt_credit',
      type: 'payment.succeeded',
      family_id: 'fam_credit',
      invoice_id: 'inv_credit',
      amount_cents: 150000,
      currency: 'ZAR',
      occurred_at: '2026-08-01T09:14:22Z',
    });

    expect(balances.getFamilyBalance(school.id, family.id).summary).toMatchObject({
      amountOwedCents: -50000,
      creditCents: 50000,
    });
  });
});
