# UI components and Knockout

## Component basics

- `uiClass` < `uiElement` < `uiCollection` / `uiComponent`. Storefront components usually extend `uiComponent`.
- `defaults` holds config merged with the options passed from jsLayout / `x-magento-init`; string templates
  like `'${ $.name }.child'` are resolved on init.
- `tracks: {prop: true}` or `this.observe(['prop'])` makes properties observable. Templates bound to a plain
  property do not update when it changes.
- `imports` (read another component's property), `exports` (push to another), `links` (two-way); `listens`
  for callbacks on changes. Names are registry paths (`'checkout.steps.shipping-step'`) or `${ $.provider }`.
- `uiRegistry.get('name', callback)` waits for a component to exist; prefer it over polling or DOM lookups.
- `this._super()` inside an overridden method calls the parent; without arguments it reuses the current
  call's arguments.

## Templates

- Knockout templates are `.html` files in `view/frontend/web/template/`, referenced as
  `'Vendor_Module/path/name'` (no extension). Theme overrides go to
  `app/design/frontend/<Vendor>/<theme>/<Vendor_Module>/web/template/`.
- `getTemplate()` can switch templates at runtime; call `this._super()` and compare with the original id so other
  overrides keep working.
- Text uses the `i18n` binding or `$t()`; never concatenate HTML from data. `html:` only with trusted content.
- Virtual elements (`<!-- ko if: ... -->`) are fine; keep logic in the component, not in long binding expressions.
- `afterRender` / `mageInit` bindings run per render - keep them idempotent.

## Lifecycle pitfalls

- Components are created when their jsLayout node is reached; a component in a hidden step still initializes.
- Data from `window.checkoutConfig` read at module load time (top-level `var x = window.checkoutConfig...`) is a
  snapshot - if the value can change later (deferred loading, section reload), read it when needed instead.
- `customerData.get(name)` returns an observable that may be empty until the section loads; bind to it instead of
  reading `_latestValue` once.
