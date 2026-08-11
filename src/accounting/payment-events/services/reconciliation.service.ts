import { Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq, inArray, ne, or } from 'drizzle-orm';
import { centsToRand } from '@/common/money/zar';
import { DatabaseService, KnitTransaction } from '@/database/database.service';
import {
  familyAccounts,
  invoices,
  ledgerEntries,
  PaymentEventProcessingStatus,
  paymentEvents,
} from '@/database/schema';
import { SchoolProfileService } from '@/schools/profile/school-profile.service';

/** Statuses we consider done. Anything else is still owed an outcome. */
const RESOLVED_STATUSES: readonly PaymentEventProcessingStatus[] = [
  'applied',
  'applied_requires_review',
  'recorded_no_effect',
  'rejected',
];

/** Reasons a sweep can retry. Anything else needs a human, so retrying it just spins. */
const RETRYABLE_REASONS = ['family_not_found'];

/** Two identical payments this far apart are more likely a double charge than a coincidence. */
const SIMILAR_PAYMENT_WINDOW_MS = 60_000;

interface SimilarPaymentReview {
  processingStatus: 'applied' | 'applied_requires_review';
  processingReason: string | null;
  relatedProviderEventId: string | null;
}

const APPLIED_CLEANLY: SimilarPaymentReview = {
  processingStatus: 'applied',
  processingReason: null,
  relatedProviderEventId: null,
};

@Injectable()
export class PaymentReconciliationService {
  constructor(
    private readonly database: DatabaseService,
    private readonly schools: SchoolProfileService,
  ) {}

  /**
   * Decides what one payment event means for the ledger, and records that decision.
   *
   * Safe to call repeatedly: an event that already has an outcome returns it unchanged,
   * so provider retries and sweeps cannot post a second ledger entry.
   */
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

      // An event can arrive before its family exists, so attach it whenever we can —
      // even if the event itself is already resolved and returns below.
      const linkedEvent =
        family && event.familyAccountId !== family.id
          ? transaction
              .update(paymentEvents)
              .set({ familyAccountId: family.id, updatedAt: new Date().toISOString() })
              .where(eq(paymentEvents.id, event.id))
              .returning()
              .get()
          : event;

      if (RESOLVED_STATUSES.includes(event.processingStatus)) {
        return linkedEvent;
      }

      // A failure is a fact worth keeping, but it moves no money.
      if (event.type === 'payment.failed') {
        return this.resolve(
          transaction,
          event.id,
          'recorded_no_effect',
          event.providerReason ?? 'payment_failed',
        );
      }

      // Terminal: a negative or zero payment is bad data, not something to retry.
      if (event.amountCents <= 0) {
        return this.resolve(transaction, event.id, 'rejected', 'invalid_amount');
      }

      // Everything below parks the event as `unresolved` instead of guessing. The sweep
      // retries a missing family; currency needs a person to decide a rate.
      if (event.currency !== 'ZAR') {
        return this.resolve(
          transaction,
          event.id,
          'unresolved',
          'unsupported_currency_requires_review',
        );
      }

