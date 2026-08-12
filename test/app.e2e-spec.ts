import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '@/app.module';
import { DatabaseService } from '@/database/database.service';
import { configureOpenApi } from '@/openapi';
import { createTestDatabase, TestDatabase } from '@test/helpers/test-database';

describe('Application (e2e)', () => {
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
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
    configureOpenApi(app);
    await app.init();
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

  it('finds unlinked payment events without running reconciliation', async () => {
    const createSchoolResponse = await request(app.getHttpServer())
      .post('/schools')
      .send({ name: 'Event Search School' })
      .expect(201);
    const schoolId = (createSchoolResponse.body as { id: string }).id;

    await request(app.getHttpServer())
      .post(`/schools/${schoolId}/payment-events/callback`)
      .send({
        event_id: 'evt_unlinked_e2e',
        type: 'payment.succeeded',
        family_id: 'fam_missing',
        invoice_id: 'inv_missing',
        amount_cents: 125000,
        currency: 'ZAR',
        occurred_at: '2026-08-05T10:00:00Z',
      })
      .expect(200)
      .expect((response) => {
        const body = response.body as {
          deliveryOutcome: string;
          conflictingFields: string[];
        };
        expect(body).toMatchObject({
          deliveryOutcome: 'accepted',
          conflictingFields: [],
        });
      });

    const response = await request(app.getHttpServer())
      .get(`/schools/${schoolId}/payment-events`)
      .query({ status: 'unresolved', linked: 'false', limit: 10 })
      .expect(200);
    const body = response.body as {
      items: Array<Record<string, unknown>>;
      pagination: { limit: number; offset: number; total: number; hasMore: boolean };
    };

    expect(body).toEqual({
      items: [
        expect.objectContaining({
          providerEventId: 'evt_unlinked_e2e',
          familyAccountId: null,
          amount: 1250,
          status: 'unresolved',
          reason: 'family_not_found',
        }),
      ],
      pagination: { limit: 10, offset: 0, total: 1, hasMore: false },
    });
    expect(body.items[0]).not.toHaveProperty('rawPayload');

    await request(app.getHttpServer())
      .get(`/schools/${schoolId}/payment-events`)
      .query({ linked: 'sometimes' })
      .expect(400);
  });

  it('publishes the OpenAPI contract', async () => {
    await request(app.getHttpServer()).get('/docs').expect(200).expect('Content-Type', /html/);
    const response = await request(app.getHttpServer()).get('/docs-json').expect(200);
    const document = response.body as {
      info: { title: string };
      paths: Record<
        string,
        Record<string, { summary?: string; parameters?: Array<{ name: string }> }>
      >;
    };

    expect(document.info.title).toBe('Knit school billing API');
    expect(document.paths['/schools']?.post?.summary).toBe('Create a school');
    expect(document.paths['/schools/{schoolId}/payment-events/callback']?.post).toBeDefined();
    expect(
      document.paths['/schools/{schoolId}/payment-events/reconcile-pending']?.post,
    ).toBeDefined();
    const paymentEventSearch = document.paths['/schools/{schoolId}/payment-events']?.get;
    expect(paymentEventSearch?.summary).toBe('Search payment events for a school');
    expect(paymentEventSearch?.parameters?.map(({ name }) => name)).toEqual(
      expect.arrayContaining(['status', 'linked', 'occurredFrom', 'occurredTo', 'limit', 'offset']),
    );
    expect(
      document.paths['/schools/{schoolId}/families/{familyAccountId}/balance']?.get,
    ).toBeDefined();
  });

  afterEach(async () => {
    await app.close();
    testDatabase.cleanup();
  });
});
