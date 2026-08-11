import { BalancesService } from '@/accounting/balances/balances.service';
import { FamilyAccountsService } from '@/accounting/family-accounts/family-accounts.service';
import { InvoicesService } from '@/accounting/invoices/invoices.service';
import {
  PaymentCaptureService,
  PaymentQueryService,
  PaymentReconciliationService,
} from '@/accounting/payment-events/services';
import { SchoolProfileService } from '@/schools/profile/school-profile.service';
import { createTestDatabase, TestDatabase } from '@test/helpers/test-database';

describe('BalancesService', () => {
  let testDatabase: TestDatabase;
  let schools: SchoolProfileService;
  let families: FamilyAccountsService;
  let invoices: InvoicesService;
  let paymentCapture: PaymentCaptureService;
  let balances: BalancesService;

  beforeEach(() => {
    testDatabase = createTestDatabase();
    schools = new SchoolProfileService(testDatabase.database);
    families = new FamilyAccountsService(testDatabase.database, schools);
    invoices = new InvoicesService(testDatabase.database, families);
    const paymentEventQueries = new PaymentQueryService(testDatabase.database, schools);
    const paymentEventReconciliation = new PaymentReconciliationService(
      testDatabase.database,
      schools,
    );
    paymentCapture = new PaymentCaptureService(
      testDatabase.database,
      schools,
      paymentEventQueries,
      paymentEventReconciliation,
    );
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
        { studentId: student.id, description: 'Tuition', amount: 4000 },
        { description: 'Family administration fee', amount: 500 },
      ],
    });

    paymentCapture.capture(school.id, {
      event_id: 'evt_payment',
      type: 'payment.succeeded',
      family_id: 'fam_100',
      invoice_id: 'inv_100',
      amount_cents: 450000,
      currency: 'ZAR',
      occurred_at: '2026-08-01T09:14:22Z',
    });
    paymentCapture.capture(school.id, {
      event_id: 'evt_refund',
      type: 'payment.refunded',
      family_id: 'fam_100',
      invoice_id: 'inv_100',
      amount_cents: 100000,
      currency: 'ZAR',
      occurred_at: '2026-08-01T14:02:55Z',
    });
    paymentCapture.capture(school.id, {
      event_id: 'evt_failed',
      type: 'payment.failed',
      family_id: 'fam_100',
      invoice_id: 'inv_100',
      amount_cents: 450000,
      currency: 'ZAR',
      occurred_at: '2026-08-01T15:02:55Z',
      reason: 'insufficient_funds',
    });
    paymentCapture.capture(school.id, {
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
      totalInvoiced: 4500,
      totalPayments: 4500,
      totalRefunds: 1000,
      amountOwed: 1000,
      credit: 0,
      formula: 'total invoices - successful payments + refunds',
    });
    expect(balance.invoices[0]).toMatchObject({
      invoiceReference: 'inv_100',
      invoiced: 4500,
      paid: 4500,
      refunded: 1000,
      amountOwed: 1000,
      credit: 0,
    });
    expect(balance.invoices[0]?.lineItems[0]?.student).toMatchObject({
      id: student.id,
      name: 'Anele Ndlovu',
    });
    expect(balance.lines).toEqual([
      expect.objectContaining({
        at: '2026-08-01T00:00:00Z',
        kind: 'invoice',
        amount: 4500,
        balanceAfter: 4500,
        invoiceReference: 'inv_100',
      }),
      expect.objectContaining({
        at: '2026-08-01T09:14:22Z',
        kind: 'payment',
        amount: -4500,
        balanceAfter: 0,
        invoiceReference: 'inv_100',
        providerEventId: 'evt_payment',
      }),
      expect.objectContaining({
        at: '2026-08-01T14:02:55Z',
        kind: 'refund',
        amount: 1000,
        balanceAfter: 1000,
        invoiceReference: 'inv_100',
        providerEventId: 'evt_refund',
      }),
    ]);
    expect(balance).not.toHaveProperty('financialEntries');
    expect(balance.invoices[0]).not.toHaveProperty('financialEntries');
    expect(balance.attentionItems).toEqual([
      expect.objectContaining({
        providerEventId: 'evt_failed',
        status: 'recorded_no_effect',
        amount: 4500,
      }),
      expect.objectContaining({
        providerEventId: 'evt_usd',
        status: 'unresolved',
        reason: 'unsupported_currency_requires_review',
        amount: 500,
      }),
    ]);
    expect(balance.attentionItems[0]).not.toHaveProperty('balanceEffectCents');
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
      lineItems: [{ description: 'Fees', amount: 1000 }],
    });
    paymentCapture.capture(school.id, {
      event_id: 'evt_credit',
      type: 'payment.succeeded',
      family_id: 'fam_credit',
      invoice_id: 'inv_credit',
      amount_cents: 150000,
      currency: 'ZAR',
      occurred_at: '2026-08-01T09:14:22Z',
    });

    expect(balances.getFamilyBalance(school.id, family.id).summary).toMatchObject({
      amountOwed: -500,
      credit: 500,
    });
    expect(balances.getFamilyBalance(school.id, family.id).lines.at(-1)).toMatchObject({
      amount: -1500,
      balanceAfter: -500,
    });
  });
});
