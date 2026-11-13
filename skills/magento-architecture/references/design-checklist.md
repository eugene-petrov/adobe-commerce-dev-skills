# Design checklist

Go through every line; write "n/a" with a reason rather than skipping.

## Fit with Magento
- Extension point is the least invasive one that works (config > observer > before/after plugin > around
  plugin > preference); it is reached in every area and flow that needs it (imports, mass actions, REST,
  GraphQL, admin, cron often bypass storefront paths).
- No edits to `vendor/`; third-party behavior changed from a separate module sequenced after it.
- Public contracts (`Api/` interfaces, webapi, GraphQL schema, events you dispatch) are stable and versioned.
- Scope is right: global / website / store view config and data.

## Data
- Where the data lives: own table (`db_schema.xml`), EAV attribute, extension attribute, config, cache.
- Volumes and growth; indexes for the queries the feature runs; retention / cleanup of log-like tables.
- Migration of existing data (data patch, CLI command for large sets) and its runtime during deploy.
- Indexers affected; Update by Schedule implications (mview subscriptions, changelog growth).

## Processing
- Synchronous on the request only if it is cheap and needed for the response; everything else goes to cron or
  a message queue.
- Idempotency: re-running a job or re-consuming a message does not duplicate effects.
- Failure modes: timeouts, partial failures, retries with limits, a visible failed state, manual re-run path.
- Concurrency: parallel requests/consumers on the same entity (locks, unique keys, optimistic checks).
- Transactions: external side effects only after commit.

## Performance and caching
- FPC impact: no customer-specific HTML on cacheable pages; no `cacheable="false"`; cache tags for purges.
- Hot paths (listing, PDP, cart, checkout, customer sections, config providers) get no remote calls and no
  N+1 queries.
- Expected added time per request on hot paths; how it will be measured.

## Security and compliance
- ACL for admin and webapi; form keys for state-changing actions; input validation.
- PII and payment data: what is stored, logged, sent to third parties; tokenized/vaulted payment flows only.
- Secrets in encrypted config / environment, never in the repository.

## Operations
- Deploy: patches, schema changes on large tables, config that must exist before deploy, zero-downtime concerns.
- Feature flag (config) to enable per website/store and to switch off quickly.
- Logging with enough context to debug, without secrets; metrics/alerts for async processing backlog.
- Upgrade safety: what breaks when Magento or a vendor module is upgraded (plugins on private behavior,
  overridden templates, copied classes).

## Testing
- Unit tests for logic; integration/API tests for contracts; manual or E2E scenarios for storefront flows,
  including guest/logged-in, multi-store, and failure paths.
