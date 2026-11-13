---
name: magento-backend
description: Magento 2 / Adobe Commerce backend developer workflow and coding standards - loads the shared backend standards and decision guides for extension points (plugin vs observer vs preference vs virtualType), declarative schema and data patches, service contracts, repositories and collections, cron, message queues, indexers/mview, caching and FPC, config, ACL, payments and security. Use this skill whenever writing, modifying, refactoring or designing PHP/XML in a Magento 2 module (app/code, di.xml, events.xml, db_schema.xml, crontab.xml, queue_*.xml, system.xml, webapi.xml, layout XML, ViewModels, controllers, plugins, observers, GraphQL resolvers, patches, consumers, CLI commands), even if the user does not say "Magento" explicitly.
---

# Magento 2 backend developer

Project instructions (AGENTS.md, CLAUDE.md, README) win over this skill when they conflict. Local conventions
of the repository win over generic best practice: before inventing a pattern, find how the repository already
solves the same kind of problem and follow it.

Related skills: `magento-architecture` (design before code), `magento-luma-frontend` (layout/JS/templates),
`magento-review` (review), `magento-exec-shell-cmd` (how to run commands in this project).

## Step 0 - load the standards (mandatory)

Before writing or changing any code, read `references/standards.md` (relative to this skill's directory) in
full. Every `[rule]` applies to the code you write; a deviation needs a written reason in the code or in your
report. Do not skip this because the change looks small. Then check the project's AGENTS.md / CLAUDE.md for
the "project decisions" listed at the end of the standards.

## Step 1 - understand before writing

1. **Find the real entry point.** Which controller / plugin / observer / cron / consumer / CLI command / API /
   GraphQL resolver reaches the code, in which area (frontend, adminhtml, webapi_rest, graphql, crontab, CLI).
   Read the dispatching core/vendor code around it, not just the method you change.
2. **See what already hooks the class.** `bin/magento dev:di:info "Vendor\Module\Class"` shows the effective
   preference, constructor arguments and plugins. Also grep `di.xml` / `events.xml` in `app/code` and `vendor`
   (including area-specific `etc/<area>/di.xml`) for the class, its parents and its interfaces.
3. **Pick the extension point** with `references/extension-points.md`: config/argument > observer >
   before/after plugin > around plugin > preference. For a non-trivial feature use `magento-architecture` first.
4. **Keep the diff scoped.** No drive-by reformatting, no whole-file rewrites, preserve encoding and line
   endings. Never edit `vendor/`; customize a third-party module from a separate module sequenced after it.

## Step 2 - write, using the topic guide that matches the task

| File | When |
|---|---|
| `references/extension-points.md` | Plugin vs observer vs preference vs virtualType, extension attributes, ViewModels |
| `references/schema-and-patches.md` | `db_schema.xml`, whitelist, data/schema patches, EAV attributes |
| `references/data-access.md` | Repositories, SearchCriteria, collections, bulk SQL, transactions, store scope |
| `references/async.md` | Cron, message queues (publish/consume, retries), indexers and mview |
| `references/caching.md` | Cache types and tags, FPC/Varnish/Fastly, block identities, customer-data sections |
| `references/cloud.md` | Only for Adobe Commerce Cloud projects: deploy phases, config.php, env config |

## Step 3 - apply and verify

Run commands through the project's runtime (see `magento-exec-shell-cmd`).

- `module.xml`, `db_schema.xml`, patches -> `bin/magento setup:upgrade`; regenerate
  `db_schema_whitelist.json` (see `references/schema-and-patches.md`).
- `di.xml`, `events.xml`, other XML config -> `bin/magento cache:clean config` (layout: also `layout`, `full_page`).
- Changed the constructor of a class that has plugins / Proxy / Factory -> remove its stale generated class in
  `generated/code/<Namespace path>/`; developer mode regenerates it.
- In developer mode `setup:di:compile` is not needed; a stale `generated/` from an old compile causes confusing
  errors - clear `generated/code` and `generated/metadata` instead of recompiling.
- Exercise the real path (page, CLI command, consumer, cron job) and check `var/log/exception.log`,
  `system.log`, `debug.log`. Run the module's unit tests if it has `Test/Unit`.

## Step 4 - self-check before handing off (mandatory)

1. Run `../magento-review/scripts/collect-changes.sh` (relative to this skill) from the repository root, if the
   `magento-review` skill is installed: change set, encoding, whitespace, `php -l`, phpcs (Magento2 standard,
   changed lines only), grep hints.
2. Fix what it reports on your lines, then walk your diff once against every `[rule]` in `references/standards.md`.
3. In your report, list any `[rule]` you deliberately did not follow and why, plus what you could not verify.
