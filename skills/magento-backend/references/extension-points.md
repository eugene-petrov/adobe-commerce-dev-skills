# Choosing an extension point

Order of preference (least invasive first): configuration / `<arguments>` -> observer -> before/after plugin
-> around plugin -> preference. Pick the first one that solves the task cleanly.

## Plugins (interceptors)

- `before` changes arguments, `after` changes the result, `around` wraps the call. Use `around` only when you
  must skip `$proceed()` or need state from both sides; it deepens the stack and hides the original call.
- In an `around` plugin, every path must either call `$proceed(...$args)` or deliberately return without it -
  skipping it silently disables the original method and every plugin with a higher sortOrder.
- Cannot intercept: final classes/methods, non-public methods, static methods, `__construct`/`__destruct`,
  virtual types, objects created before interception is bootstrapped, classes implementing
  `NoninterceptableInterface`.
- A plugin on an interface applies to all implementations; a plugin on a class also applies to subclasses.
  A preference that replaces class X with a class that does not extend X drops X's plugins.
- `sortOrder` controls order among plugins of the same method; check existing plugins with
  `bin/magento dev:di:info "<Class>"` before choosing one.
- Area matters: a plugin in `etc/frontend/di.xml` does not run in cron, CLI, admin or REST.

## Observers

- Use to react to an event the dispatcher already fires, with the payload it passes. Find the dispatch call
  and read what is in the payload and what runs before/after it.
- `*_save_after` runs **inside** the save transaction: an exception rolls the save back, and external side
  effects are not safe there. Use `*_save_commit_after` (or `addCommitCallback()`) for side effects that must
  happen only after commit.
- Model events are named `<_eventPrefix>_<suffix>` - search for `_eventPrefix` to find which entity fires what.
- Observers must be cheap and must not depend on running order relative to other observers of the same event.
- Bulk flows (imports, mass actions, direct SQL, indexers) usually bypass model save events entirely; check
  that the flow you care about actually fires the event.

## Preferences

- Replace a class globally; only one preference per type wins (module sequence decides). Two modules
  preferring the same class is a silent conflict.
- Acceptable for your own interfaces (`Api/` -> implementation) and as a last resort for core classes when a
  plugin cannot reach the behavior (protected method, constructor logic). Document why in a comment.

## Virtual types and type arguments

- Use `<type name="X"><arguments>` to inject a different dependency or config value into one class.
- Use `<virtualType>` to create a configured variant (e.g. a logger with its own handler/file, a collection
  with a different resource) without a PHP class.

## Adding data to entities

- Service-contract entities (order, product, customer, quote): extension attributes declared in
  `etc/extension_attributes.xml`, filled by after-plugins on the repository `get`/`getList`, persisted by a
  plugin on `save` into your own table. Do not add columns to core tables.
- EAV entities: new attribute via data patch (`EavSetupFactory`) when the value is a real attribute of the entity.

## Frontend data from the backend

- Data for templates comes from a ViewModel (`ArgumentInterface`) passed in layout XML, not from a Block
  preference or rewrite.
- Per-customer data goes through `CustomerData` sections (`sections.xml` to invalidate on POST actions), never
  into cached HTML.

## Third-party modules

- Add the vendor module via composer with an exact version; customize it from a separate wrapper module whose
  `module.xml` `<sequence>` lists the vendor module. Create the wrapper only when there is a real customization.
- Before plugging a core flow, check whether a vendor module replaces it (preferences in `vendor/*/etc/di.xml`,
  alternative import adapters, its own controllers) - your plugin may never be reached.
