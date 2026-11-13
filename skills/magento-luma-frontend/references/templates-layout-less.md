# Layout XML, templates, CSP, LESS, translations

## Layout XML

- Handles: `default`, `catalog_product_view`, `catalog_product_view_type_<type>`, `checkout_index_index`,
  `customer_account`, etc. Put changes in the narrowest handle.
- Extend with `referenceBlock` / `referenceContainer`, `move`, `remove="true"`, `<arguments>`; pass data to
  templates with a ViewModel argument (`xsi:type="object"` of an `ArgumentInterface`).
- A ViewModel attached in layout does nothing until the template (or its theme override) uses it - check the
  template that is actually rendered in the theme fallback.
- `cacheable="false"` disables FPC for the whole page (see `private-content.md`).

## Templates (.phtml)

- `$escaper` is available in templates: `escapeHtml`, `escapeHtmlAttr`, `escapeUrl`, `escapeJs`, `escapeCss`.
  Pick by context: text node, attribute, URL, JS string, CSS value.
- No business logic or data loading in templates; ask the ViewModel/block.
- JS initialization: `data-mage-init='<?= $escaper->escapeHtmlAttr($json) ?>'` on an element, or
  `<script type="text/x-magento-init">` with a selector map. Both run through `mage/apply` after DOM ready;
  do not depend on execution order between independent initializers.
- Inline `<script>` / `style` / event handlers: render with `$secureRenderer->renderTag(...)` /
  `renderEventListenerAsTag(...)` so CSP nonces/hashes apply. New third-party domains go to
  `etc/csp_whitelist.xml`.

## LESS

- Theme: `web/css/source/_extend.less` (additions), `_theme.less` (variables); module styles in
  `view/frontend/web/css/source/_module.less`, `_widgets.less`.
- Use the Magento UI library: variables (`@color-*`, `@font-*`, `@indent__*`) and mixins (`.lib-button()`,
  `.lib-font-size()`), responsive blocks with `.media-width(@extremum, @break)`.
- No `!important` without a reason; no IDs in selectors for styling.
- Server-side compilation in production; in developer mode clear `var/view_preprocessed` and the theme's
  `pub/static` after changes when styles do not update.

## Translations

- PHP/phtml: `__('Text %1', $value)`; JS: `$t('Text')` from `mage/translate`; KO templates: `i18n` binding or
  `<translate args="'Text'"/>`.
- Entries in `i18n/<locale>.csv` of the module or theme; JS strings reach the browser through
  `js-translation.json`, generated during static deploy.
