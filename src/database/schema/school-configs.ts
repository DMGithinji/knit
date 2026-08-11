import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { foreignKey, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { schools } from './schools';

export interface SchoolConfig {
  currency: 'ZAR';
  gracePeriodDays: number;
  reminderCadenceDays: number[];
  allowPartialPayments: boolean;
  arrearsAfterDays: number;
}

export const schoolConfigVersions = sqliteTable(
  'school_config_versions',
  {
    id: text().primaryKey().$defaultFn(randomUUID),
    schoolId: text()
      .notNull()
      .references(() => schools.id, { onDelete: 'restrict' }),
    version: integer().notNull(),
    config: text({ mode: 'json' }).notNull().$type<SchoolConfig>(),
    checksum: text().notNull(),
    createdBy: text().notNull(),
    changeReason: text().notNull(),
    createdAt: text()
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex('school_config_versions_school_version_unique').on(table.schoolId, table.version),
    uniqueIndex('school_config_versions_school_id_id_unique').on(table.schoolId, table.id),
  ],
);

export const schoolConfigActivations = sqliteTable(
  'school_config_activations',
  {
    id: text().primaryKey().$defaultFn(randomUUID),
    schoolId: text()
      .notNull()
      .references(() => schools.id, { onDelete: 'restrict' }),
    configVersionId: text().notNull(),
    previousConfigVersionId: text(),
    sequence: integer().notNull(),
    activatedBy: text().notNull(),
    activationReason: text().notNull(),
    createdAt: text()
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex('school_config_activations_school_sequence_unique').on(
      table.schoolId,
      table.sequence,
    ),
    foreignKey({
      columns: [table.schoolId, table.configVersionId],
      foreignColumns: [schoolConfigVersions.schoolId, schoolConfigVersions.id],
      name: 'school_config_activation_version_school_fk',
    }).onDelete('restrict'),
  ],
);
