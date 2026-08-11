import { Injectable, NotFoundException } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { centsToRand, randToCents } from '@/common/money/zar';
import { DatabaseService } from '@/database/database.service';
import { invoiceLineItems, invoices } from '@/database/schema';
import { FamilyAccountsService } from '../family-accounts/family-accounts.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';

@Injectable()
export class InvoicesService {
  constructor(
    private readonly database: DatabaseService,
    private readonly families: FamilyAccountsService,
  ) {}

  create(schoolId: string, familyAccountId: string, input: CreateInvoiceDto) {
    this.families.findById(schoolId, familyAccountId);

    const invoiceId = this.database.db.transaction((transaction) => {
      const invoice = transaction
        .insert(invoices)
        .values({
          familyAccountId,
          invoiceReference: input.invoiceReference,
          currency: input.currency,
          issuedAt: input.issuedAt,
          dueAt: input.dueAt,
        })
        .returning()
        .get();

      transaction
        .insert(invoiceLineItems)
        .values(
          input.lineItems.map((lineItem) => ({
            familyAccountId,
            invoiceId: invoice.id,
            studentId: lineItem.studentId,
            description: lineItem.description,
            amountCents: randToCents(lineItem.amount),
          })),
        )
        .run();

      return invoice.id;
    });

    return this.findById(schoolId, familyAccountId, invoiceId);
  }

  findById(schoolId: string, familyAccountId: string, invoiceId: string) {
    this.families.findById(schoolId, familyAccountId);

    const invoice = this.database.db
      .select()
      .from(invoices)
      .where(and(eq(invoices.familyAccountId, familyAccountId), eq(invoices.id, invoiceId)))
      .get();

    if (!invoice) {
      throw new NotFoundException(`Invoice ${invoiceId} was not found`);
    }

    const lineItems = this.database.db
      .select()
      .from(invoiceLineItems)
      .where(eq(invoiceLineItems.invoiceId, invoice.id))
      .all();

    const publicLineItems = lineItems.map(({ amountCents, ...lineItem }) => ({
      ...lineItem,
      amount: centsToRand(amountCents),
    }));

    return {
      ...invoice,
      total: centsToRand(lineItems.reduce((total, lineItem) => total + lineItem.amountCents, 0)),
      lineItems: publicLineItems,
    };
  }

  findByReference(schoolId: string, familyReference: string, invoiceReference: string) {
    const family = this.families.findByReference(schoolId, familyReference);
    const invoice = this.database.db
      .select()
      .from(invoices)
      .where(
        and(
          eq(invoices.familyAccountId, family.id),
          eq(invoices.invoiceReference, invoiceReference),
        ),
      )
      .get();

    if (!invoice) {
      throw new NotFoundException(`Invoice ${invoiceReference} was not found`);
    }

    return invoice;
  }
}
