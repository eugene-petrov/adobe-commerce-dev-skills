---
name: magento-exec-shell-cmd
description: Utility for running commands (bin/magento, php, composer, phpcs, phpunit, mysql) in a Magento / Adobe Commerce project's own runtime - detects Warden, DDEV, docker-magento, docker compose or a local install and returns the command prefix, with a MAGENTO_EXEC override for any other setup. Use it before running any project command in a Magento repository, and from other magento-* skills that need to execute commands.
---

# Run commands in the project's Magento runtime

Every team runs Magento differently. Never assume a tool (Warden, DDEV, a container name, a host name);
detect it, or use what the project's AGENTS.md / CLAUDE.md / README says.

## Detect once per session

From the Magento root (the directory with `bin/magento`):

```bash
<this-skill-dir>/scripts/detect_env.sh
```

Output:
```
env=warden|ddev|docker-magento|docker-compose|local|override
wrapper=<prefix or empty>
```

Then run commands as `<wrapper> <command>`, or simply through the helper:

```bash
<this-skill-dir>/scripts/run.sh bin/magento cache:clean config
<this-skill-dir>/scripts/run.sh php -l app/code/Vendor/Module/Model/Foo.php
<this-skill-dir>/scripts/run.sh vendor/bin/phpcs --standard=Magento2 app/code/Vendor/Module
```

## Rules

- If the project documents its own way (AGENTS.md, Makefile targets, scripts), use that instead.
- If detection is wrong, ask the user once and suggest setting `MAGENTO_EXEC`, e.g.
  `export MAGENTO_EXEC="docker compose exec -T php"`. The override wins over detection.
- Database access goes through the project's own tool (`warden db connect`, `ddev mysql`,
  `bin/mysql`, `mysql` with credentials from `app/etc/env.php`). Read-only queries unless the user asks.
- In a sandboxed agent the Docker socket may be unavailable; a "Docker is not running" message is not proof.
  Report the real error and ask for the permission instead of falling back silently to host PHP.
- Host PHP may differ from the project's PHP version; prefer the project runtime for `php -l`, phpcs and tests.
