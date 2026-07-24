import { ApiError } from "./paypal/_shared.js";

const VALID_COUPON_CODE = /^[A-Z0-9_-]{1,32}$/;

const COUPONS = Object.freeze({
  VIP: Object.freeze({
    code: "VIP",
    discountPercent: 50,
    eligiblePlanIds: Object.freeze(["solo-mid", "solo-full"]),
    active: false,
  }),
  VIP712: Object.freeze({
    code: "VIP712",
    discountPercent: 50,
    eligiblePlanIds: Object.freeze(["solo-mid", "solo-full"]),
  }),
  VIP30: Object.freeze({
    code: "VIP30",
    discountPercent: 30,
    eligiblePlanIds: Object.freeze(["solo-mid", "solo-full"]),
  }),
  VIP20: Object.freeze({
    code: "VIP20",
    discountPercent: 20,
    eligiblePlanIds: Object.freeze(["solo-mid", "solo-full"]),
  }),
  VIP10: Object.freeze({
    code: "VIP10",
    discountPercent: 10,
    eligiblePlanIds: Object.freeze(["solo-mid", "solo-full"]),
  }),
  SOLO10: Object.freeze({
    code: "SOLO10",
    discountPercent: 10,
    eligiblePlanIds: Object.freeze(["solo-mid", "solo-full"]),
  }),
  SOLO20: Object.freeze({
    code: "SOLO20",
    discountPercent: 20,
    eligiblePlanIds: Object.freeze(["solo-mid", "solo-full"]),
  }),
  SOLOFREEPASS: Object.freeze({
    code: "SOLOFREEPASS",
    discountPercent: 100,
    eligiblePlanIds: Object.freeze(["solo-mid"]),
    notApplicableMessage: "Questo coupon è valido solo per il Workshop Pass.",
  }),
});

function formattedCurrencyFromCents(cents) {
  return `€ ${(cents / 100).toLocaleString("it-IT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    useGrouping: true,
  })}`;
}

export function normalizeCouponCode(value) {
  const code = String(value || "")
    .normalize("NFKC")
    .trim()
    .toUpperCase();
  if (!code) return "";
  if (!VALID_COUPON_CODE.test(code)) {
    throw new ApiError(400, "INVALID_COUPON", "Il codice coupon non è valido.");
  }
  return code;
}

export function applyCouponToPlan(plan, rawCouponCode, options = {}) {
  const couponCode = normalizeCouponCode(rawCouponCode);
  if (!couponCode) return plan;

  const coupon = COUPONS[couponCode];
  if (!coupon || (coupon.active === false && options.allowInactive !== true)) {
    throw new ApiError(400, "INVALID_COUPON", "Il codice coupon non è valido.");
  }
  if (!coupon.eligiblePlanIds.includes(plan?.id)) {
    throw new ApiError(
      409,
      "COUPON_NOT_APPLICABLE",
      coupon.notApplicableMessage ||
        "Questo coupon è valido solo per i ticket individuali Workshop e Builder.",
    );
  }

  const originalCents = Math.round(Number(plan.price) * 100);
  if (!Number.isSafeInteger(originalCents) || originalCents < 0) {
    throw new ApiError(500, "INVALID_PLAN_PRICE", "Configurazione prezzo non valida.");
  }
  const discountedCents = Math.round(
    originalCents * (100 - coupon.discountPercent) / 100,
  );
  const discountCents = originalCents - discountedCents;

  return {
    ...plan,
    originalPrice: plan.price,
    originalPriceFormatted: plan.priceFormatted,
    price: (discountedCents / 100).toFixed(2),
    priceFormatted: formattedCurrencyFromCents(discountedCents),
    discountAmount: (discountCents / 100).toFixed(2),
    discountAmountFormatted: formattedCurrencyFromCents(discountCents),
    coupon: {
      code: coupon.code,
      discountPercent: coupon.discountPercent,
    },
  };
}
