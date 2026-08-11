import { ConflictException, InternalServerErrorException } from '@nestjs/common';
import { SchoolConfigService } from '@/schools/configs/school-config.service';
import { SchoolProfileService } from '@/schools/profile/school-profile.service';
import { createTestDatabase, TestDatabase } from '@test/helpers/test-database';

const ORIGINAL_CONFIG = {
  currency: 'ZAR' as const,
  gracePeriodDays: 30,
  reminderCadenceDays: [7, 14, 21],
  allowPartialPayments: false,
  arrearsAfterDays: 45,
};

describe('SchoolConfigService', () => {
  let testDatabase: TestDatabase;
  let schools: SchoolProfileService;
  let configs: SchoolConfigService;

  beforeEach(() => {
    testDatabase = createTestDatabase();
    schools = new SchoolProfileService(testDatabase.database);
    configs = new SchoolConfigService(testDatabase.database, schools);
  });

  afterEach(() => {
    testDatabase.cleanup();
  });

  it('creates and activates new versions without changing history', () => {
    const school = schools.create({ name: 'Knit Academy' });
    const versionOne = configs.createVersion(school.id, {
      config: ORIGINAL_CONFIG,
      createdBy: 'operator@knit.test',
      changeReason: 'Initial onboarding configuration',
    });

    configs.activateVersion(school.id, versionOne.id, {
      expectedCurrentVersionId: null,
      activatedBy: 'operator@knit.test',
      activationReason: 'Approve onboarding settings',
    });

    const versionTwo = configs.createVersion(school.id, {
      config: { ...ORIGINAL_CONFIG, gracePeriodDays: 21 },
      createdBy: 'operator@knit.test',
      changeReason: 'School requested a shorter grace period',
    });

    configs.activateVersion(school.id, versionTwo.id, {
      expectedCurrentVersionId: versionOne.id,
      activatedBy: 'lead@knit.test',
      activationReason: 'Approved school request',
    });

    expect(configs.getActiveConfig(school.id).version.id).toBe(versionTwo.id);
    expect(configs.getHistory(school.id)).toEqual([
      expect.objectContaining({ id: versionTwo.id, version: 2 }),
      expect.objectContaining({
        id: versionOne.id,
        version: 1,
        config: ORIGINAL_CONFIG,
      }),
    ]);
  });

  it('rejects activation based on stale configuration state', () => {
    const school = schools.create({ name: 'Knit Academy' });
    const version = configs.createVersion(school.id, {
      config: ORIGINAL_CONFIG,
      createdBy: 'operator@knit.test',
      changeReason: 'Initial onboarding configuration',
    });

    configs.activateVersion(school.id, version.id, {
      expectedCurrentVersionId: null,
      activatedBy: 'operator@knit.test',
      activationReason: 'Initial activation',
    });

    expect(() =>
      configs.activateVersion(school.id, version.id, {
        expectedCurrentVersionId: null,
        activatedBy: 'stale-user@knit.test',
        activationReason: 'Stale bulk operation',
      }),
    ).toThrow(ConflictException);
  });

  it('blocks a raw bulk reset to defaults', () => {
    const school = schools.create({ name: 'Knit Academy' });
    const version = configs.createVersion(school.id, {
      config: ORIGINAL_CONFIG,
      createdBy: 'operator@knit.test',
      changeReason: 'Initial onboarding configuration',
    });

    const dangerousDefaults = JSON.stringify({
      ...ORIGINAL_CONFIG,
      gracePeriodDays: 7,
      allowPartialPayments: true,
    });

    expect(() =>
      testDatabase.database.connection
        .prepare('UPDATE school_config_versions SET config = ?')
        .run(dangerousDefaults),
    ).toThrow('school configuration versions are immutable');

    expect(configs.getHistory(school.id)[0]).toMatchObject({
      id: version.id,
      config: ORIGINAL_CONFIG,
      checksum: version.checksum,
    });
  });

  it('blocks deletion of configuration history', () => {
    const school = schools.create({ name: 'Knit Academy' });
    const version = configs.createVersion(school.id, {
      config: ORIGINAL_CONFIG,
      createdBy: 'operator@knit.test',
      changeReason: 'Initial onboarding configuration',
    });

    expect(() =>
      testDatabase.database.connection
        .prepare('DELETE FROM school_config_versions WHERE id = ?')
        .run(version.id),
    ).toThrow('school configuration versions are immutable');
  });

  it('refuses to read an active configuration whose checksum no longer matches', () => {
    const school = schools.create({ name: 'Knit Academy' });
    const version = configs.createVersion(school.id, {
      config: ORIGINAL_CONFIG,
      createdBy: 'operator@knit.test',
      changeReason: 'Initial onboarding configuration',
    });
    configs.activateVersion(school.id, version.id, {
      expectedCurrentVersionId: null,
      activatedBy: 'operator@knit.test',
      activationReason: 'Initial activation',
    });

    testDatabase.database.connection.exec('DROP TRIGGER school_config_versions_prevent_update');
    testDatabase.database.connection
      .prepare('UPDATE school_config_versions SET config = ? WHERE id = ?')
      .run(JSON.stringify({ ...ORIGINAL_CONFIG, gracePeriodDays: 1 }), version.id);

    expect(() => configs.getActiveConfig(school.id)).toThrow(InternalServerErrorException);
    expect(() => configs.getHistory(school.id)).toThrow(InternalServerErrorException);
  });

  it('refuses to activate a configuration whose checksum no longer matches', () => {
    const school = schools.create({ name: 'Knit Academy' });
    const version = configs.createVersion(school.id, {
      config: ORIGINAL_CONFIG,
      createdBy: 'operator@knit.test',
      changeReason: 'Initial onboarding configuration',
    });

    testDatabase.database.connection.exec('DROP TRIGGER school_config_versions_prevent_update');
    testDatabase.database.connection
      .prepare('UPDATE school_config_versions SET config = ? WHERE id = ?')
      .run(JSON.stringify({ ...ORIGINAL_CONFIG, gracePeriodDays: 1 }), version.id);

    expect(() =>
      configs.activateVersion(school.id, version.id, {
        expectedCurrentVersionId: null,
        activatedBy: 'operator@knit.test',
        activationReason: 'Activate corrupted version',
      }),
    ).toThrow(InternalServerErrorException);
  });
});
