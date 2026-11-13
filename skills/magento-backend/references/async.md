# Cron, message queues, indexers

## Cron

- Declared in `etc/crontab.xml` under a group; custom groups in `etc/cron_groups.xml`. Heavy or long jobs get
  their own group with `use_separate_process=1` so they do not block the default group.
- Jobs in one group run sequentially in one process; a slow job delays every job after it.
- Cron runs in the `crontab` area: frontend/adminhtml-only plugins and observers do not apply.
- Jobs must be idempotent and resumable: track progress (last processed id/time) instead of relying on a
  single run completing; protect against overlapping runs with a lock (`LockManagerInterface`) when a job can
  outlive its schedule interval.
- Check runtime state in `cron_schedule` (status `pending`/`running`/`success`/`missed`/`error`, `messages`).

## Message queues

- Topology: `communication.xml` (topic + payload type), `queue_publisher.xml`, `queue_topology.xml`,
  `queue_consumer.xml`. Connection `db` (MySQL tables) or `amqp` (RabbitMQ).
- Consumers run via `bin/magento queue:consumers:start <name>` or the cron consumers runner
  (`cron_consumers_runner` in `env.php`: `cron_run`, `max_messages`, `consumers` list). A consumer not in that
  list (when the list is set) never runs.
- An uncaught exception in the handler rejects the message without requeue - it is not retried. Design retry /
  failed-status handling explicitly (status table, re-publish, cron re-processing).
- Publishing inside a DB transaction: with `db` connection the message rolls back with the transaction; with
  `amqp` it is sent immediately even if the transaction later rolls back. Publish after commit.
- Payload is serialized by type from `communication.xml`; keep it small (ids, not full entities) and re-load
  current data in the consumer.

## Indexers and mview

- `indexer.xml` declares the indexer; `mview.xml` subscribes it to tables for "Update by Schedule".
- Update on Save: reindex runs synchronously on entity save (through the model/repository path only).
  Update by Schedule: DB triggers write ids to `<view>_cl`; the `indexer_update_all_views` cron processes them.
  Direct SQL writes are caught only in schedule mode (triggers), never by save-time plugins.
- Never call `reindexAll()` / full reindex from request code or per-entity flows. Use `reindexRow/List` or
  `invalidate()` and let cron handle it.
- After-plugins on indexer `execute*` methods run for every batch - keep them cheap and batch-aware.
- Useful checks: `bin/magento indexer:status`, `indexer:show-mode`, row counts in `*_cl` vs `mview_state.version_id`.
