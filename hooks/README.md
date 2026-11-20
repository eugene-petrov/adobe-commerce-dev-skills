# Sensitive-data guard

`guard-sensitive.js` runs before every file read, shell command and MCP call of the agent and blocks or asks
when it touches secrets or customer data. Rules: [sensitive-patterns.json](sensitive-patterns.json).

## Install

```bash
./install.sh --hooks --agent claude            # ~/.claude/settings.json
./install.sh --hooks --agent codex             # ~/.codex/hooks.json, then trust the hook when Codex asks
./install.sh --hooks --agent cursor            # ~/.cursor/hooks.json
./install.sh --uninstall-hooks --agent cursor  # remove
```

Existing hooks are kept; a `<config>.bak` is written before any change.

## Rules

| Level | Paths and commands |
|---|---|
| deny | `app/etc/env.php`, `auth.json`, `.env*` (not `.env.example`), private keys, `~/.ssh` keys, `.netrc`, `.git-credentials`, cloud CLI tokens |
| ask | `var/log`, `var/report`, import/export files, backups, DB dumps and `mysqldump`, `SELECT` from customer/order/quote/admin tables (`COUNT(*)` is fine) |

"Ask" shows the agent's own approval prompt (Claude Code, including auto mode; Cursor shell/MCP). Where there is
no prompt (Codex, Claude Code `bypassPermissions`/`dontAsk`) the agent must ask you in chat and rerun the
command with `AI_GUARD_ALLOW=1`. This never unlocks a "deny" rule.

Not checked as reads: text the agent writes (commit messages, PR bodies, chat messages, `cat > file <<EOF`),
`ls`/`stat`/`test`, the target of `cp`, and the key passed to `ssh -i`. Anything the shell would execute in
that text (`$(...)`, backticks) is still checked.

## Overrides

Same format for both files; see [../templates/ai-sensitive.json](../templates/ai-sensitive.json).

- `~/.config/ai-sensitive.json` (yours, trusted): allow or disable any rule.
- `<project>/.ai-sensitive.json` (comes with the repo, not trusted): may add rules and tables and relax "ask"
  rules inside the project; it can never unlock a "deny" rule.

## Limits

It prevents accidents, not attacks. Obfuscated commands (variables, base64, scripts written first) pass, and
`grep -r password .` over the whole project reads whatever is not git-ignored. Real protection is no production
secrets or data locally.

Extra layers: [../templates/claude-settings.deny.json](../templates/claude-settings.deny.json),
[../templates/cursorignore](../templates/cursorignore).

## Tests

```bash
node hooks/test/run.js
```
