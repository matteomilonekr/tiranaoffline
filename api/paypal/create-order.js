import {
  assertExpectedPricingStage,
  assertPlanAvailability,
  assertTrustedJsonRequest,
  getCustomId,
  getCheckoutToken,
  getInventorySnapshot,
  getPlan,
  getReferenceId,
  getRequestId,
  handleError,
  methodNotAllowed,
  paypalRequest,
  readJsonBody,
  rejectClientPricing,
  sanitizeOrder,
  sendJson,
  validateCustomer,
} from "./_shared.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);

  try {
    assertTrustedJsonRequest(req);
    const body = await readJsonBody(req);
    rejectClientPricing(body);
    const inventory = getInventorySnapshot();
    const plan = getPlan(body.planId, { inventory });
    assertExpectedPricingStage(plan, body.expectedPricingStage);
    assertPlanAvailability(plan, inventory);
    const customer = validateCustomer(body.customer);
    const requestId = getRequestId(req, "create-order");
    const checkoutUrl = new URL("/checkout", "https://www.tiranaoffline.com");
    checkoutUrl.searchParams.set("plan", plan.id);
    const returnUrl = new URL(checkoutUrl);
    const cancelUrl = new URL(checkoutUrl);
    returnUrl.searchParams.set("paypal", "return");
    cancelUrl.searchParams.set("paypal", "cancel");

    const order = await paypalRequest("/v2/checkout/orders", {
      method: "POST",
      requestId,
      preferRepresentation: true,
      body: {
        intent: "CAPTURE",
        payer: {
          name: {
            given_name: customer.firstName,
            surname: customer.lastName,
          },
          email_address: customer.email,
          address: {
            address_line_1: customer.address,
            admin_area_2: customer.city,
            postal_code: customer.postalCode,
            country_code: customer.countryCode,
          },
        },
        purchase_units: [
          {
            reference_id: getReferenceId(plan.id),
            custom_id: getCustomId(plan),
            description: plan.name,
            amount: {
              currency_code: plan.currency,
              value: plan.price,
            },
          },
        ],
        application_context: {
          brand_name: "Scalers+",
          shipping_preference: "NO_SHIPPING",
          user_action: "PAY_NOW",
          return_url: returnUrl.toString(),
          cancel_url: cancelUrl.toString(),
        },
      },
    });

    return sendJson(res, 201, {
      ...sanitizeOrder(order, plan.id),
      checkoutToken: getCheckoutToken(order.id, plan.id),
      requestId,
    });
  } catch (error) {
    return handleError(res, error);
  }
}
