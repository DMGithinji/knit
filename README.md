# Knit school billing assessment

A NestJS and SQLite billing service for schools. Each school has its own
configuration and family accounts; families can contain multiple students and
receive invoices made up of student-specific or shared line items. Payment
provider callbacks are captured as immutable events, reconciled into an
idempotent ledger, and used to produce an explainable family balance with any
exceptions clearly surfaced for review.

## Run locally

Requirements: Node.js 22+ and pnpm.

```bash
pnpm install
pnpm db:migrate
pnpm start:dev
```

## Verify

```bash
pnpm verify
pnpm test:e2e
pnpm fixture:replay
```

Tests use their own temporary SQLite databases. `fixture:replay` checks that the
supplied payment events give the same result when replayed or posted in a
different order.

## Inspect the fixture through the API

```bash
pnpm seed
pnpm start:dev
pnpm fixture:post
```

`pnpm seed` creates the fixture school, families, and invoices, then prints a
balance URL for each family. After `pnpm fixture:post` sends the provider events,
open those URLs to see each family’s balance.

## API documentation

With the application running, use [Swagger UI](http://localhost:3000/docs).
It documents the routes, request bodies, query parameters, and responses.

## School configuration

Each school is configured independently through immutable configuration
versions. A configuration contains the billing currency, grace period, reminder
cadence, partial-payment policy, and the number of days before an account is
considered in arrears.

Creating a version does not immediately make it live. It must be activated in a
separate operation that records who activated it, why, and which version it
replaced. Activations use an expected-current-version check to prevent a stale
request from replacing a newer configuration. Stored checksums are verified
when configuration is read or activated, providing an additional integrity
check and preserving a complete audit history.

## Accounting notes

- Amounts are returned in Rand, but SQLite stores them as cents internally. This
  avoids decimal rounding errors when adding invoices, payments, and refunds.
- A repeated provider event does not create another payment or ledger entry.
- The balance is invoices minus payments plus refunds. A negative balance is a
  family credit.
- Failed or unresolved events remain visible for review without changing the
  balance.
- Only Rand payments are applied automatically. Payments in other currencies are
  accepted and kept for review, but do not change the balance until a person
  resolves them with the verified Rand amount or records that they have no effect.

See the [database schema diagram](./src/database/db_schema.svg) for the table
relationships. Its editable [Mermaid source](./src/database/db_schema.mmd) is
kept alongside it.
