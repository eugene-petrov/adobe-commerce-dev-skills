# AGENTS.md (template for a Magento project)

Copy into the project root as `AGENTS.md` (Codex and most agents) and/or reference it from `CLAUDE.md`
(`see AGENTS.md`). Keep only what is true for this project. The magento-* skills treat this file as
higher priority than their generic standards.

## Runtime

- Local environment: <Warden | DDEV | docker-magento | docker compose | native>. Run commands with:
  `<prefix> bin/magento ...` (or set `MAGENTO_EXEC="<prefix>"`).
- PHP version: <8.x>. Magento / Adobe Commerce version: <2.4.x>. Hosting: <Adobe Commerce Cloud | other>.
- Local storefront URL: <https://...>. Admin URL path: <...>.
- Frontend stack: <Luma | Hyva with Luma checkout | Hyva + Hyva Checkout>.

## Project decisions

- Constructor property promotion: <allowed | not allowed - explicit properties like core>.
- `declare(strict_types=1)`: <required in new files | follow the file>.
- Customizing third-party modules: <one wrapper module per vendor module named ... | other>.
- Coding standards in CI: <phpcs Magento2 | PHPStan level N | ESLint config ...>.
- Commit / branch / PR conventions: <e.g. type/TICKET-slug, Conventional Commits>.

## Gotchas

- <Known local quirks: redirects to bypass, caches that need manual clearing, services that are mocked, ...>
