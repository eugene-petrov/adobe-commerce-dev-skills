# Adobe Commerce Dev Skills

Agent skills for Magento 2 / Adobe Commerce development: backend, Luma frontend (including the Luma checkout
on Hyva stores), solution architecture and evidence-based code review. They work with any agent that reads
`SKILL.md` folders (Claude Code, OpenAI Codex, and others via `--dir`).

The skills contain no project-specific setup. How a project runs (Warden, DDEV, docker-magento, docker compose,
native), its PHP version and its team decisions belong in the project's own `AGENTS.md` / `CLAUDE.md` - see
[templates/AGENTS.project.md](templates/AGENTS.project.md).

## Skills

| Skill | Use it for |
|---|---|
| [magento-backend](skills/magento-backend/) | Writing PHP/XML: extension points, schema and patches, data access, cron/queues/indexers, caching, security. Loads the backend standards before coding and self-checks before hand-off. |
| [magento-luma-frontend](skills/magento-luma-frontend/) | RequireJS/mixins, UI components and Knockout, Luma checkout, customer-data and private content, layout/templates/LESS. |
| [magento-architecture](skills/magento-architecture/) | Designing a feature before code: options, trade-offs, design record, implementation plan. |
| [magento-review](skills/magento-review/) | Reviewing a diff/branch/PR: real execution paths, verified findings only, runtime checks, mechanical checks on changed lines. |
| [magento-exec-shell-cmd](skills/magento-exec-shell-cmd/) | Utility: detects the project runtime and runs `bin/magento`, `php`, phpcs in it. Used by the others. |

Standards are kept in one place each and shared: backend rules in
[magento-backend/references/standards.md](skills/magento-backend/references/standards.md), frontend rules in
[magento-luma-frontend/references/standards.md](skills/magento-luma-frontend/references/standards.md).
Writing skills read them before coding; the review skill applies them to changed lines.

For Hyva themes (Alpine.js, Tailwind, Hyva CMS) use the official
[hyva-themes/hyva-ai-tools](https://github.com/hyva-themes/hyva-ai-tools) skills; `magento-review` applies
their rules when they are installed.

## Install

```bash
git clone https://github.com/eugene-petrov/adobe-commerce-dev-skills.git
cd adobe-commerce-dev-skills

./install.sh --list
./install.sh --all                          # Claude Code, global (~/.claude/skills)
./install.sh --agent codex --all            # Codex, global (~/.agents/skills)
./install.sh --project magento-review       # only into ./.claude/skills of the current project
./install.sh --dir ~/.cursor/skills --all   # any other agent directory
```

Dependencies (`skills/<name>/requires.txt`) are installed automatically. Skills are symlinked, so `git pull`
updates them; use `--copy` when the agent runs in a container that cannot see the clone.

## Runtime detection

`magento-exec-shell-cmd` detects Warden, DDEV, docker-magento and docker compose (service `php-fpm`, `phpfpm`,
`php`, `fpm` or `app`), and falls back to local commands. Any other setup:

```bash
export MAGENTO_EXEC="docker compose exec -T my-php-service"
```

## Sensitive-data guard hook

A hook for Claude Code, Codex and Cursor that stops the agent from reading secrets and customer data by
accident. Needs Node.js.

```bash
./install.sh --hooks --agent claude   # or codex, cursor
```

- **Blocked:** `app/etc/env.php`, `auth.json`, `.env`, private keys and stored credentials.
- **Asks you first:** logs, DB dumps, import/export files, `SELECT` from customer/order tables.
- Instead of `env.php` use `bin/magento config:show <path>` or
  `skills/magento-exec-shell-cmd/scripts/env-redacted.sh`.

It prevents accidents, not attacks: keep production secrets and data out of local copies.
Details, overrides and limits: [hooks/README.md](hooks/README.md).

## Contributing

- One rule, one place: change standards only in the `standards.md` files; other files link to them.
- `[rule]` = must follow (deviation needs a written reason); `[guide]` = judgment call, never a review finding
  by itself.
- No project, client or environment specifics in skills - those go to the project's `AGENTS.md`.
- Every factual claim about Magento behavior should be checked against core code before it is added.
- Keep `description` in `SKILL.md` under 1024 characters and specific about when the skill applies.
