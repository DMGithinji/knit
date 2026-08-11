import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
import { schools } from './schools';

export const familyAccounts = sqliteTable(
  'family_accounts',
  {
    id: text().primaryKey().$defaultFn(randomUUID),
    schoolId: text()
      .notNull()
      .references(() => schools.id, { onDelete: 'restrict' }),
    accountReference: text().notNull(),
    displayName: text().notNull(),
    createdAt: text()
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex('family_accounts_school_reference_unique').on(
      table.schoolId,
      table.accountReference,
    ),
  ],
);

export const students = sqliteTable(
  'students',
  {
    id: text().primaryKey().$defaultFn(randomUUID),
    familyAccountId: text()
      .notNull()
      .references(() => familyAccounts.id, { onDelete: 'restrict' }),
    studentReference: text().notNull(),
    name: text().notNull(),
    createdAt: text()
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex('students_family_reference_unique').on(
      table.familyAccountId,
      table.studentReference,
    ),
    uniqueIndex('students_family_id_id_unique').on(table.familyAccountId, table.id),
  ],
);

export const invoices = sqliteTable(
  'invoices',
  {
    id: text().primaryKey().$defaultFn(randomUUID),
    familyAccountId: text()
      .notNull()
      .references(() => familyAccounts.id, { onDelete: 'restrict' }),
    invoiceReference: text().notNull(),
    currency: text({ enum: ['ZAR'] }).notNull(),
    issuedAt: text().notNull(),
    dueAt: text().notNull(),
    createdAt: text()
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex('invoices_family_reference_unique').on(
      table.familyAccountId,
      table.invoiceReference,
    ),
    uniqueIndex('invoices_family_id_id_unique').on(table.familyAccountId, table.id),
  ],
);

export const invoiceLineItems = sqliteTable(
  'invoice_line_items',
  {
    id: text().primaryKey().$defaultFn(randomUUID),
    familyAccountId: text().notNull(),
    invoiceId: text().notNull(),
    studentId: text(),
    description: text().notNull(),
    amountCents: integer().notNull(),
    createdAt: text()
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    check('invoice_line_items_positive_amount', sql`${table.amountCents} > 0`),
    foreignKey({
      columns: [table.familyAccountId, table.invoiceId],
      foreignColumns: [invoices.familyAccountId, invoices.id],
      name: 'invoice_line_items_invoice_family_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.familyAccountId, table.studentId],
      foreignColumns: [students.familyAccountId, students.id],
      name: 'invoice_line_items_student_family_fk',
    }).onDelete('restrict'),
  ],
);
