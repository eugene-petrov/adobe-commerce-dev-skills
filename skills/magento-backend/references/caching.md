# Caching and FPC

## Full page cache (built-in or Varnish/Fastly)

- One `cacheable="false"` block in a page's layout makes the whole page uncacheable. Never add it to layouts
  of category, product, CMS or home pages.
- Cached HTML is shared between customers. Customer-specific data (name, cart, prices per group, verification
  status) goes through `CustomerData` sections (`etc/frontend/sections.xml` lists which POST actions
  invalidate which sections) or AJAX - never into the server-rendered block.
- Pages vary by HTTP context (`Magento\Framework\App\Http\Context`: customer group, store, currency). Adding a
  context value multiplies cache entries - add one only when the page truly differs by it.
- GET controllers must not change state; FPC may serve them without reaching PHP.

## Cache tags and invalidation

- Blocks/ViewModels rendering entity data implement `IdentityInterface::getIdentities()` returning entity tags
  (e.g. `Product::CACHE_TAG . '_' . $id`), so saving the entity purges those pages (FPC and Varnish/Fastly).
- Changes made by direct SQL do not purge anything; clean tags explicitly
  (`Magento\Framework\App\CacheInterface::clean($tags)` or `CacheContext` + `clean_cache_by_tags` event).
- Custom cache: declare a cache type in `etc/cache.xml` with its own tag so it can be cleaned independently;
  serialize with `Serializer\Json`; set a lifetime that matches how stale the data may be.
- Config changes need `cache:clean config`; layout changes `layout` + `full_page`.

## In-request memoization

- Cache repeated lookups in a private array property for the request lifetime. Do not keep it in shared
  services used by long-running consumers/cron unless it is bounded or reset.
