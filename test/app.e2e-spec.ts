import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '@/app.module';
import { DatabaseService } from '@/database/database.service';
import { createTestDatabase, TestDatabase } from '@test/helpers/test-database';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;
  let testDatabase: TestDatabase;

  beforeEach(async () => {
    testDatabase = createTestDatabase();
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(DatabaseService)
      .useValue(testDatabase.database)
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('/ (GET)', () => {
    return request(app.getHttpServer()).get('/').expect(200).expect('Hello World!');
  });

  it('re-drives pending payment events for a school', async () => {
    const createSchoolResponse = await request(app.getHttpServer())
      .post('/schools')
      .send({ name: 'Recovery Test School' })
      .expect(201);
    const schoolId = (createSchoolResponse.body as { id: string }).id;

    await request(app.getHttpServer())
      .post(`/schools/${schoolId}/payment-events/reconcile-pending`)
      .expect(201)
      .expect({
        attemptedCount: 0,
        recoveredCount: 0,
        stillPendingCount: 0,
        errorCount: 0,
        outcomes: [],
      });
  });

  afterEach(async () => {
    await app.close();
    testDatabase.cleanup();
  });
});