      if (!family) {
        return this.resolve(transaction, event.id, 'unresolved', 'family_not_found');
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

      // The ledger entry is the money. A unique index on paymentEventId means this throws
      // rather than double-counts if two callers ever race past the guard above.
      transaction
        .insert(ledgerEntries)
        .values({
          schoolId,
          familyAccountId: family.id,
          invoiceId: invoice?.id,
          paymentEventId: event.id,
          kind: event.type === 'payment.refunded' ? 'refund' : 'payment',
          amountCents: event.amountCents,
          currency: 'ZAR',
          occurredAt: event.occurredAt,
        })
        .run();

      const review = this.reviewAgainstSimilarPayment(transaction, event, family.id);
      const invoiceNeedsReview = !invoice;

      return this.resolve(
        transaction,
        event.id,
        invoiceNeedsReview ? 'applied_requires_review' : review.processingStatus,
        invoiceNeedsReview ? 'invoice_not_found' : review.processingReason,
        review.relatedProviderEventId,
      );
    });

    const { amountCents, ...details } = reconciled;

    return {
      ...details,
      amount: centsToRand(amountCents),
    };
  }

  /**
   * Re-drives events left waiting by an outage or a late-arriving family or invoice.
   *
   * Manual for now: there is no scheduler here, so a person triggers the sweep.
   */
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
              inArray(paymentEvents.processingReason, RETRYABLE_REASONS),
            ),
          ),
        ),
      )
      // Oldest first, so a family's events replay in the order they happened.
      .orderBy(asc(paymentEvents.occurredAt), asc(paymentEvents.id))
      .all();

    // One bad event must not abort the sweep, so each is reported rather than thrown.
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
      recoveredCount: outcomes.filter(
        (outcome) => outcome.status !== 'error' && RESOLVED_STATUSES.includes(outcome.status),
      ).length,
      stillPendingCount: outcomes.filter(
        (outcome) => outcome.status !== 'error' && !RESOLVED_STATUSES.includes(outcome.status),
      ).length,
      errorCount: outcomes.filter((outcome) => outcome.status === 'error').length,
      outcomes,
    };
  }

  /** Writes the outcome. `unresolved` is the only status that leaves the event open. */
  private resolve(
    transaction: KnitTransaction,
    eventId: string,
    processingStatus: Exclude<PaymentEventProcessingStatus, 'received'>,
    processingReason: string | null,
    relatedProviderEventId: string | null = null,
  ) {
    const now = new Date().toISOString();

    return transaction
      .update(paymentEvents)
      .set({
        processingStatus,
        processingReason,
        relatedProviderEventId,
        resolvedAt: processingStatus === 'unresolved' ? null : now,
        updatedAt: now,
      })
      .where(eq(paymentEvents.id, eventId))
      .returning()
      .get();
  }

  /**
   * Flags a probable double charge without refusing the money.
   *
   * Two succeeded payments matching on family, invoice, amount and currency within a
   * minute are almost certainly one payment sent twice — but we cannot know, so both
   * post and the later one is marked for a bursar. Whichever payment *happened* later is
   * flagged, not whichever arrived later, so a replay in any order flags the same event.
   */
  private reviewAgainstSimilarPayment(
    transaction: KnitTransaction,
    event: typeof paymentEvents.$inferSelect,
    familyAccountId: string,
  ): SimilarPaymentReview {
    if (event.type !== 'payment.succeeded') {
      return APPLIED_CLEANLY;
    }

    const similarPayment = this.findSimilarPayment(transaction, event, familyAccountId);

    if (!similarPayment) {
      return APPLIED_CLEANLY;
    }

    const [earlier, later] = [event, similarPayment].sort(
      (left, right) =>
        Date.parse(left.occurredAt) - Date.parse(right.occurredAt) ||
        left.providerEventId.localeCompare(right.providerEventId),
    );

    if (later.id === event.id) {
      return {
        processingStatus: 'applied_requires_review',
        processingReason: 'similar_payment',
        relatedProviderEventId: earlier.providerEventId,
      };
    }

    // This event happened first but arrived second, so flag the one already stored.
    transaction
      .update(paymentEvents)
      .set({
        processingStatus: 'applied_requires_review',
        processingReason: 'similar_payment',
        relatedProviderEventId: earlier.providerEventId,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(paymentEvents.id, later.id))
      .run();

    return APPLIED_CLEANLY;
  }

  /** The nearest already-applied payment that looks like a duplicate of this one. */
  private findSimilarPayment(
    transaction: KnitTransaction,
    event: typeof paymentEvents.$inferSelect,
    familyAccountId: string,
  ) {
    // Timestamps are stored as ISO text with varying formats, so the window below is
    // compared in milliseconds rather than as a SQL string range.
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
          ne(paymentEvents.id, event.id),
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
