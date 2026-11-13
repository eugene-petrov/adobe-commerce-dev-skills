# Design record template

```markdown
# <Feature name> - design

Status: proposed | accepted | superseded   Date: <YYYY-MM-DD>   Ticket: <link or id>

## Context
What is needed and why; who triggers it; areas and scopes; volumes; constraints that must never be violated.

## Current behavior
How the relevant flows work today, with file references (core, vendor, project modules). Third-party
replacements of core flows.

## Options
1. <Option A> - how it works; pros; cons/risks.
2. <Option B> - ...
(3. <Option C> ...)

## Decision
Chosen option and why the others lose (one paragraph).

## Design
- Modules and extension points (area-specific di.xml/events.xml, layout, jsLayout).
- Data model (tables/attributes/config paths, indexes, migrations/patches).
- Processing (sync/async, cron/queue, idempotency, retries, locking).
- Caching and FPC (tags, sections, endpoints).
- Security (ACL, form keys, PII, secrets).
- Configuration and feature flag (scope, default).

## Risks and open questions
Assumptions to verify on a real environment, with the exact query/command or scenario.

## Implementation plan
Ordered steps with files; tests to write; what the reviewer should focus on.

## Rollout
Deploy steps, data migration duration, enablement per store/website, rollback.
```
