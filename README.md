# Opptra Discount Engine

**Live deployment:** https://discount-engine-assignment-sand.vercel.app

A customer-facing cart pricing engine built for the Opptra FDE Intern assignment. Applies brand, platform, and cart-level discount rules to a shopping cart and shows each customer a clear breakdown of what offer they received.

## Run locally (3 steps)

```bash
npm install
```

Create a `.env` file in the project root:
```
GROQ_API_KEY=your_groq_api_key_here
```

```bash
vercel dev
```

Open http://localhost:3000

> Get a free Groq API key at https://console.groq.com (no credit card required).
> Install Vercel CLI first if needed: `npm i -g vercel`

## What's built

### Foundation - CSV upload + item discounts
Upload `rules.csv` and `cart.csv` from `sample-data/`, click **Calculate Discounts**. The engine picks the best non-stackable rule per item and stacks any stackable rules on top.

### Task 1 - Cart-level offer
After all item discounts are applied, a cart-level rule fires if the total meets the minimum threshold. A dedicated cart offer row appears only when triggered - it disappears if the total falls below the threshold.

### Task 2 - Natural-language rule input
Type a discount rule in plain English. An LLM (Groq / Llama 3) parses it into a structured `DiscountRule` object server-side. The parsed fields are shown in a confirmation step — confirm to add the rule and re-run the engine, or discard. Ambiguous inputs ("Give a discount for big orders") surface a clear error asking the user to be more specific.

### Task 3 - PDF cart upload
Upload a cart PDF alongside or instead of the CSV. `pdfjs-dist` extracts text with x/y coordinates, groups items into rows by y-position, and buckets cells into columns using the header row's x-positions. Multi-word cells like "Natura Casa" and "Amazon India" parse correctly. Malformed rows are skipped with a visible warning. The engine re-runs automatically on successful upload.

## Project structure

```
src/
  engine/
    discountEngine.js   ← pure engine — never knows the input source
    csvParser.js        ← CSV → DiscountRule[] / CartItem[]
    nlRuleParser.js     ← NL text → validated DiscountRule (client side)
    pdfCartParser.js    ← PDF → CartItem[] via pdfjs-dist
  components/
    CsvUploader.jsx
    DataTable.jsx
    ErrorBanner.jsx
  App.jsx               ← wires adapters → state → engine → results

api/
  parse-rule.js         ← Vercel serverless function — calls Groq, key never exposed client-side

sample-data/
  rules.csv
  cart.csv
```

## Design decisions & tradeoffs

### Pure engine + input adapters
The engine exposes one function: `processCartWithCartOffer(rules, cart) → results`. It has no knowledge of where data came from. Each input source (CSV, natural language, PDF) is an adapter that outputs the same canonical `DiscountRule[]` / `CartItem[]` shapes. Adding a fourth input mode (e.g. JSON API, barcode scan) means writing one new adapter file — `discountEngine.js` is never touched. This is the highest-leverage architectural decision: it keeps the engine testable in isolation and prevents input-specific logic from leaking into pricing logic.

### LLM key behind a serverless function
The Groq API key lives only in `api/parse-rule.js`, an environment variable set in the Vercel dashboard. It is never shipped to the browser bundle (a `VITE_`-prefixed variable would be). The client posts plain text to `/api/parse-rule` and receives parsed JSON - it never sees the key or the LLM provider. This means swapping Groq for any other provider (OpenAI, Gemini, Anthropic) is a single-file change in `api/parse-rule.js`. The engine and all UI components are completely unaware an LLM was involved.

### LLM output validation
The parsed rule is validated before it is ever shown to the user or added to state. Validation checks: scope is a valid enum, type is valid, value is a positive number (and ≤ 100 for percentages), cart rules have a `minCartValue`, brand/platform rules have a non-empty `appliesTo`. On any failure - invalid JSON, failed validation, or an `unresolvable` response from the model - a friendly error is shown. The engine is never called with an invalid rule.

### PDF parsing strategy
Text items are extracted with their x/y coordinates using `pdfjs-dist`. Items within 4px of the same y-position are grouped into a row. Column boundaries are inferred from the header row's x-positions, so each data cell is bucketed into Product / Brand / Platform / Base Price by proximity to its column header. This handles multi-word cells correctly without relying on whitespace splitting. If no header row is found, the page is skipped. Any row with a missing or unparseable price is collected into a warning list shown below the uploader - the rest of the cart still loads. If the PDF format changes significantly (e.g. multiple tables, merged cells), the coordinate-based approach would need updating; a more robust path would be to send the PDF text to an LLM for extraction.

### Malformed rows and edge cases
- Cart total just below threshold → `cartOffer` is `null`, no cart row renders
- LLM returns non-JSON or times out → friendly error, no crash, engine not re-run
- Ambiguous NL input → model returns `{ unresolvable: true, reason }`, shown to user
- Malformed PDF row → skipped, counted in warning banner
- No rules match an item → base price returned, reasoning = "No offers available"
- Stackable rule with no non-stackable match → stackable rule applies on its own

## Expected results for sample data

| Item | Base | Final | Notes |
|---|---|---|---|
| ITEM-01 | Rs.1,299 | Rs.1,104 | Platform 15% wins over Brand Rs.150 flat |
| ITEM-02 | Rs.849 | Rs.629 | Brand Rs.150 off + Platform 10% stacked |
| ITEM-03 | Rs.599 | Rs.509 | Platform 15% off |
| ITEM-04 | Rs.2,499 | Rs.2,499 | No offers available |
| ITEM-05 | Rs.449 | Rs.382 | Platform 15% off |
| ITEM-06 | Rs.899 | Rs.809 | Platform 10% off |
| Cart total | Rs.5,932 | | ≥ Rs.4,000 threshold met |
| Cart offer | | −Rs.593 | RULE-04: 10% off entire cart |
| **Final total** | | **Rs.5,339** | |
