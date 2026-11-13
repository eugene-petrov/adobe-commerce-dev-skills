---
name: magento-review
description: Evidence-based code review and refactoring plan for Magento 2 / Adobe Commerce changes (PHP, XML, layout, templates, Luma JS/Knockout/checkout, Hyva) - maps the real execution paths (events, plugins, preferences, cron, consumers, mixins, third-party replacements), verifies every candidate finding against core/vendor code with file:line evidence, separates runtime-dependent risks, and runs mechanical checks (php -l, phpcs Magento2, encoding, whitespace, grep hints) on changed lines only. Use when the user asks to review, audit or check Magento changes, a diff, a branch, a task or a pull request before merge.
---

# Magento 2 code review

Arguments: $ARGUMENTS
(If the line above shows a literal placeholder or is empty, take the task description and base ref from the
user's message; with none given, review uncommitted + untracked work against HEAD.)

The goal is a short list of findings the author can trust and act on - not a long list of plausible-sounding
remarks. A wrong finding is worse than a missing one: it costs the author time to disprove and destroys trust
in the rest of the review. Every finding must survive verification against real code before it is reported.

The review is read-only: do not edit code or run state-changing git commands unless the user asks. Refactoring
goes into the Plan section.

Paths below are relative to this skill's directory.

## Process (follow in order)

### 0. Mechanical pass
From the repository root run `scripts/collect-changes.sh [base-ref]` (base ref defaults to `HEAD`, i.e.
uncommitted + untracked work; pass the target branch, e.g. `origin/main`, to review a whole branch). It prints
the change set, encoding/BOM/CRLF problems, `git diff --check`, `php -l`, phpcs (Magento2 standard, changed
lines only) and grep hints on added lines. It runs PHP in the project's runtime via `magento-exec-shell-cmd`
(override with `MAGENTO_EXEC`). Hints are leads, not findings - verify them.

### 1. Understand the task
- If a task description is given (ticket, link, file, PR description), read it first: what is fixed, what
  outcome is expected, what is in/out of scope. Without one, say so and review the code on its own merits.
- Read every changed file in full - not only the hunks. Include untracked files.

### 2. Map the real execution paths
Before judging the code, establish how it is actually reached in THIS project:
- Which controllers/events/plugins/preferences/cron/consumers/CLI/API/JS mixins trigger it, and in which
  area. Open the dispatching core code and read the surrounding lines: what runs before/after,
  inside/outside transactions, what data is in the payload and what was already filtered/validated/mapped.
- Check for third-party replacements of the core path (alternative import adapters, preferences, rewrites,
  vendor modules with their own implementation of the same flow, other mixins on the same JS module, theme
  overrides of the template). Verify whether each alternative behaves the same.
- Read the collaborators the new code calls: their exceptions, failure modes, return shapes, and any existing
  recovery mechanisms (retry queues, failed-status logs, cron re-processing).

Tracing recipes (dispatchers, effective DI, transaction boundaries, flows that bypass events, JS mixin order,
runtime checks) are in `references/verification.md`.

### 3. Draft candidate findings
Draft freely, but treat each one as a hypothesis, not a finding.

### 4. Verify every candidate - mandatory
For each candidate, before it goes into the output:
- **Trace the concrete scenario through code.** Name the input, walk it through the actual framework/vendor
  code (open it - do not rely on memory of how Magento "usually" works), and confirm the wrong outcome.
- **Try to disprove it.** Look specifically for the guard that makes the scenario impossible: upstream
  validation, uniqueness rules, collation/case handling, transaction boundaries, rows dropped before they
  reach this code, existing retry/recovery. If you find one, drop the finding.
- **Check preconditions are real in this project** (the module/importer/config is installed and used). If the
  outcome depends on runtime data or external API behavior, check the local environment first (database,
  CLI, logs - through the project's runtime). Only what cannot be settled locally becomes a "Needs runtime
  check" item with the exact query/command/scenario to run elsewhere.
- **Check it is in scope** of the task; pre-existing behavior or unrelated design debates are not findings of
  this diff (mention at most as a one-line follow-up).
- **Severity reflects verified impact**, not theoretical worst case (scale in `references/verification.md`).

Every statement of fact in the output must be backed by a `file:line` opened in this session. If it cannot be
backed, verify it or label it explicitly as unverified. Never present an assumption as fact.

### 5. Checklist pass (secondary)
Apply to lines ADDED or CHANGED by this diff only:
- PHP/XML: `../magento-backend/references/standards.md`
- Luma layout/templates/JS/LESS: `../magento-luma-frontend/references/standards.md`
- Hyva templates / Alpine.js / Tailwind: the rules of the installed Hyva skills (e.g. `hyva-alpine-component`),
  if available
- Project rules from AGENTS.md / CLAUDE.md (they win over the generic standards)

A checklist violation is a finding only if it causes a verified defect; otherwise it is a one-line checklist
note. Never pad the review with it.

## Output format

### Findings - verified defects only, most severe first
```
[SEVERITY][CATEGORY] path/File.php:42
Scenario: concrete input -> path through code -> wrong outcome
Evidence: file:line references proving each step (including vendor/core code)
Fix: concrete change
```
Severity: BLOCKER / MAJOR / MINOR. If there are no verified defects, say so plainly.

### Needs runtime check
Items whose outcome depends on data/behavior not visible in code (environment DB, external API responses,
browser behavior). For each: the risk, why code alone can't settle it, and the exact SQL/CLI/scenario.

### Checklist notes
One line each, changed lines only. Style-only remarks go here, never in Findings. Include the mechanical pass
result (lint/phpcs/encoding) in one or two lines.

### Scope check
Does the diff cover everything the task asks for? List missing parts (template changes for a new ViewModel,
config.php entry, whitelist, patch, sections.xml entry, translations) and repository hygiene issues
(unstaged/untracked files, encoding changes, unrelated changes mixed in).

### Plan
Before merge: verified BLOCKER/MAJOR findings + runtime checks that gate the merge.
Follow-up: everything else.

Keep it short. Do not list findings dropped during verification, and do not pad with generic advice.
