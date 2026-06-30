/**
 * api/parse-rule.js — Vercel serverless function
 *
 * Receives a plain-English rule description from the client,
 * calls the Groq API (Llama 3) to parse it into a DiscountRule, and returns JSON.
 * The GROQ_API_KEY never touches the client bundle.
 *
 * Provider-agnostic design: the engine never sees this file.
 * Swapping providers = changing the fetch call below, nothing else.
 */

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { text } = req.body || {}
  if (!text || typeof text !== 'string' || !text.trim()) {
    return res.status(400).json({ error: 'Missing text field' })
  }

  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) {
    return res.status(500).json({ error: 'Server not configured (missing API key)' })
  }

  const systemPrompt = `You parse natural-language discount rule descriptions into JSON.

Return ONLY valid JSON in one of these two forms:

Form 1 — parseable rule (no ruleId field):
{
  "scope": "brand" | "platform" | "cart",
  "appliesTo": string | null,
  "type": "percentage" | "flat",
  "value": number,
  "stackable": boolean,
  "minCartValue": number | null
}

Form 2 — unresolvable:
{ "unresolvable": true, "reason": "..." }

Constraints:
- brand/platform rules: appliesTo must be a non-empty string; minCartValue must be null
- cart rules: appliesTo must be null; minCartValue must be a positive number
- percentage value must be between 0 and 100
- flat value is a positive rupee amount
- if stackable is not stated, default to false
- if any required field is ambiguous or missing, return unresolvable

Examples:
"20% off for Natura Casa brand, stackable with other offers"
→ {"scope":"brand","appliesTo":"Natura Casa","type":"percentage","value":20,"stackable":true,"minCartValue":null}

"Rs.100 flat discount on all Flipkart items"
→ {"scope":"platform","appliesTo":"Flipkart","type":"flat","value":100,"stackable":false,"minCartValue":null}

"10% off if cart value is more than Rs.5000"
→ {"scope":"cart","appliesTo":null,"type":"percentage","value":10,"stackable":false,"minCartValue":5000}

"Give a discount for big orders"
→ {"unresolvable":true,"reason":"No discount amount or cart threshold specified — please be more specific."}`

  try {
    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `User rule: ${text.trim()}` },
        ],
        response_format: { type: 'json_object' },
        temperature: 0,
      }),
    })

    if (!groqRes.ok) {
      const errBody = await groqRes.text()
      console.error('Groq API error:', groqRes.status, errBody)
      return res.status(502).json({ error: 'LLM request failed — try again' })
    }

    const groqData = await groqRes.json()
    const rawText = groqData?.choices?.[0]?.message?.content ?? ''

    // Strip ```json fences defensively
    const cleaned = rawText.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim()

    let parsed
    try {
      parsed = JSON.parse(cleaned)
    } catch {
      return res.status(200).json({
        unresolvable: true,
        reason: 'Could not parse model response — please rephrase your rule.',
      })
    }

    return res.status(200).json(parsed)
  } catch (err) {
    console.error('parse-rule handler error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
