import { createHash } from 'node:crypto';
import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { and, desc, eq, max } from 'drizzle-orm';
import { DatabaseService } from '@/database/database.service';
import { SchoolConfig, schoolConfigActivations, schoolConfigVersions } from '@/database/schema';
import { SchoolProfileService } from '../profile/school-profile.service';
import { ActivateConfigVersionDto, CreateConfigVersionDto } from './dto/school-config.dto';

function serializeConfig(config: SchoolConfig): string {
  return JSON.stringify({
    currency: config.currency,
    gracePeriodDays: config.gracePeriodDays,
    reminderCadenceDays: config.reminderCadenceDays,
    allowPartialPayments: config.allowPartialPayments,
    arrearsAfterDays: config.arrearsAfterDays,
  });
}

function checksum(config: SchoolConfig): string {
  return createHash('sha256').update(serializeConfig(config)).digest('hex');
}

function verifyChecksum(version: { id: string; config: SchoolConfig; checksum: string }): void {
  if (checksum(version.config) !== version.checksum) {
    throw new InternalServerErrorException(
      `Configuration integrity check failed for version ${version.id}`,
    );
  }
}

@Injectable()
export class SchoolConfigService {
  constructor(
    private readonly database: DatabaseService,
    private readonly schools: SchoolProfileService,
  ) {}

  createVersion(schoolId: string, input: CreateConfigVersionDto) {
    this.schools.findById(schoolId);

    const latest = this.database.db
      .select({ version: max(schoolConfigVersions.version) })
      .from(schoolConfigVersions)
      .where(eq(schoolConfigVersions.schoolId, schoolId))
      .get();

    return this.database.db
      .insert(schoolConfigVersions)
      .values({
        schoolId,
        version: (latest?.version ?? 0) + 1,
        config: input.config,
        checksum: checksum(input.config),
        createdBy: input.createdBy,
        changeReason: input.changeReason,
      })
      .returning()
      .get();
  }

  activateVersion(schoolId: string, configVersionId: string, input: ActivateConfigVersionDto) {
    this.schools.findById(schoolId);

    return this.database.db.transaction((transaction) => {
      const version = transaction
        .select()
        .from(schoolConfigVersions)
        .where(
          and(
            eq(schoolConfigVersions.schoolId, schoolId),
            eq(schoolConfigVersions.id, configVersionId),
          ),
        )
        .get();

      if (!version) {
        throw new NotFoundException(`Configuration version ${configVersionId} was not found`);
      }

      verifyChecksum(version);

      const current = transaction
        .select()
        .from(schoolConfigActivations)
        .where(eq(schoolConfigActivations.schoolId, schoolId))
        .orderBy(desc(schoolConfigActivations.sequence))
        .get();

      if ((current?.configVersionId ?? null) !== input.expectedCurrentVersionId) {
        throw new ConflictException('Active configuration changed; reload it before activating');
      }

      return transaction
        .insert(schoolConfigActivations)
        .values({
          schoolId,
          configVersionId,
          previousConfigVersionId: current?.configVersionId ?? null,
          sequence: (current?.sequence ?? 0) + 1,
          activatedBy: input.activatedBy,
          activationReason: input.activationReason,
        })
        .returning()
        .get();
    });
  }

  getActiveConfig(schoolId: string) {
    this.schools.findById(schoolId);

    const active = this.database.db
      .select({ activation: schoolConfigActivations, version: schoolConfigVersions })
      .from(schoolConfigActivations)
      .innerJoin(
        schoolConfigVersions,
        eq(schoolConfigActivations.configVersionId, schoolConfigVersions.id),
      )
      .where(eq(schoolConfigActivations.schoolId, schoolId))
      .orderBy(desc(schoolConfigActivations.sequence))
      .get();

    if (!active) {
      throw new NotFoundException(`School ${schoolId} has no active configuration`);
    }

    verifyChecksum(active.version);

    return active;
  }

  getHistory(schoolId: string) {
    this.schools.findById(schoolId);

    const history = this.database.db
      .select()
      .from(schoolConfigVersions)
      .where(eq(schoolConfigVersions.schoolId, schoolId))
      .orderBy(desc(schoolConfigVersions.version))
      .all();

    history.forEach(verifyChecksum);
    return history;
  }
}
