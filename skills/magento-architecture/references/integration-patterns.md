# Integration patterns

## Outbound (Magento -> external system)

| Need | Pattern |
|---|---|
| React to an entity change, external call not needed for the response | Observer on `*_save_commit_after` or a plugin on the repository `save`, publishing a small message (entity id) to a queue; consumer loads fresh data and calls the API |
| Periodic export / feed | Cron job (own cron group for long jobs) writing in batches; track last processed id/time; lock against overlap |
| Data needed during a storefront request | Avoid. If unavoidable: cache with tags and lifetime, strict timeout, fallback when the system is down |

Rules: message payload = ids, not entities; store a status per entity/message (pending/sent/failed/attempts)
when delivery matters; retries with backoff and a cap; a CLI command to re-send.

## Inbound (external system -> Magento)

| Need | Pattern |
|---|---|
| Push of single changes | REST endpoint (service contract + `webapi.xml` + ACL) or an integration token; validate, then queue heavy work |
| Bulk data (catalog, stock, prices) | Batch import via ImportExport/bulk API or a dedicated importer writing with bulk SQL in a ResourceModel; reindex by schedule |
| Webhooks | Controller or REST endpoint that verifies the signature, stores the event, acknowledges fast, processes asynchronously; idempotent by event id |

Bulk writes bypass model events and repository plugins - list every listener you rely on and call it
explicitly or use the importer's own events.

## Choosing sync vs async

Synchronous only when the caller needs the result now and it is fast and reliable. Otherwise async with:
idempotent handler, visible failure state, retry policy, and monitoring of the backlog (queue length,
`cron_schedule` errors, status table counts).

## Message queues

- `db` connection works everywhere (MySQL) but is slower; `amqp` (RabbitMQ) for volume. With `amqp`, a message
  published inside a DB transaction is sent even if the transaction rolls back - publish after commit.
- An uncaught exception in a core `Consumer` handler rejects the message without requeue: the handler must
  record failures itself if they need a retry.
- Consumers must be started by the deployment (cron consumers runner or a supervisor); document which.
