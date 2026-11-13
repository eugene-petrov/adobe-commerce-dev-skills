# Declarative schema and patches

## db_schema.xml

- Declare tables, columns, indexes and constraints in `etc/db_schema.xml`. Name the table with a vendor
  prefix; use `identity="true"` for auto-increment PKs, explicit `nullable`, `unsigned`, lengths and defaults.
- Add indexes for every column used in `WHERE`/`JOIN`/`ORDER BY` of the code that reads the table.
- Foreign keys with explicit `onDelete` (`CASCADE` / `SET NULL` / `NO ACTION`) matching the intended lifecycle.
- After every change regenerate and commit the whitelist:
  `bin/magento setup:db-declaration:generate-whitelist --module-name=Vendor_Module`. Without whitelist
  entries, removals/renames are not applied.
- Rename a column with `onCreate="migrateDataFrom(old_name)"`; plain renaming drops the data.
- `bin/magento setup:upgrade --dry-run=1` writes the planned DDL to `var/log/dry-run-installation.log` - check it
  for unexpected drops.
- Altering large tables (sales, catalog EAV, quote) runs during deploy and can lock the table for minutes;
  flag it and consider a new side table instead.

## Data patches

- Class in `Setup/Patch/Data/` implementing `DataPatchInterface` (`apply()`, `getDependencies()`,
  `getAliases()`); optionally `PatchRevertableInterface`.
- A patch runs once and is recorded in `patch_list` by class name. Renaming the class re-runs it unless the
  old name is in `getAliases()`. Never edit an applied patch - add a new one.
- Make `apply()` idempotent anyway (check before insert, `insertOnDuplicate`): environments differ.
- Wrap with `$this->moduleDataSetup->getConnection()->startSetup()` / `endSetup()`.
- No area code is set during `setup:upgrade`. Code that needs one (emails, some repositories, design/theme)
  must use `State::emulateAreaCode()`.
- Config values: prefer `etc/config.xml` defaults. Use a patch with `WriterInterface::save()` only for values
  that must be forced on existing environments.
- EAV attributes: `EavSetupFactory` / `CustomerSetupFactory`; set scope (`global`/`website`/`store`),
  `used_in_product_listing`, `is_used_in_grid`, etc. deliberately; for customer attributes also add them to forms.
- Large data migrations in a patch run inside the deploy window - batch them, or move them to a CLI command/cron.

## Schema patches

- `Setup/Patch/Schema/` only for what declarative schema cannot express (triggers, data-dependent DDL).
- Schema patches run before data patches.

## Deploy

- `setup:upgrade` runs schema and patches on deploy; anything a patch needs (config, other modules) must exist
  on every environment. Adobe Commerce Cloud specifics: `cloud.md`.
