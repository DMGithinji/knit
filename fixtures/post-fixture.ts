import { FIXTURE_FAMILIES, FIXTURE_SCHOOL } from './fixture-data';
import { loadPaymentEventFixture } from './fixture-replay';

interface School {
  id: string;
  name: string;
}

interface PaymentCaptureResponse {
  deliveryOutcome: string;
  conflictingFields: string[];
  event: {
    providerEventId: string;
    familyAccountId: string | null;
    processingStatus: string;
    processingReason: string | null;
  };
}

function getPassCount(): number {
  const passes = Number(process.env.FIXTURE_POST_PASSES ?? 3);

  if (!Number.isInteger(passes) || passes < 1) {
    throw new Error('FIXTURE_POST_PASSES must be a positive integer');
  }

  return passes;
}

async function requestJson<T>(url: string, options?: RequestInit): Promise<T> {
  let response: Response;

  try {
    response = await fetch(url, options);
  } catch (error: unknown) {
    throw new Error(
      `Could not reach ${url}. Start the API with pnpm start:dev before posting fixtures.`,
      { cause: error },
    );
  }

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${options?.method ?? 'GET'} ${url} failed with ${response.status}: ${text}`);
  }

  return JSON.parse(text) as T;
}

async function main(): Promise<void> {
  const baseUrl = (process.env.API_URL ?? 'http://localhost:3000').replace(/\/$/, '');
  const schools = await requestJson<School[]>(`${baseUrl}/schools`);
  const school = schools.find((candidate) => candidate.name === FIXTURE_SCHOOL.name);

  if (!school) {
    throw new Error(
      `No seeded school named ${FIXTURE_SCHOOL.name} was found. Run pnpm seed first.`,
    );
  }

  const fixture = loadPaymentEventFixture();
  const passes = getPassCount();
  let acceptedCount = 0;
  let duplicateCount = 0;
  const familyIdsByReference = new Map<string, string>();

  for (let pass = 1; pass <= passes; pass += 1) {
    const outcomes = [];
    for (const event of fixture) {
      const result = await requestJson<PaymentCaptureResponse>(
        `${baseUrl}/schools/${school.id}/payment-events/callback`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(event),
        },
      );
      if (result.deliveryOutcome === 'accepted') {
        acceptedCount += 1;
      } else {
        duplicateCount += 1;
      }

      if (result.event.familyAccountId) {
        familyIdsByReference.set(event.family_id, result.event.familyAccountId);
      }

      outcomes.push({
        providerEventId: result.event.providerEventId,
        deliveryOutcome: result.deliveryOutcome,
        status: result.event.processingStatus,
        reason: result.event.processingReason,
      });
    }

    console.log(`\nPost ${pass}/${passes}: ${fixture.length} provider deliveries`);
    console.table(outcomes);
  }

  console.log(
    `\nPosted ${fixture.length * passes} deliveries to school ${school.id}: ${acceptedCount} accepted, ${duplicateCount} duplicate deliveries.`,
  );
  console.log('\nView family balances at:');
  for (const family of FIXTURE_FAMILIES) {
    const familyAccountId = familyIdsByReference.get(family.accountReference);
    if (familyAccountId) {
      console.log(
        `  ${family.accountReference}: ${baseUrl}/schools/${school.id}/families/${familyAccountId}/balance`,
      );
    }
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
