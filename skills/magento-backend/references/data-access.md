# Data access

## Repositories and SearchCriteria

- Use the entity's repository (`ProductRepositoryInterface`, `OrderRepositoryInterface`, ...) with
  `SearchCriteriaBuilder` (+ `FilterBuilder`/`FilterGroupBuilder` for OR groups, `SortOrderBuilder`).
- `getList()` returns everything that matches - always set a page size for open-ended filters.
- `get()`/`getById()` throw `NoSuchEntityException`; catch it where "not found" is a normal outcome.
- `ProductRepository` keeps an in-memory instance cache: repeated `get()` returns the same object; pass
  `forceReload = true` when you need fresh data after a direct DB change.
- `ProductRepository::save()` in a store context other than admin writes store-scoped values for the saved
  attributes. For global changes set the store to 0, or update one attribute with
  `$product->getResource()->saveAttribute($product, 'code')` / `Product\Action::updateAttributes()`.

## Collections

- Filter in SQL: `addFieldToFilter` (flat) / `addAttributeToFilter` (EAV); select only what you need
  (`addAttributeToSelect(['name', 'sku'])`, not `'*'`).
- `getSize()` runs a COUNT query; `count()` loads every row.
- Large sets: page through with `setPageSize()` + `setCurPage()` and `clear()` between pages, or
  `Magento\Framework\Model\ResourceModel\Iterator::walk()`, or a select in a ResourceModel fetched in batches.
- A collection loads once; adding filters after `load()` has no effect.
- EAV collections need `setStoreId()` / `addStoreFilter()` to get store values; default is admin (0) values.

## ResourceModel / direct SQL

- Raw SQL only in ResourceModels: `$connection->select()->from(...)->where('col = ?', $value)`; never
  concatenate input into SQL.
- Bulk writes: `insertMultiple()`, `insertOnDuplicate($table, $rows, $updateColumns)`, `update()`/`delete()`
  with bound conditions - one query per batch, not per row.
- Use `getTable()` for table names (prefix support).
- Direct SQL bypasses model events, plugins on repositories and cache invalidation; reindex/invalidate
  explicitly if the data feeds an indexer or cache.

## Transactions

- `$connection->beginTransaction()` / `commit()` / `rollBack()` in try/catch/finally; nested calls only
  increase a counter - the real commit happens at level 0.
- `TransactionFactory` saves several models atomically.
- Keep transactions short; no HTTP calls, sleeps or queue publishing to AMQP inside them.

## Data facts that break "obvious" logic

- Default MySQL collations used by Magento are case-insensitive: `'ABC' = 'abc'`, and unique keys treat them as
  equal. Uniqueness checks in PHP must match that.
- Store scope: `store_id = 0` is the default (admin) value; store-level rows override it. "Value missing for
  store X" usually means "falls back to 0".
- Product IDs: Adobe Commerce (staging) uses `row_id` as the link field for EAV tables, `entity_id` elsewhere;
  use `MetadataPool` to get the link field instead of hardcoding it.
