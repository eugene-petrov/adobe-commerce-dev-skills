# Adobe Commerce Cloud specifics

Read only when the project runs on Adobe Commerce Cloud (has `.magento.app.yaml` / `.magento.env.yaml`).

## Deploy phases (ece-tools)

- **Build**: runs without database or services - `composer install`, `setup:di:compile`, optionally static
  content deploy. Code that needs DB/config at compile time breaks the build.
- **Deploy**: maintenance mode, `setup:upgrade` (schema + patches) against the modules enabled in the committed
  `app/etc/config.php`. Long patches and big table alterations extend downtime.
- **Post-deploy**: cache warm-up, maintenance off.

## Consequences for code

- A new module must be listed in the committed `app/etc/config.php`, or it is not installed on deploy.
- Configuration that must be identical across environments can be locked with `bin/magento app:config:dump`
  (writes to `config.php` / `env.php`); locked values cannot be changed in Admin.
- Per-environment values and secrets go to environment variables (`CONFIG__DEFAULT__SECTION__GROUP__FIELD`) or
  the Admin of that environment - never to the repository.
- The filesystem is read-only except `var/`, `pub/media/`, `pub/static/`, `app/etc/`; do not write files
  anywhere else at runtime.
- Cron jobs are configured in `.magento.app.yaml`; queue consumers run through the cron consumers runner
  (`CRON_CONSUMERS_RUNNER` in `.magento.env.yaml`). A consumer that is not in that list does not run.
- Fastly is the full page cache: cache tags (`IdentityInterface`) drive purges; `cacheable="false"` disables
  caching for the page as everywhere else.
- Altering large tables (sales, quote, catalog EAV) during deploy locks them; consider a side table.
