# RequireJS and mixins

## requirejs-config.js

Lives in `view/frontend/requirejs-config.js` of a module or `app/design/frontend/<Vendor>/<theme>/requirejs-config.js`
(and `<theme>/<Module_Name>/requirejs-config.js`). All files are merged into one `requirejs-config.js` per theme
and locale - a syntax error in one breaks the whole storefront.

```js
var config = {
    map: {
        '*': {'Vendor_Module/js/old': 'Vendor_Module/js/new'},          // replace a module for everyone
        'Some_Module/js/consumer': {'Some_Module/js/dep': 'My_Module/js/dep'} // replace only for one consumer
    },
    paths: {'slick': 'Vendor_Module/js/lib/slick.min'},                  // alias a path
    shim: {'slick': {deps: ['jquery']}},                                 // non-AMD libraries
    config: {
        mixins: {
            'Magento_Checkout/js/model/payment-service': {'Vendor_Module/js/model/payment-service-mixin': true}
        }
    }
};
```

- `map` applies to normalized module IDs, including relative dependencies (`./leaflet` inside the consumer).
  A scoped map (`'Consumer/id': {...}`) changes the dependency only for that consumer - inside your replacement
  module the original ID still resolves to the original file.
- Several mixins on the same module are applied in module load order (module sequence, then theme). Outermost
  wrapper = last applied. Check other mixins on the same target before relying on order.
- `deps` loads modules on every page - avoid it for page-specific code.

## Mixin shapes

Plain module returning an object of functions:
```js
define(['mage/utils/wrapper'], function (wrapper) {
    'use strict';
    return function (target) {
        target.setPaymentMethods = wrapper.wrap(target.setPaymentMethods, function (original, methods) {
            // before
            var result = original(methods);
            // after
            return result;
        });
        return target;
    };
});
```

Module returning a function (e.g. an action): wrap the function itself and return the wrapper:
```js
return function (placeOrderAction) {
    return wrapper.wrap(placeOrderAction, function (original, paymentData, messageContainer) {
        return original(paymentData, messageContainer); // keep the returned promise
    });
};
```

UI component (uiComponent / uiElement / uiClass):
```js
return function (Component) {
    return Component.extend({
        initialize: function () {
            this._super();            // with no arguments, _super receives the original call's arguments
            return this;
        }
    });
};
```

jQuery widget:
```js
return function (widget) {
    $.widget('mage.catalogAddToCart', widget, {
        _create: function () { this._super(); }
    });
    return $.mage.catalogAddToCart;
};
```

## Lazy loading heavy code

Do not list big libraries (maps, sliders, video players, SDKs) as top-level dependencies of modules that run on
every page. Load them when needed:

```js
open: function () {
    require(['Vendor_Module/js/heavy-lib'], function (Lib) { /* ... */ }, function (err) {
        // undef the failed module so the next attempt can retry the download
        window.requirejs.undef('Vendor_Module/js/heavy-lib');
    });
}
```

When a caller calls methods on an object before the lazy part is loaded, queue the calls and replay them in
order after loading, preserving the original object's interface.

## Debugging

- `require.s.contexts._.config` shows the merged config in the browser console.
- "Script error for X" -> 404 or syntax error in X; "mismatched anonymous define" -> a non-AMD file loaded
  without `shim` or loaded twice.
- After changing `requirejs-config.js`, clear the theme's `pub/static` and `var/view_preprocessed` (developer
  mode) or redeploy static content.
