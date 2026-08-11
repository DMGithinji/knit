import { Injectable } from '@nestjs/common';
import { and, asc, eq } from 'drizzle-orm';
import { DatabaseService } from '@/database/database.service';
import {
  invoiceLineItems,
  invoices,
  ledgerEntries,
  paymentEventResolutions,
  paymentEvents,
  students,
} from '@/database/schema';
import { FamilyAccountsService } from '../family-accounts/family-accounts.service';

@Injectable()
export class BalancesService {
  constructor(
    private readonly database: DatabaseService,
    private readonly families: FamilyAccountsService,
  ) {}

  getFamilyBalance(schoolId: string, familyAccountId: string) {
    const family = this.families.findById(schoolId, familyAccountId);
    const familyStudents = this.database.db
      .select()
      .from(students)
      .where(eq(students.familyAccountId, family.id))
      .all();
    const familyInvoices = this.database.db
      .select()
      .from(invoices)
      .where(eq(invoices.familyAccountId, family.id))
      .orderBy(asc(invoices.issuedAt), asc(invoices.id))
      .all();
    const lineItems = this.database.db
      .select()
      .from(invoiceLineItems)
      .where(eq(invoiceLineItems.familyAccountId, family.id))
      .all();
    const entries = this.database.db
      .select()
      .from(ledgerEntries)
      .where(eq(ledgerEntries.familyAccountId, family.id))
      .orderBy(asc(ledgerEntries.occurredAt), asc(ledgerEntries.id))
      .all();
    const events = this.database.db
      .select()
      .from(paymentEvents)
      .where(
        and(
          eq(paymentEvents.schoolId, schoolId),
          eq(paymentEvents.familyReference, family.accountReference),
        ),
      )
      .all();
    const resolutions = this.database.db
      .select()
      .from(paymentEventResolutions)
      .where(eq(paymentEventResolutions.schoolId, schoolId))
      .all();

    const studentById = new Map(familyStudents.map((student) => [student.id, student]));
    const eventById = new Map(events.map((event) => [event.id, event]));
    const resolutionByEventId = new Map(
      resolutions.map((resolution) => [resolution.paymentEventId, resolution]),
    );

    const financialEntries = entries.map((entry) => {
      const sourceEvent = eventById.get(entry.paymentEventId);
      return {
        id: entry.id,
        kind: entry.kind,
        amountCents: entry.amountCents,
        effectOnAmountOwedCents: entry.kind === 'payment' ? -entry.amountCents : entry.amountCents,
        currency: entry.currency,
        invoiceId: entry.invoiceId,
        occurredAt: entry.occurredAt,
        source: sourceEvent
          ? {
              providerEventId: sourceEvent.providerEventId,
              providerType: sourceEvent.type,
              originalAmountCents: sourceEvent.amountCents,
              originalCurrency: sourceEvent.currency,
              manualResolution: resolutionByEventId.get(sourceEvent.id) ?? null,
            }
          : null,
      };
    });

    const invoiceBreakdown = familyInvoices.map((invoice) => {
      const invoiceLines = lineItems
        .filter((lineItem) => lineItem.invoiceId === invoice.id)
        .map((lineItem) => ({
          id: lineItem.id,
          description: lineItem.description,
          amountCents: lineItem.amountCents,
          student: lineItem.studentId ? (studentById.get(lineItem.studentId) ?? null) : null,
        }));
      const invoiceEntries = financialEntries.filter((entry) => entry.invoiceId === invoice.id);
      const invoicedCents = invoiceLines.reduce(
        (total, lineItem) => total + lineItem.amountCents,
        0,
      );
      const paidCents = invoiceEntries
        .filter((entry) => entry.kind === 'payment')
        .reduce((total, entry) => total + entry.amountCents, 0);
      const refundedCents = invoiceEntries
        .filter((entry) => entry.kind === 'refund')
        .reduce((total, entry) => total + entry.amountCents, 0);
      const amountOwedCents = invoicedCents - paidCents + refundedCents;

      return {
        ...invoice,
        invoicedCents,
        paidCents,
        refundedCents,
        amountOwedCents,
        creditCents: Math.max(-amountOwedCents, 0),
        lineItems: invoiceLines,
        financialEntries: invoiceEntries,
      };
    });

    const totalInvoicedCents = invoiceBreakdown.reduce(
      (total, invoice) => total + invoice.invoicedCents,
      0,
    );
    const totalPaymentsCents = financialEntries
      .filter((entry) => entry.kind === 'payment')
      .reduce((total, entry) => total + entry.amountCents, 0);
    const totalRefundsCents = financialEntries
      .filter((entry) => entry.kind === 'refund')
      .reduce((total, entry) => total + entry.amountCents, 0);
    const amountOwedCents = totalInvoicedCents - totalPaymentsCents + totalRefundsCents;

    return {
      familyAccount: family,
      currency: 'ZAR' as const,
      summary: {
        totalInvoicedCents,
        totalPaymentsCents,
        totalRefundsCents,
        amountOwedCents,
        creditCents: Math.max(-amountOwedCents, 0),
        formula: 'total invoices - successful payments + refunds',
      },
      invoices: invoiceBreakdown,
      financialEntries,
      attentionItems: events
        .filter((event) => event.processingStatus !== 'applied')
        .sort((left, right) => left.occurredAt.localeCompare(right.occurredAt))
        .map((event) => ({
          providerEventId: event.providerEventId,
          type: event.type,
          amountCents: event.amountCents,
          currency: event.currency,
          occurredAt: event.occurredAt,
          status: event.processingStatus,
          reason: event.processingReason,
          balanceEffectCents: 0,
        })),
    };
  }
}
