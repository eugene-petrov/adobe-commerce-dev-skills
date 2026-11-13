# Verification recipes for Magento reviews

## Who reaches this code

- Callers: grep the method/class across `app/code` and `vendor` (`grep -rn "methodName(" app/code vendor/<vendor>`).
- Events: find the dispatch, `grep -rn "dispatch(\s*'event_name'" vendor app/code`. Model events are dynamic:
  `<_eventPrefix>_save_after` etc. - search `_eventPrefix = '...'` to map the entity.
- Effective DI for a class: `bin/magento dev:di:info "Vendor\Module\Class"` (preference, arguments, plugins in
  global scope). Area-specific config lives in `etc/<area>/di.xml` - grep those too.
- Plugins on interfaces apply to every implementation; plugins on a class apply to its subclasses; a preference
  to a class that does not extend the original drops the original's plugins.
- Around plugins higher in the chain may skip `$proceed()` - read them before assuming your plugin runs.
- Area: frontend/adminhtml/webapi_rest/graphql/crontab/CLI each load their own `etc/<area>/` config. A CLI
  command has no area unless it sets one.

## Flows that bypass the "normal" path

- Core ImportExport and most import modules write with direct SQL in bunches: no model `save` events, no
  repository plugins; they fire their own events (e.g. `catalog_product_import_bunch_save_after`). Third-party
  importers may have their own implementation of save/delete - open it.
- Mass actions (`Product\Action::updateAttributes`), `saveAttribute()`, indexers and direct SQL also skip
  model save events and repository plugins.
- REST/GraphQL use the webapi areas and repository/service paths; admin forms often call models/resource
  models directly.

## Transactions and failure modes

- `AbstractDb::save()` opens a transaction; `*_save_before` / `*_save_after` run inside it (an exception rolls
  back the save), `*_save_commit_after` runs after commit.
- Queue consumer: an uncaught exception rejects the message without requeue
  (`vendor/magento/framework-message-queue/Consumer.php`). Check what recovery exists.
- `db` queue publish inside a transaction rolls back with it; `amqp` does not.
- Cron: jobs in one group run sequentially; check `cron_groups.xml` and `use_separate_process`.

## Data facts to check before claiming a bug

- Case-insensitive collation and unique keys: inspect with `SHOW CREATE TABLE <table>`.
- Store scope fallback (`store_id = 0`), `row_id` vs `entity_id` on Adobe Commerce.
- Rows filtered/validated upstream (import validation, `isValid`, required attributes) before they reach the code.

## Frontend (Luma) tracing

- Every mixin and `map` on a JS module: grep all `requirejs-config.js` in `app/code`, `app/design`, `vendor`
  for the module ID. Mixins apply in module load order; the last applied is the outermost wrapper.
- Which template is rendered: theme fallback (`app/design/frontend/<Vendor>/<theme>/<Module>/templates/...`
  overrides the module's file); a ViewModel added in layout is dead if the rendered template ignores it.
- Data sources: `window.checkoutConfig` (PHP `ConfigProviderInterface` via `CompositeConfigProvider`, merged
  with `array_merge_recursive`), customer-data sections (`SectionSourceInterface`, `sections.xml`), JSON in the
  template.
- Values read at JS module load time are snapshots; check whether they can change later.

## Runtime checks (before deferring to another environment)

- Use the project's runtime (`magento-exec-shell-cmd`): `bin/magento config:show <path>`, `indexer:status`,
  `queue:consumers:list`, `cron_schedule`, `queue_message_status`, `core_config_data`, `var/log/*.log`,
  module/integration log tables. Read-only queries only.
- For storefront behavior, reproduce in a browser with FPC enabled, as guest and logged-in customer.

## Severity scale

- **BLOCKER** - data loss/corruption, checkout/order/payment broken, security hole, fatal on a common path,
  deploy/setup:upgrade failure.
- **MAJOR** - wrong behavior on a realistic path, performance regression on a hot path (N+1 on listing, FPC
  disabled), missing ACL, side effect that can fire without commit.
- **MINOR** - wrong behavior on a rare edge case with low impact, misleading comment/log, missing guard with an
  existing downstream safety net.
