import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
import { familyAccounts, invoices } from './billing';
import { schools } from './schools';

export type ProviderPaymentEventType = 'payment.succeeded' | 'payment.failed' | 'payment.refunded';

export type PaymentEventProcessingStatus =
  | 'received'
  | 'applied'
  | 'applied_requires_review'
  | 'recorded_no_effect'
  | 'unresolved'
  | 'rejected';

export const paymentEvents = sqliteTable(
  'payment_events',
  {
    id: text().primaryKey().$defaultFn(randomUUID),
    schoolId: text()
      .notNull()
      .references(() => schools.id, { onDelete: 'restrict' }),
    familyAccountId: text().references(() => familyAccounts.id, { onDelete: 'restrict' }),
    providerEventId: text().notNull(),
    type: text({
      enum: ['payment.succeeded', 'payment.failed', 'payment.refunded'],
    }).notNull(),
    familyReference: text().notNull(),
    invoiceReference: text().notNull(),
    amountCents: integer().notNull(),
    currency: text().notNull(),
    occurredAt: text().notNull(),
    providerReason: text(),
    rawPayload: text({ mode: 'json' }).notNull().$type<Record<string, unknown>>(),
    processingStatus: text({
      enum: [
        'received',
        'applied',
        'applied_requires_review',
        'recorded_no_effect',
        'unresolved',
        'rejected',
      ],
    })
      .notNull()
      .default('received'),
    processingReason: text(),
    relatedProviderEventId: text(),
    resolvedAt: text(),
    createdAt: text()
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text()
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex('payment_events_school_provider_event_unique').on(
      table.schoolId,
      table.providerEventId,
    ),
    uniqueIndex('payment_events_school_id_id_unique').on(table.schoolId, table.id),
    index('payment_events_family_account_idx').on(table.familyAccountId),
    index('payment_events_processing_status_idx').on(table.processingStatus),
  ],
);

export const ledgerEntries = sqliteTable(
  'ledger_entries',
  {
    id: text().primaryKey().$defaultFn(randomUUID),
    schoolId: text().notNull(),
    familyAccountId: text().notNull(),
    invoiceId: text().notNull(),
    paymentEventId: text().notNull(),
    kind: text({ enum: ['payment', 'refund'] }).notNull(),
    amountCents: integer().notNull(),
    currency: text({ enum: ['ZAR'] }).notNull(),
    occurredAt: text().notNull(),
    createdAt: text()
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    check('ledger_entries_positive_amount', sql`${table.amountCents} > 0`),
    uniqueIndex('ledger_entries_payment_event_unique').on(table.paymentEventId),
    foreignKey({
      columns: [table.schoolId, table.familyAccountId],
      foreignColumns: [familyAccounts.schoolId, familyAccounts.id],
      name: 'ledger_entries_family_school_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.familyAccountId, table.invoiceId],
      foreignColumns: [invoices.familyAccountId, invoices.id],
      name: 'ledger_entries_invoice_family_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.schoolId, table.paymentEventId],
      foreignColumns: [paymentEvents.schoolId, paymentEvents.id],
      name: 'ledger_entries_event_school_fk',
    }).onDelete('restrict'),
  ],
);

export const paymentEventResolutions = sqliteTable(
  'payment_event_resolutions',
  {
    id: text().primaryKey().$defaultFn(randomUUID),
    schoolId: text().notNull(),
    paymentEventId: text().notNull(),
    decision: text({ enum: ['apply_verified_zar', 'record_no_effect'] }).notNull(),
    verifiedAmountCents: integer(),
    resolvedBy: text().notNull(),
    resolutionReason: text().notNull(),
    createdAt: text()
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex('payment_event_resolutions_event_unique').on(table.paymentEventId),
    foreignKey({
      columns: [table.schoolId, table.paymentEventId],
      foreignColumns: [paymentEvents.schoolId, paymentEvents.id],
      name: 'payment_event_resolutions_event_school_fk',
    }).onDelete('restrict'),
  ],
);
