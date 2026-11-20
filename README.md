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

[hooks/guard-sensitive.js](hooks/guard-sensitive.js) is a `PreToolUse`-style hook for Claude Code, Codex and
Cursor that stops an agent from reading secrets and personal data by accident. It needs Node.js and has no
dependencies.

```bash
./install.sh --hooks --agent claude    # ~/.claude/settings.json
./install.sh --hooks --agent codex     # ~/.codex/hooks.json - then trust the hook when Codex asks
./install.sh --hooks --agent cursor    # ~/.cursor/hooks.json (beforeReadFile / beforeShellExecution / beforeMCPExecution)
./install.sh --uninstall-hooks --agent cursor
```

The installer adds one entry next to the existing hooks and writes `<config>.bak` first; re-running it is a no-op.

What it checks ([hooks/sensitive-patterns.json](hooks/sensitive-patterns.json)):

| Level | What |
|---|---|
| deny | `app/etc/env.php`, `auth.json`, `.env*` (not `.env.example`/`.dist`), private keys, `~/.ssh` keys, stored credentials (`.git-credentials`, `.netrc`, `.my.cnf`, AWS, Docker, gh, magento-cloud) |
| ask | `var/log`, `var/report`, import/export files and backups, `pub/media/customer`, DB dumps (files and `mysqldump`-like commands), `.magento.env.yaml`, registry configs, dumping the whole environment, `SELECT` from customer/order/quote/admin/token tables (except `COUNT(*)`), credential paths in `core_config_data` |

The same rules apply to file tools (Read/Edit/Grep, Cursor file reads and attachments), to shell commands (paths
mentioned anywhere in the command, e.g. `cat`, `php -r 'include ...'`, `grep ... auth.json`) and to MCP tool
arguments that can read something: path-like values, `command` strings and SQL (e.g. a database MCP server).
Text the agent writes is not inspected: chat messages and document bodies sent through MCP, `git commit` /
`git tag` messages, `gh pr|issue` titles and bodies, and heredocs redirected into a file (`cat > f <<EOF`).
Anything the shell would execute inside that text (`$(...)`, backticks, expansion in an unquoted `<<EOF`) is
still checked, and so is a heredoc fed to an interpreter (`php <<EOF`, `cat <<EOF | php`, `mysql <<SQL`).
SQL rules apply to shell commands only when they run a database client (`mysql`, `warden db`, `ddev mysql`,
`psql`, `n98-magerun2 db:query`, ...), so `grep "select ... sales_order" app/code` passes.

"Ask" means: Claude Code and Cursor (shell, MCP) show their own approval prompt. Cursor file reads have no
prompt, so they are denied. Codex has no prompt either: the hook blocks and tells the agent to ask the user and
rerun with `AI_GUARD_ALLOW=1` - this prefix never unlocks a "deny" rule.

Safe alternatives the block messages point to: `bin/magento config:show <path>` (Magento masks sensitive
values) and `skills/magento-exec-shell-cmd/scripts/env-redacted.sh` (prints `env.php` with secrets masked).

Overrides (template: [templates/ai-sensitive.json](templates/ai-sensitive.json); keys `paths`, `piiTables`,
`piiLevel`, `allow` regexes for false positives, `disable` by rule id):
- **Project** - `.ai-sensitive.json` in the repository root. It comes with the repository, so it is not trusted:
  it can add rules and tables, disable only "ask" rules, and its `allow` list lifts only "ask" rules for paths
  inside the project root. A cloned repository cannot unlock `env.php`, `~/.ssh`, credentials or any "deny" rule.
- **User** - `~/.config/ai-sensitive.json` (or the path in `AI_SENSITIVE_CONFIG`). Trusted: can allow or disable
  anything, for every project.

Second layers for the same files:
[templates/claude-settings.deny.json](templates/claude-settings.deny.json) (Claude Code `permissions.deny`) and
[templates/cursorignore](templates/cursorignore) (`.cursorignore`).

Limits - read before relying on it:
- It is a guard against accidents, not a security boundary. Shell commands can be obfuscated (variables, base64,
  scripts written to disk first). Recursive search is not inspected file by file: searching `app/etc` itself
  asks first, but `grep -r password .` over the project root reads whatever is not git-ignored.
- The real protection is not having production secrets and data locally: anonymized database dumps, development
  credentials only, and the agent's OS-level sandbox where available.

Tests: `node hooks/test/run.js` (cases for all three agents in [hooks/test/cases.json](hooks/test/cases.json)).

## Contributing

- One rule, one place: change standards only in the `standards.md` files; other files link to them.
- `[rule]` = must follow (deviation needs a written reason); `[guide]` = judgment call, never a review finding
  by itself.
- No project, client or environment specifics in skills - those go to the project's `AGENTS.md`.
- Every factual claim about Magento behavior should be checked against core code before it is added.
- Keep `description` in `SKILL.md` under 1024 characters and specific about when the skill applies.
