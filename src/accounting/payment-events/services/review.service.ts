import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { centsToRand, randToCents } from '@/common/money/zar';
import { DatabaseService } from '@/database/database.service';
import {
  familyAccounts,
  invoices,
  ledgerEntries,
  paymentEventResolutions,
  paymentEvents,
} from '@/database/schema';
import { ManualPaymentEventResolutionDto } from '../dto/payment-event.dto';

@Injectable()
export class PaymentReviewService {
  constructor(private readonly database: DatabaseService) {}

  recordDecision(schoolId: string, eventId: string, input: ManualPaymentEventResolutionDto) {
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

      if (family && event.familyAccountId !== family.id) {
        transaction
          .update(paymentEvents)
          .set({ familyAccountId: family.id, updatedAt: new Date().toISOString() })
          .where(eq(paymentEvents.id, event.id))
          .run();
      }

      const verifiedAmountCents =
        input.verifiedAmount === undefined ? undefined : randToCents(input.verifiedAmount);

      if (input.decision === 'apply_verified_zar') {
        if (verifiedAmountCents === undefined) {
          throw new BadRequestException('A verified ZAR amount is required');
        }

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

        transaction
          .insert(ledgerEntries)
          .values({
            schoolId,
            familyAccountId: family.id,
            invoiceId: invoice?.id,
            paymentEventId: event.id,
            kind: event.type === 'payment.refunded' ? 'refund' : 'payment',
            amountCents: verifiedAmountCents,
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
          verifiedAmountCents,
          resolvedBy: input.resolvedBy,
          resolutionReason: input.resolutionReason,
        })
        .run();

      const now = new Date().toISOString();
      const resolved = transaction
        .update(paymentEvents)
        .set({
          familyAccountId: family?.id,
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

      const { amountCents, ...details } = resolved;

      return {
        ...details,
        amount: centsToRand(amountCents),
      };
    });
  }
}
