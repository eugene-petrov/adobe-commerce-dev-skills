---
name: magento-architecture
description: Solution design for Magento 2 / Adobe Commerce features before any code is written - maps the existing system (modules, vendor replacements, extension points, data volumes, areas), compares at least two implementation options, and produces a short design record covering extension points, data model, sync vs async processing, caching and FPC impact, failure modes and idempotency, security/PCI, deploy and upgrade safety, observability and rollout. Use when the user asks how to build, design, plan, approach or estimate a Magento feature, integration, import/export, module or refactoring, asks "what is the best way to...", or wants options compared - not for writing the code itself (that is magento-backend / magento-luma-frontend).
---

# Magento 2 solution architecture

The output is a design decision the team can review, not code. Keep it short: one page for a typical feature.
Project instructions (AGENTS.md, CLAUDE.md, README, existing ADRs) win over this skill.

Read `../magento-backend/references/extension-points.md` and `../magento-backend/references/standards.md`
(relative to this skill's directory) - the design must be implementable under those standards. For storefront
parts also read `../magento-luma-frontend/references/standards.md`.

## Process

### 1. Pin down the requirement
Who triggers it (customer, admin, cron, external system), which areas (storefront, admin, REST/GraphQL, CLI),
store/website scope, data volumes (rows, requests per minute, peak), latency expectations, what must never
happen (double charge, lost order, oversell). Ask the user only for what you cannot find in the repository or
the ticket.

### 2. Map the existing system
- Which core/vendor flows the feature touches; open the code of those flows (controllers, services, events).
- Third-party modules that replace or extend those flows (`composer.json`, preferences in `vendor/*/etc/di.xml`,
  `app/code`); their events may differ from core.
- Existing project modules that already solve part of it - extend them instead of adding a parallel one.
- Hot paths affected: category/product pages, cart, checkout, customer sections, indexers, imports.

### 3. Compare options
At least two realistic options (for example: plugin vs observer vs preference; synchronous call vs queue;
new table vs EAV attribute vs extension attribute; server-rendered vs customer-data vs AJAX). For each, one
line on how it works and its cost/risk against the criteria in `references/design-checklist.md`.
Pick one and say why the others lose.

### 4. Write the design record
Use `references/design-record-template.md`. Every claim about current behavior cites the file it comes from.
Mark assumptions explicitly and list what must be verified on a real environment.

### 5. Hand over
List the implementation steps in order (modules/files, patches, config, tests) so that `magento-backend` /
`magento-luma-frontend` can execute them, plus the checks `magento-review` should focus on.

## References

| File | Content |
|---|---|
| `references/design-checklist.md` | Criteria every design is checked against |
| `references/integration-patterns.md` | External systems, imports/exports, sync vs async, idempotency |
| `references/design-record-template.md` | Output template |
