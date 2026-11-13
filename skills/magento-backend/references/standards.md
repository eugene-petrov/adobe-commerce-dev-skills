# Magento 2 backend code standards

Single source of truth for writing backend code (`magento-backend`, read in full before coding) and reviewing it
(`magento-review`, applied to changed lines only). Frontend standards live in
`../../magento-luma-frontend/references/standards.md`.

Labels:
- **[rule]** - follow it; a deviation needs a written reason in the code or in the report/PR.
- **[guide]** - judgment call; in reviews it is a checklist note, never a finding by itself.

A violation becomes a review *finding* only when it causes a verified defect (wrong behavior, data loss,
security hole, measurable performance regression). Otherwise it is a one-line checklist note.

## Magento architecture

- [rule] No direct `\Magento\Framework\App\ObjectManager::getInstance()`, except the core BC pattern for an
  optional new constructor dependency in a class extended by third parties.
- [rule] No raw SQL outside ResourceModel classes. Use the DB adapter, `Select`, bound parameters,
  collections, repositories or SearchCriteria - never string-built SQL.
- [rule] Plugins, preferences and observers are declared in XML, in the narrowest area that needs them
  (`etc/frontend/`, `etc/adminhtml/`, `etc/webapi_rest/`, `etc/graphql/`, `etc/crontab/`); global
  `etc/di.xml` only when every area needs it.
- [rule] Never modify `vendor/`; never copy a core/vendor class to override it when a plugin or observer works.
- [rule] Prefer `before`/`after` plugins. Use `around` only to wrap execution (state on both sides) or to halt
  the original call; changing arguments - even conditionally - is a `before` plugin. Every path of an `around`
  plugin either calls `$proceed()` or deliberately skips it.
- [rule] Side effects that leave the DB (HTTP calls, AMQP publish, emails) run after commit
  (`*_save_commit_after`, `addCommitCallback()`, or a queue), never inside an open transaction.
- [rule] Config defaults in `etc/config.xml`; config paths as class constants; read with the correct scope.
- [rule] `db_schema.xml` changes come with an updated `db_schema_whitelist.json`.
- [rule] Applied data/schema patches are never edited; a new patch is added instead.
- [rule] Proxies are configured in `di.xml` (`<argument xsi:type="object">Foo\Proxy</argument>`), never
  type-hinted in a constructor.
- [guide] Explicit `sortOrder` on new plugins, chosen after checking existing plugins (`dev:di:info`).
- [guide] Prefer virtual types / `<type><arguments>` over broad preferences. Preferences only for interface
  implementations or a narrowly justified compatibility override, with a comment saying why.
- [guide] Service contracts (`Api/`, `Api/Data/`) for cross-module communication and anything exposed via webapi.
- [guide] Repositories / ResourceModels for persistence; no direct `$model->save()` / `load()` in new code
  unless following an established local pattern.
- [guide] Keep controllers, templates, blocks, GraphQL resolvers, observers and plugins thin; delegate business
  logic to services, action classes, importers, providers or resource models.
- [guide] Controllers implement `HttpGetActionInterface` / `HttpPostActionInterface` instead of extending the
  deprecated `Action` where the surrounding code allows it.

## Code quality

- [rule] Constructor injection only; no setter injection unless the framework contract requires it.
- [rule] `declare(strict_types=1);` in new PHP files. In legacy files match the file's current style. In
  strict files cast values that arrive as strings (DB rows, config, request params) at the boundary, before
  passing them to typed parameters - otherwise they throw `TypeError` at runtime.
- [rule] Native parameter and return types on new/changed methods where the inheritance contract allows it.
- [rule] No `assert()` for runtime checks. Use explicit guards (`instanceof`, null checks) and throw the fitting
  exception: `InvalidArgumentException`, `LocalizedException`, `NoSuchEntityException`, `StateException`.
- [rule] `Magento\Framework\Serialize\Serializer\Json` instead of `json_encode()` / `json_decode()` unless an
  existing API contract requires the native functions.
- [rule] No `@` error suppression. No silent `catch`: log with useful context, or rethrow / convert the exception.
- [rule] No magic methods outside DataObject-style classes.
- [rule] Comments and PHPDoc that state facts about behavior are true (verify them like findings).
- [rule] No debug leftovers (`var_dump`, `die`, commented-out code blocks, temporary logging).
- [guide] Aim for about 10 lines per new or changed method (20 is still fine); when a method grows, extract a
  helper with a concrete domain name. Do not split code only to hit the number.
- [guide] One reason to change per class: separate orchestration from parsing, validation, persistence and
  formatting.
- [guide] Comments explain non-obvious intent (why), not what the code already says.

## Performance

- [rule] No queries inside loops: preload, batch, or map by IDs (no `getById`/`load`/`save` per item on sets).
- [rule] Filter and limit at DB level (collection filters, SearchCriteria, `setPageSize`), never in PHP; no
  unbounded `getCollection()->load()`.
- [rule] Never `cacheable="false"` on a block of a cacheable page - it disables FPC for the whole page.
- [rule] Never call `reindexAll()` or heavy sync/export work from a web request; queue it or run via CLI/cron.
- [rule] External HTTP calls have explicit connect/read timeouts and do not block storefront requests
  (cache, queue, or async). This includes config providers and customer-data sections, which run on every
  checkout / section load.
- [guide] Cache repeated expensive lookups within the request/process when safe (bounded in long-running
  consumers/cron; implement `ResetAfterRequestInterface` for state kept in shared services).
- [guide] Imports and syncs process in batches; threaded/parallel imports are idempotent and safe to re-run.
- [guide] `getSize()` for counts; select only the attributes/columns you need.

## Security

- [rule] Escape all template output with `$escaper` using the context-correct method: `escapeHtml`,
  `escapeHtmlAttr`, `escapeUrl`, `escapeJs`.
- [rule] Validate and normalize user input before persistence or external calls.
- [rule] State-changing frontend actions are POST with form-key validation. Note: the core CSRF validator skips
  the form-key check for AJAX POST requests, so AJAX endpoints validate the form key themselves.
- [rule] New admin routes declare `ADMIN_RESOURCE` and an ACL resource in `acl.xml`; webapi routes declare
  resources in `webapi.xml` (no `anonymous` without a reason).
- [rule] Never log passwords, tokens, auth headers, card data or raw customer PII - not in logs, exceptions
  or responses.
- [rule] Payment customizations use tokenized/vaulted gateway flows; custom code never handles PAN/CVV.
- [rule] Secret config fields use the `obscure` type and the `Encrypted` backend model.
- [guide] File paths from input are validated against an allow-listed directory (no path traversal).

## Repository hygiene

- [rule] New text files are UTF-8 (or ASCII), no BOM; existing files keep their encoding and line endings.
- [rule] `git diff --check` is clean on changed lines.
- [rule] A new module is enabled in `app/etc/config.php` when the project commits that file, and the change set
  contains all its files (no forgotten untracked files).

## Project decisions (set in the project's AGENTS.md / CLAUDE.md)

These differ between teams. If the project does not state a choice, match the surrounding code and mention
the ambiguity in your report instead of picking a side.

- Constructor property promotion: allowed, or explicit properties assigned in the constructor body (core style).
- `readonly` properties and other PHP 8.x syntax: minimum PHP version of the project.
- Third-party customization layout: one wrapper module per vendor module, or grouped modules.
- Commit / branch / PR conventions, ticket references.
- Which coding standard runs in CI (Magento2 phpcs, PHPStan level, PHPMD) and with which exclusions.
