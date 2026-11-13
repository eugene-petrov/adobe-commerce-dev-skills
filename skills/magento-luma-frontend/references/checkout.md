# Luma checkout

## Where the pieces come from

- **jsLayout**: `checkout_index_index.xml` declares the component tree under the `checkout.root` block.
  Dynamic changes (fields per country, conditional components) go to a PHP
  `Magento\Checkout\Block\Checkout\LayoutProcessorInterface` added to the `layoutProcessors` argument of
  `Magento\Checkout\Block\Onepage` in `etc/frontend/di.xml`. Remove a component with `componentDisabled: true`
  rather than deleting nodes other modules may reference.
- **window.checkoutConfig**: built by `Magento\Checkout\Model\CompositeConfigProvider` from every
  `ConfigProviderInterface` in its `configProviders` argument, merged with `array_merge_recursive`. Two
  providers returning the same scalar key produce an array, not an override. The whole config is rendered on
  every checkout page load - keep providers cheap.
- **Quote state**: `Magento_Checkout/js/model/quote` observables (`shippingAddress`, `billingAddress`,
  `shippingMethod`, `paymentMethod`, `totals`). Read and write through models/actions, not the DOM.

## Payment methods

- Renderers are registered in a component pushing to `Magento_Checkout/js/model/payment/renderer-list`
  (`{type: 'method_code', component: '...'}`) and declared in jsLayout under
  `payment > renders > children`. A method without a registered renderer is not shown.
- The method list comes from `paymentService.setPaymentMethods(methods)` - initially from
  `checkoutConfig.paymentMethods`, later from the shipping-information response. Core behavior to preserve:
  a single remaining method is auto-selected, a selected method that disappeared is unselected (vault tokens
  are considered), the free method replaces others on zero totals. Payment modules often wrap it with mixins
  to hide methods - check all mixins on it before adding yours.
- Method-specific config is usually read from `window.checkoutConfig.payment[code]` when the renderer
  initializes. If you defer loading that config, the renderer must not initialize before the data is there
  (keep the method out of the list until it is loaded, then publish the full list again).

## Actions and hooks

- `Magento_Checkout/js/action/set-shipping-information`, `.../place-order`, `.../set-payment-information`,
  `.../select-payment-method` are common mixin targets. Keep their returned promise so loaders, error messages
  and redirects keep working.
- Extra data for the order goes through `extension_attributes` on the payment / address payload with matching
  `extension_attributes.xml` and a backend plugin that persists it.
- `Magento_Checkout/js/model/shipping-save-processor/default` posts shipping information; payment methods and
  totals come back in its response.
- Totals refresh: `Magento_Checkout/js/action/get-totals` or the cart totals processor; avoid parallel
  duplicate totals requests.

## Performance checklist

- No remote API calls in config providers or LayoutProcessors; defer to an AJAX endpoint (POST + form key,
  `Cache-Control: private, no-store`) loaded when the step/method needs it, with a visible loading and retry state.
- Load payment SDKs and maps only when their method/step is shown.
- Keep `checkoutConfig` small: no full product or customer objects.

## Testing

Guest and logged-in, virtual and physical quote, single and multiple payment methods, saved cards (vault),
zero-total order, page reload on the payment step, and a slow/failed network for every new AJAX call.
