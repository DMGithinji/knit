import { Injectable } from '@nestjs/common';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { centsToRand } from '@/common/money/zar';
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

interface StatementLineSeed {
  at: string;
  kind: 'invoice' | 'payment' | 'refund';
  description: string;
  amountCents: number;
  sortId: string;
  invoiceReference: string;
  providerEventId?: string;
  source?: {
    originalAmount: number;
    originalCurrency: string;
    manualResolution: {
      decision: string;
      verifiedAmount: number | null;
      resolvedBy: string;
      resolutionReason: string;
      createdAt: string;
    } | null;
  };
}

const STATEMENT_KIND_ORDER: Record<StatementLineSeed['kind'], number> = {
  invoice: 0,
  payment: 1,
  refund: 2,
};

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
    const eventIds = events.map((event) => event.id);
    const resolutions =
      eventIds.length === 0
        ? []
        : this.database.db
            .select()
            .from(paymentEventResolutions)
            .where(
              and(
                eq(paymentEventResolutions.schoolId, schoolId),
                inArray(paymentEventResolutions.paymentEventId, eventIds),
              ),
            )
            .all();

    const studentById = new Map(familyStudents.map((student) => [student.id, student]));
    const eventById = new Map(events.map((event) => [event.id, event]));
    const invoiceById = new Map(familyInvoices.map((invoice) => [invoice.id, invoice]));
    const resolutionByEventId = new Map(
      resolutions.map((resolution) => [resolution.paymentEventId, resolution]),
    );

    const invoiceBreakdown = familyInvoices.map((invoice) => {
      const invoiceLines = lineItems
        .filter((lineItem) => lineItem.invoiceId === invoice.id)
        .map((lineItem) => ({
          id: lineItem.id,
          description: lineItem.description,
          amount: centsToRand(lineItem.amountCents),
          student: lineItem.studentId ? (studentById.get(lineItem.studentId) ?? null) : null,
        }));
      const invoiceEntries = entries.filter((entry) => entry.invoiceId === invoice.id);
      const invoicedCents = lineItems
        .filter((lineItem) => lineItem.invoiceId === invoice.id)
        .reduce((total, lineItem) => total + lineItem.amountCents, 0);
      const paidCents = invoiceEntries
        .filter((entry) => entry.kind === 'payment')
        .reduce((total, entry) => total + entry.amountCents, 0);
      const refundedCents = invoiceEntries
        .filter((entry) => entry.kind === 'refund')
        .reduce((total, entry) => total + entry.amountCents, 0);
      const amountOwedCents = invoicedCents - paidCents + refundedCents;

      return {
        ...invoice,
        invoiced: centsToRand(invoicedCents),
        paid: centsToRand(paidCents),
        refunded: centsToRand(refundedCents),
        amountOwed: centsToRand(amountOwedCents),
        credit: centsToRand(Math.max(-amountOwedCents, 0)),
        lineItems: invoiceLines,
      };
    });

    const statementSeeds: StatementLineSeed[] = [
      ...invoiceBreakdown.map((invoice) => ({
        at: invoice.issuedAt,
        kind: 'invoice' as const,
        description: `Invoice ${invoice.invoiceReference}`,
        amountCents: lineItems
          .filter((lineItem) => lineItem.invoiceId === invoice.id)
          .reduce((total, lineItem) => total + lineItem.amountCents, 0),
        sortId: invoice.id,
        invoiceReference: invoice.invoiceReference,
      })),
      ...entries.map((entry) => {
        const event = eventById.get(entry.paymentEventId);
        const invoice = invoiceById.get(entry.invoiceId);
        const resolution = resolutionByEventId.get(entry.paymentEventId);

        return {
          at: entry.occurredAt,
          kind: entry.kind,
          description: entry.kind === 'payment' ? 'Payment received' : 'Payment refunded',
          amountCents: entry.kind === 'payment' ? -entry.amountCents : entry.amountCents,
          sortId: entry.id,
          invoiceReference: invoice?.invoiceReference ?? entry.invoiceId,
          providerEventId: event?.providerEventId,
          source: event
            ? {
                originalAmount: centsToRand(event.amountCents),
                originalCurrency: event.currency,
                manualResolution: resolution
                  ? {
                      decision: resolution.decision,
                      verifiedAmount:
                        resolution.verifiedAmountCents === null
                          ? null
                          : centsToRand(resolution.verifiedAmountCents),
                      resolvedBy: resolution.resolvedBy,
                      resolutionReason: resolution.resolutionReason,
                      createdAt: resolution.createdAt,
                    }
                  : null,
              }
            : undefined,
        };
      }),
    ].sort(
      (left, right) =>
        left.at.localeCompare(right.at) ||
        STATEMENT_KIND_ORDER[left.kind] - STATEMENT_KIND_ORDER[right.kind] ||
        left.sortId.localeCompare(right.sortId),
    );

    let runningBalanceCents = 0;
    const lines = statementSeeds.map(({ amountCents, sortId, ...line }) => {
      void sortId;
      runningBalanceCents += amountCents;
      return {
        ...line,
        amount: centsToRand(amountCents),
        balanceAfter: centsToRand(runningBalanceCents),
      };
    });
    const totalInvoicedCents = statementSeeds
      .filter((line) => line.kind === 'invoice')
      .reduce((total, line) => total + line.amountCents, 0);
    const totalPaymentsCents = statementSeeds
      .filter((line) => line.kind === 'payment')
      .reduce((total, line) => total - line.amountCents, 0);
    const totalRefundsCents = statementSeeds
      .filter((line) => line.kind === 'refund')
      .reduce((total, line) => total + line.amountCents, 0);

    return {
      familyAccount: family,
      currency: 'ZAR' as const,
      summary: {
        totalInvoiced: centsToRand(totalInvoicedCents),
        totalPayments: centsToRand(totalPaymentsCents),
        totalRefunds: centsToRand(totalRefundsCents),
        amountOwed: centsToRand(runningBalanceCents),
        credit: centsToRand(Math.max(-runningBalanceCents, 0)),
        formula: 'total invoices - successful payments + refunds',
      },
      invoices: invoiceBreakdown,
      lines,
      attentionItems: events
        .filter((event) => event.processingStatus !== 'applied')
        .sort(
          (left, right) =>
            left.occurredAt.localeCompare(right.occurredAt) || left.id.localeCompare(right.id),
        )
        .map((event) => ({
          providerEventId: event.providerEventId,
          type: event.type,
          amount: centsToRand(event.amountCents),
          currency: event.currency,
          occurredAt: event.occurredAt,
          status: event.processingStatus,
          reason: event.processingReason,
        })),
    };
  }
}
