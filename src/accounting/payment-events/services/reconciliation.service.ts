import { Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq, inArray, or } from 'drizzle-orm';
import { centsToRand } from '@/common/money/zar';
import { DatabaseService } from '@/database/database.service';
import { familyAccounts, invoices, ledgerEntries, paymentEvents } from '@/database/schema';
import { SchoolProfileService } from '@/schools/profile/school-profile.service';

const SIMILAR_PAYMENT_WINDOW_MS = 60_000;

@Injectable()
export class PaymentReconciliationService {
  constructor(
    private readonly database: DatabaseService,
    private readonly schools: SchoolProfileService,
  ) {}

  reconcile(schoolId: string, eventId: string) {
    const reconciled = this.database.db.transaction((transaction) => {
      const event = transaction
        .select()
        .from(paymentEvents)
        .where(and(eq(paymentEvents.schoolId, schoolId), eq(paymentEvents.id, eventId)))
        .get();

      if (!event) {
        throw new NotFoundException(`Payment event ${eventId} was not found`);
      }

      const family = transaction
        .select()
        .from(familyAccounts)
        .where(
          and(
            eq(familyAccounts.schoolId, schoolId),
            eq(familyAccounts.accountReference, event.familyReference),
          ),
        )
        .get();

      const linkedEvent =
        family && event.familyAccountId !== family.id
          ? transaction
              .update(paymentEvents)
              .set({ familyAccountId: family.id, updatedAt: new Date().toISOString() })
              .where(eq(paymentEvents.id, event.id))
              .returning()
              .get()
          : event;

      if (
        ['applied', 'applied_requires_review', 'recorded_no_effect', 'rejected'].includes(
          event.processingStatus,
        )
      ) {
        return linkedEvent;
      }

      if (event.type === 'payment.failed') {
        return transaction
          .update(paymentEvents)
          .set({
            processingStatus: 'recorded_no_effect',
            processingReason: event.providerReason ?? 'payment_failed',
            resolvedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          })
          .where(eq(paymentEvents.id, event.id))
          .returning()
          .get();
      }

      if (event.amountCents <= 0) {
        return this.updateStatus(transaction, event.id, 'rejected', 'invalid_amount', true);
      }

      if (event.currency !== 'ZAR') {
        return this.updateStatus(
          transaction,
          event.id,
          'unresolved',
          'unsupported_currency_requires_review',
          false,
        );
      }

      if (!family) {
        return this.updateStatus(transaction, event.id, 'unresolved', 'family_not_found', false);
      }

      const invoice = transaction
        .select()
        .from(invoices)
        .where(
          and(
            eq(invoices.familyAccountId, family.id),
            eq(invoices.invoiceReference, event.invoiceReference),
          ),
        )
        .get();

      if (!invoice) {
        return this.updateStatus(transaction, event.id, 'unresolved', 'invoice_not_found', false);
      }

      transaction
        .insert(ledgerEntries)
        .values({
          schoolId,
          familyAccountId: family.id,
          invoiceId: invoice.id,
          paymentEventId: event.id,
          kind: event.type === 'payment.refunded' ? 'refund' : 'payment',
          amountCents: event.amountCents,
          currency: 'ZAR',
          occurredAt: event.occurredAt,
        })
        .run();

      let processingStatus: 'applied' | 'applied_requires_review' = 'applied';
      let processingReason: string | null = null;
      let relatedProviderEventId: string | null = null;

      if (event.type === 'payment.succeeded') {
        const similarPayment = this.findSimilarPayment(transaction, event, family.id);

        if (similarPayment) {
          const [relatedPayment, paymentToReview] = [event, similarPayment].sort(
            (left, right) =>
              Date.parse(left.occurredAt) - Date.parse(right.occurredAt) ||
              left.providerEventId.localeCompare(right.providerEventId),
          );

          if (paymentToReview.id === event.id) {
            processingStatus = 'applied_requires_review';
            processingReason = 'similar_payment';
            relatedProviderEventId = relatedPayment.providerEventId;
          } else {
            transaction
              .update(paymentEvents)
              .set({
                processingStatus: 'applied_requires_review',
                processingReason: 'similar_payment',
                relatedProviderEventId: relatedPayment.providerEventId,
                updatedAt: new Date().toISOString(),
              })
              .where(eq(paymentEvents.id, paymentToReview.id))
              .run();
          }
        }
      }

      return this.updateStatus(
        transaction,
        event.id,
        processingStatus,
        processingReason,
        true,
        relatedProviderEventId,
      );
    });

    const { amountCents, ...details } = reconciled;

    return {
      ...details,
      amount: centsToRand(amountCents),
    };
  }

