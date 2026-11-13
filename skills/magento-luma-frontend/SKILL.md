---
name: magento-luma-frontend
description: Magento 2 / Adobe Commerce Luma-stack frontend development - RequireJS modules and mixins, Knockout and UI components, checkout (jsLayout, LayoutProcessor, window.checkoutConfig, payment renderers, quote / payment-service models), customer-data sections and private content under full page cache, x-magento-init, layout XML and templates, LESS themes, translations and frontend performance. Use whenever writing or changing frontend code in a Luma-based theme or module, including the Luma checkout used on Hyva storefronts (requirejs-config.js, view/frontend/web/js, web/template/*.html, .phtml, layout XML, .less, sections.xml, checkout_index_index.xml). For Hyva (Alpine.js / Tailwind) code use the Hyva skills instead.
---

# Magento 2 Luma frontend developer

Project instructions (AGENTS.md, CLAUDE.md, README) win over this skill. Follow how the repository's theme and
modules already do things before introducing a new pattern.

Hyva templates (Alpine.js, Tailwind, `hyva.config.json`) are out of scope: use the official Hyva skills
(`hyva-alpine-component`, `hyva-render-media-image`, ...) for those. Many Hyva stores still run the Luma
checkout - that checkout is in scope here.

## Step 0 - load the standards (mandatory)

Read `references/standards.md` (relative to this skill's directory) in full before writing code. For backend
parts of the change (config providers, controllers, ViewModels, layout processors) also follow
`magento-backend`.

## Step 1 - understand before writing

1. **Find what renders the thing you change**: layout handle and block (`bin/magento dev:template-hints:enable`
   or the layout XML), the template, the JS component (`data-mage-init`, `x-magento-init`, jsLayout node) and
   every theme override in the fallback chain (`app/design/frontend/<Vendor>/<theme>/<Module_Name>/...`).
2. **Find existing mixins and overrides** of the JS module you touch: grep every `requirejs-config.js` in
   `app/code`, `app/design` and `vendor` for its module ID (mixins, `map`, `paths`). Mixin order follows
   module load order; a theme `map` can replace the file you edit.
3. **Find where data comes from**: `window.checkoutConfig` (PHP config providers), customer-data sections
   (AJAX, per customer), block JSON config in the template, or a REST/GraphQL call. Pick the source by how
   private and how dynamic the data is (`references/private-content.md`).
4. **Pick the extension mechanism**: mixin > `map` replacement > theme override of the whole file. Override a
   whole file only when no mixin point exists, and say why.

## Step 2 - write, using the guide that matches the task

| File | When |
|---|---|
| `references/requirejs-and-mixins.md` | requirejs-config.js, mixins for functions / UI components / jQuery widgets, `map`, lazy loading |
| `references/ui-components-and-ko.md` | uiComponent/uiElement, defaults, imports/exports/links, Knockout templates and bindings |
| `references/checkout.md` | jsLayout, LayoutProcessor, checkoutConfig, payment and shipping JS, quote models, place-order |
| `references/private-content.md` | Full page cache, customer-data sections, sections.xml, form keys |
| `references/templates-layout-less.md` | Layout XML, templates and escaping in JS contexts, x-magento-init, CSP, LESS, translations |

## Step 3 - apply and verify

Run commands through the project's runtime (see `magento-exec-shell-cmd`).

- Changed `requirejs-config.js`, added a JS/HTML file or a LESS file: in developer mode clear
  `pub/static/frontend/<Vendor>/<theme>/` and `var/view_preprocessed/` for the theme (or run the project's
  static-content script); in production mode run `setup:static-content:deploy`.
- Changed layout XML: `bin/magento cache:clean layout full_page`.
- Verify in the browser with the cache warm (FPC on) and as both guest and logged-in customer; check the
  console for RequireJS errors (`Script error for`, `mismatched anonymous define`) and the network tab for
  failed section/config requests.
- On checkout, test every step: shipping address, shipping method, payment method list, place order, and a
  reload in the middle of checkout.

## Step 4 - self-check before handing off (mandatory)

Run `../magento-review/scripts/collect-changes.sh` (relative to this skill) if `magento-review` is installed,
then walk the diff once against every `[rule]` in `references/standards.md`. Report deviations and what you
could not verify in a browser.
