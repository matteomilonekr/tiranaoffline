import {
  CURRENCY,
  getInventorySnapshot,
  getPayPalConfig,
  getPlan,
  getPlans,
  getQueryParam,
  handleError,
  methodNotAllowed,
  sendJson,
} from "./_shared.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return methodNotAllowed(res, ["GET"]);

  try {
    const config = getPayPalConfig();
    const inventory = getInventorySnapshot();
    const planId = getQueryParam(req, "plan").trim();
    const publicConfig = {
      configured: config.configured,
      environment: config.environment,
      clientId: config.clientId || null,
      currency: CURRENCY,
      sdkUrl: config.sdkUrl,
      components: ["card-fields", "paypal-payments"],
      inventory,
      pricingPolicy: {
        mode: "deadline",
        rule: "deadline-only",
        automaticInventory: false,
      },
    };

    if (planId) {
      return sendJson(res, 200, { ...publicConfig, plan: getPlan(planId, { inventory }) });
    }

    return sendJson(res, 200, { ...publicConfig, plans: getPlans({ inventory }) });
  } catch (error) {
    return handleError(res, error);
  }
}
