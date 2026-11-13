# Private content under full page cache

Cached HTML is shared by all visitors of a store view (varied by HTTP context: customer group, currency,
store). Anything specific to one customer or one cart must be loaded separately.

## Customer-data sections

- Backend: a class implementing `Magento\Customer\CustomerData\SectionSourceInterface::getSectionData()`,
  registered in `etc/frontend/di.xml` in the `sectionSourceMap` argument of
  `Magento\Customer\CustomerData\SectionPoolInterface`.
- Frontend: `customerData.get('section-name')` returns an observable; `customerData.reload(['name'], false)`
  forces a reload; `customerData.invalidate(['name'])` marks it stale.
- `etc/frontend/sections.xml` maps POST actions (`<action name="checkout/cart/add">`) to sections they
  invalidate; the next page load or AJAX completion reloads them. A POST action missing here leaves stale data.
- Sections are cached in localStorage with a lifetime (`customer/online_customers/section_data_lifetime`,
  60 minutes by default) and reloaded on expiry, on invalidation, or when missing.
- `getSectionData()` runs on every section load - no remote calls, no heavy queries; cache-only lookups with a
  safe fallback are fine, but make sure something warms that cache.

## Choosing the data source

| Data | Source |
|---|---|
| Same for all visitors of a store view | server-rendered HTML / `checkoutConfig` |
| Per customer or cart, changes on actions | customer-data section |
| Expensive, needed only on interaction | dedicated AJAX endpoint (POST + form key, `no-store`) |

## Form keys

- On cacheable pages the form key is set from the `form_key` cookie by JavaScript; templates still output
  `$block->getBlockHtml('formkey')` or `getFormKey()` for forms.
- POST controllers implementing `HttpPostActionInterface` get CSRF validation from core for normal form posts;
  AJAX (`X-Requested-With: XMLHttpRequest`) POSTs skip that check - validate the form key in the controller.

## Never

- `cacheable="false"` on a block of a cacheable page (disables FPC for the whole page).
- Customer name, cart contents, prices per customer, or verification status rendered into cached HTML.
- GET requests that change state (they can be cached or prefetched).
