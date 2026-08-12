# Solution

## The key trade-offs I made and why

1. I used SQLite as the database for easy setup and testing. For a production
   system, I would use PostgreSQL. It handles concurrent writes, multiple
   application instances, backups, monitoring, and operational growth more
   comfortably. SQLite is appropriate here because the assessment benefits more
   from a reproducible local setup than from production-scale infrastructure.

2. I explicitly did not handle multiple currencies automatically on the payment
   webhooks. I recorded the transactions and linked them to the relevant family
   account where possible, but did not add them to the ledger. A human reviewer
   would determine the appropriate conversion approach and apply a verified Rand
   amount, if appropriate.

3. I calculate a family's balance from invoices, payments, and refunds instead of
   storing a changing balance column. A stored balance is faster to read, but it
   creates another value that can become wrong if a payment, refund, or retry is
   missed. For one family, even several years of monthly invoices and payments is
   only a small number of rows, so calculating it on request is a reasonable
   trade-off here.

4. The webhook callback is also synchronous today. It captures the provider event,
   then runs reconciliation on the same request before returning a response to the
   provider. A backlog or slow reconciliation therefore delays the provider's
   callback response. In production, I would commit the incoming event quickly,
   return success, and reconcile it through a durable background queue with retry
   limits, alerts, and a dead-letter path.

## Alternatives I considered and rejected

1. I considered making the student link required for invoice lines. I kept it
   optional because not every family charge belongs to one student. For example,
   transport, a family discount, or another shared charge may cover more than one
   student. Invoices still belong to a family account, while student links add
   useful detail when it exists.

2. I also considered not including payments with invalid invoice references in the
   family account ledger. I chose to include them with a review flag instead. This
   keeps the family's financial history accurate while making a problematic payment
   easy to find.

3. I considered a stored balance or materialised view. I rejected it for now
   because it adds reconciliation and repair work whenever historical financial
   events change. Compute-on-read is simpler and safer at this scale.

4. I considered updating one school configuration record and requiring a reason
   for each change. I chose immutable configuration versions instead. Each change
   creates a new version, and making it live appends an activation record pointing
   at that version. The newest activation identifies the active configuration.
   This means there is no settings row for a migration, bulk update, or bad merge
   to overwrite silently. It also preserves who made a version live, when, and why.

## What I deliberately left out, and what I would do with another two days

- Asynchronous reconciliation in a background worker.
- Improved logging and monitoring.

## Anything in the fixture I found suspicious and how I handled it

1. The USD payment: the solution does not handle multiple currencies automatically,
   so I accepted and recorded the payment but did not include it in the family
   ledger. It requires manual review to determine the conversion.

2. Two payments have matching financial details but different provider event IDs. I
   treated both as valid payments, but marked the later one as
   `applied_requires_review`, because it might be a double payment made by the
   user.

3. The negative payment value was suspicious. I rejected it because a payment
   provider should not send a negative payment.

4. One payment referenced an invoice that did not exist. I accepted it, linked it
   to the relevant family account, and applied it at family level, while marking it
   as `applied_requires_review`. This keeps the balance accurate while surfacing
   the missing invoice for a bursar.

## Assuming this system is running for 40 schools a year from now: what breaks first?

The first infrastructure limit at 40 schools is SQLite. It has limited
concurrent writing and is tied to one database file and application host.