  reconcilePending(schoolId: string) {
    this.schools.findById(schoolId);

    const pending = this.database.db
      .select({
        id: paymentEvents.id,
        providerEventId: paymentEvents.providerEventId,
      })
      .from(paymentEvents)
      .where(
        and(
          eq(paymentEvents.schoolId, schoolId),
          or(
            eq(paymentEvents.processingStatus, 'received'),
            and(
              eq(paymentEvents.processingStatus, 'unresolved'),
              inArray(paymentEvents.processingReason, ['family_not_found', 'invoice_not_found']),
            ),
          ),
        ),
      )
      .orderBy(asc(paymentEvents.occurredAt), asc(paymentEvents.id))
      .all();

    const outcomes = pending.map((pendingEvent) => {
      try {
        const event = this.reconcile(schoolId, pendingEvent.id);
        return {
          eventId: event.id,
          providerEventId: event.providerEventId,
          status: event.processingStatus,
          reason: event.processingReason,
        };
      } catch (error: unknown) {
        return {
          eventId: pendingEvent.id,
          providerEventId: pendingEvent.providerEventId,
          status: 'error' as const,
          reason: error instanceof Error ? error.message : 'unknown_reconciliation_error',
        };
      }
    });

    return {
      attemptedCount: pending.length,
      recoveredCount: outcomes.filter((outcome) =>
        ['applied', 'applied_requires_review', 'recorded_no_effect', 'rejected'].includes(
          outcome.status,
        ),
      ).length,
      stillPendingCount: outcomes.filter((outcome) =>
        ['received', 'unresolved'].includes(outcome.status),
      ).length,
      errorCount: outcomes.filter((outcome) => outcome.status === 'error').length,
      outcomes,
    };
  }

  private updateStatus(
    transaction: Parameters<Parameters<DatabaseService['db']['transaction']>[0]>[0],
    eventId: string,
    processingStatus: 'applied' | 'applied_requires_review' | 'unresolved' | 'rejected',
    processingReason: string | null,
    resolved: boolean,
    relatedProviderEventId: string | null = null,
  ) {
    const now = new Date().toISOString();

    return transaction
      .update(paymentEvents)
      .set({
        processingStatus,
        processingReason,
        relatedProviderEventId,
        resolvedAt: resolved ? now : null,
        updatedAt: now,
      })
      .where(eq(paymentEvents.id, eventId))
      .returning()
      .get();
  }

  private findSimilarPayment(
    transaction: Parameters<Parameters<DatabaseService['db']['transaction']>[0]>[0],
    event: typeof paymentEvents.$inferSelect,
    familyAccountId: string,
  ) {
    const eventTime = Date.parse(event.occurredAt);

    return transaction
      .select({
        id: paymentEvents.id,
        providerEventId: paymentEvents.providerEventId,
        occurredAt: paymentEvents.occurredAt,
      })
      .from(paymentEvents)
      .where(
        and(
          eq(paymentEvents.schoolId, event.schoolId),
          eq(paymentEvents.familyAccountId, familyAccountId),
          eq(paymentEvents.invoiceReference, event.invoiceReference),
          eq(paymentEvents.type, 'payment.succeeded'),
          eq(paymentEvents.amountCents, event.amountCents),
          eq(paymentEvents.currency, event.currency),
          inArray(paymentEvents.processingStatus, ['applied', 'applied_requires_review']),
        ),
      )
      .all()
      .map((candidate) => ({
        ...candidate,
        timeDifference: Math.abs(Date.parse(candidate.occurredAt) - eventTime),
      }))
      .filter((candidate) => candidate.timeDifference <= SIMILAR_PAYMENT_WINDOW_MS)
      .sort(
        (left, right) =>
          left.timeDifference - right.timeDifference ||
          left.occurredAt.localeCompare(right.occurredAt) ||
          left.id.localeCompare(right.id),
      )[0];
  }
}
