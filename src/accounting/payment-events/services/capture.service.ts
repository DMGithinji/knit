import { Injectable, Logger } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { DatabaseService } from '@/database/database.service';
import { paymentEvents } from '@/database/schema';
import { SchoolProfileService } from '@/schools/profile/school-profile.service';
import { PaymentEventDto } from '../dto/payment-event.dto';
import { PaymentQueryService } from './query.service';
import { PaymentReconciliationService } from './reconciliation.service';

const MATERIAL_FIELDS = [
  'type',
  'family_id',
  'invoice_id',
  'amount_cents',
  'currency',
  'occurred_at',
] as const;

type MaterialField = (typeof MATERIAL_FIELDS)[number];

function materialDifferences(
  stored: typeof paymentEvents.$inferSelect,
  incoming: PaymentEventDto,
): MaterialField[] {
  const storedFacts = {
    type: stored.type,
    family_id: stored.familyReference,
    invoice_id: stored.invoiceReference,
    amount_cents: stored.amountCents,
    currency: stored.currency,
    occurred_at: stored.occurredAt,
  };

  return MATERIAL_FIELDS.filter((field) => {
    if (field === 'occurred_at') {
      return Date.parse(storedFacts.occurred_at) !== Date.parse(incoming.occurred_at);
    }

    return storedFacts[field] !== incoming[field];
  });
}

@Injectable()
export class PaymentCaptureService {
  private readonly logger = new Logger(PaymentCaptureService.name);

  constructor(
    private readonly database: DatabaseService,
    private readonly schools: SchoolProfileService,
    private readonly paymentQueries: PaymentQueryService,
    private readonly paymentReconciliation: PaymentReconciliationService,
  ) {}

  capture(schoolId: string, payload: PaymentEventDto) {
    this.schools.findById(schoolId);
    const rawPayload = { ...payload } as Record<string, unknown>;

    const delivery = this.database.db.transaction((transaction) => {
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
        return {
          eventId: created.id,
          deliveryOutcome: 'accepted' as const,
          conflictingFields: [] as MaterialField[],
        };
      }

      const existing = transaction
        .select()
        .from(paymentEvents)
        .where(
          and(
            eq(paymentEvents.schoolId, schoolId),
            eq(paymentEvents.providerEventId, payload.event_id),
          ),
        )
        .get()!;
      const conflictingFields = materialDifferences(existing, payload);

      return {
        eventId: existing.id,
        deliveryOutcome:
          conflictingFields.length > 0
            ? ('conflicting_duplicate' as const)
            : ('duplicate' as const),
        conflictingFields,
      };
    });

    if (delivery.deliveryOutcome === 'conflicting_duplicate') {
      this.logger.error({
        message: 'Conflicting payment event re-delivery',
        schoolId,
        eventId: delivery.eventId,
        providerEventId: payload.event_id,
        conflictingFields: delivery.conflictingFields,
      });
    }

    this.paymentReconciliation.reconcile(schoolId, delivery.eventId);

    return {
      deliveryOutcome: delivery.deliveryOutcome,
      conflictingFields: delivery.conflictingFields,
      event: this.paymentQueries.findById(schoolId, delivery.eventId),
    };
  }
}
