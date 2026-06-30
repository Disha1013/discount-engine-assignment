/**
 * nlRuleParser.js — Natural-language rule adapter
 *
 * Client-side adapter that POSTs to /api/parse-rule and validates the response.
 * The engine never sees this module — it only ever receives a validated DiscountRule.
 * Swapping Gemini for another provider means changing api/parse-rule.js only.
 */

/**
 * Calls the server-side parse-rule endpoint with the user's text.
 * Returns the raw JSON from Gemini (unresolvable object or rule object).
 * Throws on network/server errors.
 */
export async function parseNlRule(text) {
  const res = await fetch('/api/parse-rule', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `Server error: ${res.status}`)
  }

  return res.json()
}

/**
 * Validates a parsed rule object before it's shown to the user for confirmation.
 * Returns { valid: true } or { valid: false, error: string } or { valid: false, unresolvable: true, reason: string }.
 */
export function validateParsedRule(obj) {
  if (!obj || typeof obj !== 'object') {
    return { valid: false, error: 'Invalid response from parser.' }
  }

  if (obj.unresolvable) {
    return {
      valid: false,
      unresolvable: true,
      reason: obj.reason || 'The rule could not be parsed. Please be more specific.',
    }
  }

  const validScopes = ['brand', 'platform', 'cart']
  if (!validScopes.includes(obj.scope)) {
    return { valid: false, error: `Invalid scope "${obj.scope}". Expected brand, platform, or cart.` }
  }

  const validTypes = ['percentage', 'flat']
  if (!validTypes.includes(obj.type)) {
    return { valid: false, error: `Invalid type "${obj.type}". Expected percentage or flat.` }
  }

  if (typeof obj.value !== 'number' || obj.value <= 0) {
    return { valid: false, error: 'Value must be a positive number.' }
  }

  if (obj.type === 'percentage' && obj.value > 100) {
    return { valid: false, error: 'Percentage value must be between 0 and 100.' }
  }

  if (obj.scope === 'cart') {
    if (!obj.minCartValue || typeof obj.minCartValue !== 'number' || obj.minCartValue <= 0) {
      return { valid: false, error: 'Cart rules require a valid minimum cart value.' }
    }
    if (obj.appliesTo != null) {
      return { valid: false, error: 'Cart rules must have appliesTo as null.' }
    }
  } else {
    if (!obj.appliesTo || typeof obj.appliesTo !== 'string' || !obj.appliesTo.trim()) {
      return { valid: false, error: 'Brand/platform rules require a non-empty appliesTo.' }
    }
  }

  return { valid: true }
}
