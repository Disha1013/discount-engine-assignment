/**
 * discountEngine.js
 *
 * Pure discount calculation logic. No UI, no side effects.
 * All functions take plain objects and return plain objects.
 *
 * DiscountRule {
 *   ruleId:       string          — "RULE-01"
 *   scope:        "brand" | "platform" | "cart"
 *   appliesTo:    string | null   — brand/platform name; null for cart rules
 *   type:         "percentage" | "flat"
 *   value:        number          — 15 = 15%, or flat rupees
 *   stackable:    boolean
 *   minCartValue: number | null   — cart rules only
 * }
 *
 * CartItem {
 *   itemId:    string
 *   product:   string
 *   brand:     string
 *   platform:  string
 *   basePrice: number
 * }
 *
 * DiscountResult {
 *   itemId, product, brand, platform, basePrice,
 *   finalPrice:    number
 *   totalDiscount: number
 *   appliedRules:  string[]
 *   skippedRules:  string[]
 *   reasoning:     string
 * }
 */

/**
 * Returns true if a brand/platform rule applies to this item.
 * Cart-scoped rules are always excluded from item-level matching.
 */
export function ruleMatchesItem(item, rule) {
  const normalise = (s) => s.trim().toLowerCase()
  if (rule.scope === 'brand') {
    return normalise(item.brand) === normalise(rule.appliesTo)
  }
  if (rule.scope === 'platform') {
    return normalise(item.platform) === normalise(rule.appliesTo)
  }
  return false
}

/**
 * Calculates the rupee discount a rule gives on a given price.
 * Uses the provided price — important for stacking (percentage applies to running price).
 */
export function calculateDiscountAmount(price, rule) {
  if (rule.type === 'percentage') {
    return Math.round(price * rule.value / 100)
  }
  if (rule.type === 'flat') {
    return rule.value
  }
  return 0
}

function ruleToReasoning(rule) {
  const scopeLabel = rule.scope === 'brand' ? 'Brand' : 'Platform'
  if (rule.type === 'percentage') return `${scopeLabel} offer: ${rule.value}% off`
  if (rule.type === 'flat') return `${scopeLabel} offer: Rs.${rule.value} off`
  return `${scopeLabel} offer applied`
}

/**
 * Applies discount rules to a single cart item.
 * Logic:
 *   1. Find matching brand/platform rules.
 *   2. Pick the non-stackable rule with the largest rupee saving.
 *   3. Apply all stackable rules on top of that price.
 */
export function applyDiscounts(item, rules) {
  const matchingRules = rules.filter((r) => ruleMatchesItem(item, r))

  if (matchingRules.length === 0) {
    return {
      itemId: item.itemId,
      product: item.product,
      brand: item.brand,
      platform: item.platform,
      basePrice: item.basePrice,
      finalPrice: item.basePrice,
      totalDiscount: 0,
      appliedRules: [],
      skippedRules: [],
      reasoning: 'No offers available',
    }
  }

  const nonStackable = matchingRules.filter((r) => !r.stackable)
  const stackable = matchingRules.filter((r) => r.stackable)

  let winner = null
  let skipped = []

  if (nonStackable.length > 0) {
    const sorted = [...nonStackable].sort(
      (a, b) =>
        calculateDiscountAmount(item.basePrice, b) -
        calculateDiscountAmount(item.basePrice, a)
    )
    winner = sorted[0]
    skipped = sorted.slice(1)
  }

  let price = item.basePrice
  const appliedRules = []
  const reasoningParts = []

  if (winner) {
    price -= calculateDiscountAmount(price, winner)
    appliedRules.push(winner.ruleId)
    reasoningParts.push(ruleToReasoning(winner))
  }

  for (const rule of stackable) {
    price -= calculateDiscountAmount(price, rule)
    appliedRules.push(rule.ruleId)
    reasoningParts.push(ruleToReasoning(rule))
  }

  const finalPrice = Math.round(price)

  return {
    itemId: item.itemId,
    product: item.product,
    brand: item.brand,
    platform: item.platform,
    basePrice: item.basePrice,
    finalPrice,
    totalDiscount: item.basePrice - finalPrice,
    appliedRules,
    skippedRules: skipped.map((r) => r.ruleId),
    reasoning: reasoningParts.join(' + '),
  }
}

export function processCart(cartItems, rules) {
  return cartItems.map((item) => applyDiscounts(item, rules))
}

export function cartTotal(results) {
  return results.reduce((sum, r) => sum + r.finalPrice, 0)
}

/**
 * Full cart calculation including the cart-level offer (Task 1).
 *
 * Cart logic runs AFTER all item discounts. If cartTotalBeforeOffer >= minCartValue,
 * the cart rule's percentage is applied to the whole total.
 * If threshold not met → cartOffer is null (no cart row rendered in UI).
 *
 * Returns:
 *   itemResults:          DiscountResult[]
 *   cartTotalBeforeOffer: number
 *   cartOffer:            { ruleId, label, saved } | null
 *   finalCartTotal:       number
 */
export function processCartWithCartOffer(cartItems, rules) {
  const itemResults = processCart(cartItems, rules)
  const cartTotalBeforeOffer = itemResults.reduce((sum, r) => sum + r.finalPrice, 0)

  const cartRules = rules.filter((r) => r.scope === 'cart')
  let cartOffer = null
  let finalCartTotal = cartTotalBeforeOffer

  for (const rule of cartRules) {
    if (cartTotalBeforeOffer >= rule.minCartValue) {
      const saved = Math.round(cartTotalBeforeOffer * rule.value / 100)
      finalCartTotal = Math.round(cartTotalBeforeOffer * (1 - rule.value / 100))
      cartOffer = {
        ruleId: rule.ruleId,
        label: `Cart offer: ${rule.value}% off — Rs.${saved.toLocaleString('en-IN')} saved`,
        saved,
      }
      break // first matching cart rule wins
    }
  }

  return { itemResults, cartTotalBeforeOffer, cartOffer, finalCartTotal }
}
