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

type StatementKind = 'invoice' | 'payment' | 'refund';

export interface StatementSource {
  originalAmount: number;
  originalCurrency: string;
  manualResolution: {
    decision: string;
    verifiedAmount: number | null;
    resolvedBy: string;
    resolutionReason: string;
    createdAt: string;
  } | null;
}

/** A statement line before pricing in Rand. `balanceChangeCents` is signed. */
interface StatementSeed {
  at: string;
  kind: StatementKind;
  sortId: string;
  balanceChangeCents: number;
  description: string;
  invoiceReference: string | null;
  providerEventId?: string;
  source?: StatementSource;
}

const STATEMENT_KIND_ORDER: Record<StatementKind, number> = {
  invoice: 0,
  payment: 1,
  refund: 2,
};

function groupBy<Item>(items: Item[], key: (item: Item) => string): Map<string, Item[]> {
  const grouped = new Map<string, Item[]>();

  for (const item of items) {
    const group = grouped.get(key(item));

    if (group) {
      group.push(item);
    } else {
      grouped.set(key(item), [item]);
    }
  }

  return grouped;
}

function sumCents<Item>(items: Item[], amountCents: (item: Item) => number): number {
  return items.reduce((total, item) => total + amountCents(item), 0);
}

/**
 * Orders by when things happened, not when we heard about them — webhooks arrive late
 * and out of order. Kind then id break ties, so any delivery order renders the same page.
 */
function inStatementOrder(left: StatementSeed, right: StatementSeed): number {
  return (
    left.at.localeCompare(right.at) ||
    STATEMENT_KIND_ORDER[left.kind] - STATEMENT_KIND_ORDER[right.kind] ||
    left.sortId.localeCompare(right.sortId)
  );
}

@Injectable()
export class BalancesService {
  constructor(
    private readonly database: DatabaseService,
    private readonly families: FamilyAccountsService,
  ) {}

  /**
   * Calculates a family's current balance from its invoices and payment ledger.
   *
   * Explains the total through a chronological statement, per-invoice breakdowns,
   * any credit, and events needing attention. Computed on read, never stored.
   */
  getFamilyBalance(schoolId: string, familyAccountId: string) {
    const family = this.families.findById(schoolId, familyAccountId);
    const { familyStudents, familyInvoices, lineItems, entries, events, resolutions } =
      this.loadFamilyRecords(schoolId, family.id);

    // Indexed once, so the work below is lookups rather than repeated scans.
    const studentById = new Map(familyStudents.map((student) => [student.id, student]));
    const eventById = new Map(events.map((event) => [event.id, event]));
    const invoiceById = new Map(familyInvoices.map((invoice) => [invoice.id, invoice]));
    const resolutionByEventId = new Map(
      resolutions.map((resolution) => [resolution.paymentEventId, resolution]),
    );
    const lineItemsByInvoiceId = groupBy(lineItems, (lineItem) => lineItem.invoiceId);
    const entriesByInvoiceId = groupBy(entries, (entry) => entry.invoiceId ?? 'family-level');

    // The breakdown and the statement must agree, so this is computed in one place only.
    const invoicedCentsByInvoiceId = new Map(
      familyInvoices.map((invoice) => [
        invoice.id,
        sumCents(lineItemsByInvoiceId.get(invoice.id) ?? [], (lineItem) => lineItem.amountCents),
      ]),
    );

    // Answers "which invoice is the money against?".
    const invoiceBreakdown = familyInvoices.map((invoice) => {
      const invoiceEntries = entriesByInvoiceId.get(invoice.id) ?? [];
      const invoicedCents = invoicedCentsByInvoiceId.get(invoice.id) ?? 0;
      const paidCents = sumCents(
        invoiceEntries.filter((entry) => entry.kind === 'payment'),
        (entry) => entry.amountCents,
      );
      const refundedCents = sumCents(
        invoiceEntries.filter((entry) => entry.kind === 'refund'),
        (entry) => entry.amountCents,
      );
      // A refund returns money to the parent, so it re-opens what is owed.
      const amountOwedCents = invoicedCents - paidCents + refundedCents;

      return {
        ...invoice,
        invoiced: centsToRand(invoicedCents),
        paid: centsToRand(paidCents),
        refunded: centsToRand(refundedCents),
        amountOwed: centsToRand(amountOwedCents),
        // Overpayment, shown positive so nobody has to read a minus sign.
        credit: centsToRand(Math.max(-amountOwedCents, 0)),
        lineItems: (lineItemsByInvoiceId.get(invoice.id) ?? []).map((lineItem) => ({
          id: lineItem.id,
          description: lineItem.description,
          amount: centsToRand(lineItem.amountCents),
          student: lineItem.studentId ? (studentById.get(lineItem.studentId) ?? null) : null,
        })),
      };
    });

    // The "how" behind the number: everything that moved the balance, in the order it
    // happened. Amounts are signed, so the running total below is a plain sum.
    const statement: StatementSeed[] = [
      ...familyInvoices.map((invoice) => ({
        at: invoice.issuedAt,
        kind: 'invoice' as const,
        sortId: invoice.id,
        balanceChangeCents: invoicedCentsByInvoiceId.get(invoice.id) ?? 0,
        description: `Invoice ${invoice.invoiceReference}`,
        invoiceReference: invoice.invoiceReference,
      })),
      ...entries.map((entry) => {
        const event = eventById.get(entry.paymentEventId);

        return {
          at: entry.occurredAt,
          kind: entry.kind,
          sortId: entry.id,
          // A payment reduces what is owed; a refund adds it back.
          balanceChangeCents: entry.kind === 'payment' ? -entry.amountCents : entry.amountCents,
          description: entry.kind === 'payment' ? 'Payment received' : 'Payment refunded',
          invoiceReference: entry.invoiceId
            ? (invoiceById.get(entry.invoiceId)?.invoiceReference ?? entry.invoiceId)
            : null,
          providerEventId: event?.providerEventId,
          source: event && this.describeSource(event, resolutionByEventId.get(event.id)),
        };
      }),
    ].sort(inStatementOrder);

    // `balanceAfter` is the column a bursar reads down the page, so it accumulates in
    // display order.
    let runningBalanceCents = 0;
    const lines = statement.map((seed) => {
      runningBalanceCents += seed.balanceChangeCents;

      return {
        at: seed.at,
        kind: seed.kind,
        description: seed.description,
        invoiceReference: seed.invoiceReference,
        providerEventId: seed.providerEventId,
        source: seed.source,
        amount: centsToRand(seed.balanceChangeCents),
        balanceAfter: centsToRand(runningBalanceCents),
      };
    });

    // Summed from the rows, not the statement, so a bug in building or sorting the
    // statement cannot quietly move the headline number.
    const totalInvoicedCents = sumCents(lineItems, (lineItem) => lineItem.amountCents);
    const totalPaymentsCents = sumCents(
      entries.filter((entry) => entry.kind === 'payment'),
      (entry) => entry.amountCents,
    );
    const totalRefundsCents = sumCents(
      entries.filter((entry) => entry.kind === 'refund'),
      (entry) => entry.amountCents,
    );
    const amountOwedCents = totalInvoicedCents - totalPaymentsCents + totalRefundsCents;

    return {
      familyAccount: family,
      currency: 'ZAR' as const,
      summary: {
        totalInvoiced: centsToRand(totalInvoicedCents),
        totalPayments: centsToRand(totalPaymentsCents),
        totalRefunds: centsToRand(totalRefundsCents),
        amountOwed: centsToRand(amountOwedCents),
        credit: centsToRand(Math.max(-amountOwedCents, 0)),
      },
      invoices: invoiceBreakdown,
      lines,
      // Events that moved nothing still get reported — staying silent about a failed or
      // suspicious payment is how a parent finds the error before we do.
      attentionItems: this.describeAttentionItems(events),
    };
  }

