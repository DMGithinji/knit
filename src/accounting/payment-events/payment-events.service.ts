import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { DatabaseService } from '@/database/database.service';
import {
  familyAccounts,
  invoices,
  ledgerEntries,
  paymentEventResolutions,
  paymentEvents,
} from '@/database/schema';
import { SchoolProfileService } from '@/schools/profile/school-profile.service';
import { ManualPaymentEventResolutionDto, PaymentEventDto } from './dto/payment-event.dto';

@Injectable()
export class PaymentEventsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly schools: SchoolProfileService,
  ) {}

  ingest(schoolId: string, payload: PaymentEventDto) {
    this.schools.findById(schoolId);
    const rawPayload = { ...payload } as Record<string, unknown>;

    const eventId = this.database.db.transaction((transaction) => {
      const created = transaction
        .insert(paymentEvents)
        .values({
          schoolId,
          providerEventId: payload.event_id,
          type: payload.type,
          familyReference: payload.family_id,
          invoiceReference: payload.invoice_id,
          amountCents: payload.amount_cents,
          currency: payload.currency,
          occurredAt: payload.occurred_at,
          providerReason: payload.reason,
          rawPayload,
        })
        .onConflictDoNothing()
        .returning()
        .get();

      if (created) {
        return created.id;
      }

      return transaction
        .select({ id: paymentEvents.id })
        .from(paymentEvents)
        .where(
          and(
            eq(paymentEvents.schoolId, schoolId),
            eq(paymentEvents.providerEventId, payload.event_id),
          ),
        )
        .get()!.id;
    });

    this.reconcile(schoolId, eventId);

    return {
      event: this.findById(schoolId, eventId),
    };
  }

  reconcile(schoolId: string, eventId: string) {
    return this.database.db.transaction((transaction) => {
      const event = transaction
        .select()
        .from(paymentEvents)
        .where(and(eq(paymentEvents.schoolId, schoolId), eq(paymentEvents.id, eventId)))
        .get();

      if (!event) {
        throw new NotFoundException(`Payment event ${eventId} was not found`);
      }

      if (['applied', 'recorded_no_effect', 'rejected'].includes(event.processingStatus)) {
        return event;
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

      return this.updateStatus(transaction, event.id, 'applied', null, true);
    });
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
          inArray(paymentEvents.processingStatus, ['received', 'unresolved']),
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
        ['applied', 'recorded_no_effect', 'rejected'].includes(outcome.status),
      ).length,
      stillPendingCount: outcomes.filter((outcome) =>
        ['received', 'unresolved'].includes(outcome.status),
      ).length,
      errorCount: outcomes.filter((outcome) => outcome.status === 'error').length,
      outcomes,
    };
  }

  resolveManually(schoolId: string, eventId: string, input: ManualPaymentEventResolutionDto) {
    return this.database.db.transaction((transaction) => {
      const event = transaction
        .select()
        .from(paymentEvents)
        .where(and(eq(paymentEvents.schoolId, schoolId), eq(paymentEvents.id, eventId)))
        .get();

      if (!event) {
        throw new NotFoundException(`Payment event ${eventId} was not found`);
      }

      if (event.processingStatus !== 'unresolved') {
        throw new ConflictException('Only unresolved payment events can be reviewed manually');
      }

      if (input.decision === 'apply_verified_zar') {
        if (!input.verifiedAmountCents) {
          throw new BadRequestException('A verified ZAR amount is required');
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

        if (!family) {
          throw new BadRequestException('The referenced family must exist before applying payment');
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
          throw new BadRequestException(
            'The referenced invoice must exist before applying payment',
          );
        }

        transaction
          .insert(ledgerEntries)
          .values({
            schoolId,
            familyAccountId: family.id,
            invoiceId: invoice.id,
            paymentEventId: event.id,
            kind: event.type === 'payment.refunded' ? 'refund' : 'payment',
            amountCents: input.verifiedAmountCents,
            currency: 'ZAR',
            occurredAt: event.occurredAt,
          })
          .run();
      }

      transaction
        .insert(paymentEventResolutions)
        .values({
          schoolId,
          paymentEventId: event.id,
          decision: input.decision,
          verifiedAmountCents: input.verifiedAmountCents,
          resolvedBy: input.resolvedBy,
          resolutionReason: input.resolutionReason,
        })
        .run();

      const now = new Date().toISOString();
      return transaction
        .update(paymentEvents)
        .set({
          processingStatus:
            input.decision === 'apply_verified_zar' ? 'applied' : 'recorded_no_effect',
          processingReason:
            input.decision === 'apply_verified_zar'
              ? 'manually_verified_zar_settlement'
              : 'manual_review_no_financial_effect',
          resolvedAt: now,
          updatedAt: now,
        })
        .where(eq(paymentEvents.id, event.id))
        .returning()
        .get();
    });
  }

  findById(schoolId: string, eventId: string) {
    const event = this.database.db
      .select()
      .from(paymentEvents)
      .where(and(eq(paymentEvents.schoolId, schoolId), eq(paymentEvents.id, eventId)))
      .get();

    if (!event) {
      throw new NotFoundException(`Payment event ${eventId} was not found`);
    }

    return event;
  }

  private updateStatus(
    transaction: Parameters<Parameters<DatabaseService['db']['transaction']>[0]>[0],
    eventId: string,
    processingStatus: 'applied' | 'unresolved' | 'rejected',
    processingReason: string | null,
    resolved: boolean,
  ) {
    const now = new Date().toISOString();
    return transaction
      .update(paymentEvents)
      .set({
        processingStatus,
        processingReason,
        resolvedAt: resolved ? now : null,
        updatedAt: now,
      })
      .where(eq(paymentEvents.id, eventId))
      .returning()
      .get();
  }
}
