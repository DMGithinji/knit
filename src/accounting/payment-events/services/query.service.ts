import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { and, count, desc, eq, gte, isNotNull, isNull, lte, type SQL } from 'drizzle-orm';
import { centsToRand } from '@/common/money/zar';
import { DatabaseService } from '@/database/database.service';
import { paymentEvents } from '@/database/schema';
import { SchoolProfileService } from '@/schools/profile/school-profile.service';
import { SearchPaymentEventsDto } from '../dto/payment-event.dto';

@Injectable()
export class PaymentQueryService {
  constructor(
    private readonly database: DatabaseService,
    private readonly schools: SchoolProfileService,
  ) {}

  search(schoolId: string, query: SearchPaymentEventsDto) {
    this.schools.findById(schoolId);

    if (
      query.occurredFrom &&
      query.occurredTo &&
      new Date(query.occurredFrom) > new Date(query.occurredTo)
    ) {
      throw new BadRequestException('occurredFrom must be before or equal to occurredTo');
    }

    const conditions: SQL[] = [eq(paymentEvents.schoolId, schoolId)];
    if (query.status) {
      conditions.push(eq(paymentEvents.processingStatus, query.status));
    }
    if (query.reason) {
      conditions.push(eq(paymentEvents.processingReason, query.reason));
    }
    if (query.linked === 'true') {
      conditions.push(isNotNull(paymentEvents.familyAccountId));
    }
    if (query.linked === 'false') {
      conditions.push(isNull(paymentEvents.familyAccountId));
    }
    if (query.occurredFrom) {
      conditions.push(gte(paymentEvents.occurredAt, query.occurredFrom));
    }
    if (query.occurredTo) {
      conditions.push(lte(paymentEvents.occurredAt, query.occurredTo));
    }

    const where = and(...conditions);
    const limit = query.limit ?? 50;
    const offset = query.offset ?? 0;
    const total = this.database.db
      .select({ value: count() })
      .from(paymentEvents)
      .where(where)
      .get()!.value;
    const events = this.database.db
      .select({
        id: paymentEvents.id,
        providerEventId: paymentEvents.providerEventId,
        familyAccountId: paymentEvents.familyAccountId,
        familyReference: paymentEvents.familyReference,
        invoiceReference: paymentEvents.invoiceReference,
        type: paymentEvents.type,
        amountCents: paymentEvents.amountCents,
        currency: paymentEvents.currency,
        occurredAt: paymentEvents.occurredAt,
        processingStatus: paymentEvents.processingStatus,
        processingReason: paymentEvents.processingReason,
        relatedProviderEventId: paymentEvents.relatedProviderEventId,
        resolvedAt: paymentEvents.resolvedAt,
        createdAt: paymentEvents.createdAt,
      })
      .from(paymentEvents)
      .where(where)
      .orderBy(desc(paymentEvents.occurredAt), desc(paymentEvents.id))
      .limit(limit)
      .offset(offset)
      .all();

    const items = events.map(({ amountCents, processingStatus, processingReason, ...event }) => ({
      ...event,
      amount: centsToRand(amountCents),
      status: processingStatus,
      reason: processingReason,
    }));

    return {
      items,
      pagination: {
        limit,
        offset,
        total,
        hasMore: offset + items.length < total,
      },
    };
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

    const { amountCents, ...details } = event;

    return {
      ...details,
      amount: centsToRand(amountCents),
    };
  }
}