  private loadFamilyRecords(schoolId: string, familyAccountId: string) {
    const { db } = this.database;
    const events = db
      .select()
      .from(paymentEvents)
      .where(
        and(
          eq(paymentEvents.schoolId, schoolId),
          eq(paymentEvents.familyAccountId, familyAccountId),
        ),
      )
      .all();
    const eventIds = events.map((event) => event.id);

    return {
      events,
      familyStudents: db
        .select()
        .from(students)
        .where(eq(students.familyAccountId, familyAccountId))
        .all(),
      familyInvoices: db
        .select()
        .from(invoices)
        .where(eq(invoices.familyAccountId, familyAccountId))
        .orderBy(asc(invoices.issuedAt), asc(invoices.id))
        .all(),
      lineItems: db
        .select()
        .from(invoiceLineItems)
        .where(eq(invoiceLineItems.familyAccountId, familyAccountId))
        .all(),
      entries: db
        .select()
        .from(ledgerEntries)
        .where(eq(ledgerEntries.familyAccountId, familyAccountId))
        .all(),
      resolutions:
        eventIds.length === 0
          ? []
          : db
              .select()
              .from(paymentEventResolutions)
              .where(
                and(
                  eq(paymentEventResolutions.schoolId, schoolId),
                  inArray(paymentEventResolutions.paymentEventId, eventIds),
                ),
              )
              .all(),
    };
  }

  /** Keeps the provider's original facts visible next to any manual correction. */
  private describeSource(
    event: typeof paymentEvents.$inferSelect,
    resolution: typeof paymentEventResolutions.$inferSelect | undefined,
  ): StatementSource {
    return {
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
    };
  }

  /** Events that did not land as a clean payment, so a bursar can see why. */
  private describeAttentionItems(events: (typeof paymentEvents.$inferSelect)[]) {
    return events
      .filter((event) => event.processingStatus !== 'applied')
      .map((event) => ({
        providerEventId: event.providerEventId,
        type: event.type,
        amount: centsToRand(event.amountCents),
        currency: event.currency,
        occurredAt: event.occurredAt,
        status: event.processingStatus,
        reason: event.processingReason,
        ...(event.relatedProviderEventId
          ? {
              relatedProviderEventId: event.relatedProviderEventId,
              note: `Similar to ${event.relatedProviderEventId}; confirm whether both payments are genuine`,
            }
          : {}),
      }))
      .sort(
        (left, right) =>
          left.occurredAt.localeCompare(right.occurredAt) ||
          left.providerEventId.localeCompare(right.providerEventId),
      );
  }
}
