# Magento 2 Luma frontend standards

Single source of truth for writing Luma-stack frontend code (`magento-luma-frontend`) and reviewing it
(`magento-review`, changed lines only). Labels: **[rule]** - follow, deviations need a written reason;
**[guide]** - judgment call, never a review finding by itself.

## JavaScript and RequireJS

- [rule] Every module is an AMD `define([...], function (...) {...})` with explicit dependencies; no globals
  except `window.checkoutConfig` and other documented Magento globals.
- [rule] Extend core/vendor JS with mixins (`config.mixins` in `requirejs-config.js`) or `map`; never copy a
  core file into a theme to change a few lines when a mixin works.
- [rule] A mixin returns the same kind of thing it receives: a wrapped function / object for plain modules
  (`mage/utils/wrapper`), `target.extend({...})` for UI components, `$.widget(name, target, {...})` +
  `return $[ns][name]` for jQuery widgets. Call the original (`original()`, `this._super()`) unless skipping it
  is the point, and say so in a comment.
- [rule] A wrapper preserves the original's return value and arguments contract.
- [rule] No `deps` in `requirejs-config.js` for code needed on one page only - it loads on every page. Load
  heavy libraries lazily with `require([...])` at the moment they are needed.
- [rule] No synchronous AJAX (`async: false`) on new code.
- [rule] AJAX calls that change state are POST with `form_key`; handle failure (timeout, non-2xx) visibly
  instead of failing silently.
- [rule] No `console.log` / `debugger` left in committed code.
- [guide] Use `'use strict';`, small functions, and the Magento JS coding standard (ESLint config of the project).

## UI components and Knockout

- [rule] State that templates read is observable (`tracks`, `this.observe(...)`, `ko.observable`); mutating a
  plain property does not re-render.
- [rule] Do not read DOM state to make decisions that a model already knows (quote, customer, checkoutConfig).
- [rule] Bindings in `.html` templates use `i18n`/`$t` for text and never build HTML strings from data
  (`html:` binding only with escaped/trusted content).
- [guide] Prefer `imports`/`exports`/`links` and the registry over reaching into other components directly.

## Checkout

- [rule] Data that is the same for every visitor of a store view can go to `window.checkoutConfig`;
  per-customer data that changes without a page load goes to customer-data sections or a dedicated endpoint.
- [rule] Config providers and LayoutProcessors are on the checkout critical path: no remote API calls, no heavy
  collections; defer expensive data to an AJAX endpoint loaded when needed.
- [rule] Payment method changes keep `Magento_Checkout/js/model/payment-service.setPaymentMethods()` semantics
  (method list, auto-selection, vault), and every renderer stays registered via `renderer-list`.
- [rule] Place-order customizations hook the action/model with a mixin and keep the returned promise
  (`$.Deferred` / jqXHR) so error handling and the loader keep working.

## Private content and caching

- [rule] Never render customer-specific data into server HTML of a cacheable page; use sections or AJAX.
- [rule] Every POST action that changes data shown in a section is listed in `etc/frontend/sections.xml`.
- [rule] Never `cacheable="false"` on a block of a cacheable page.

## Templates, layout, CSS

- [rule] Escape every output with the context-correct `$escaper` method. JSON config comes from a serializer:
  in `data-mage-init` attributes escape it with `escapeHtmlAttr`; inside `<script type="text/x-magento-init">`
  make sure user-controlled strings cannot close the tag (encode with `JSON_HEX_TAG`, or escape the values
  before serializing).
- [rule] Inline scripts use `$secureRenderer->renderTag()` (CSP) and new external domains are declared in
  `etc/csp_whitelist.xml`.
- [rule] Extend layouts with `referenceBlock`/`referenceContainer`, `move`, `remove="true"`; override a layout
  file completely only with a reason.
- [rule] LESS goes to the theme's `_extend.less` / module `_module.less` using the Magento UI library variables
  and mixins (`.lib-*`, `.media-width()`); no `!important` without a reason.
- [guide] Translatable strings via `__()` in PHP/phtml and `$t` / `i18n` in JS/HTML, with entries in the
  module/theme `i18n/*.csv`.
- [guide] Images have width/height or aspect-ratio to avoid layout shift; below-the-fold images lazy-load.
