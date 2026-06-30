/**
 * pdfCartParser.js — PDF cart adapter
 *
 * Client-side adapter using pdfjs-dist. Extracts cart items from a PDF
 * table (Product, Brand, Platform, Base Price) and returns CartItem[].
 * The engine never knows this module exists.
 *
 * Strategy: get text items with x/y coordinates, group by y-position into
 * rows, infer column x-boundaries from the header row, bucket cells into
 * columns by x-position. This handles multi-word cells ("Natura Casa",
 * "Amazon India") far better than whitespace-splitting.
 */

import * as pdfjsLib from 'pdfjs-dist'

// Vite resolves this URL import to the bundled worker
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).href

const Y_TOLERANCE = 4 // px — text items within this y-range are the same row

/**
 * Parses a PDF File object and returns { data: CartItem[], warnings: string[] }.
 */
export async function parsePdfCart(file) {
  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise

  const warnings = []
  const items = []
  let itemCounter = 1

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum)
    const textContent = await page.getTextContent()

    const textItems = textContent.items
      .map((t) => ({ text: t.str.trim(), x: t.transform[4], y: t.transform[5] }))
      .filter((t) => t.text.length > 0)

    const rows = groupIntoRows(textItems)

    // Find the header row (contains all four column names)
    const headerIdx = rows.findIndex(
      (row) =>
        row.some((t) => /product/i.test(t.text)) &&
        row.some((t) => /brand/i.test(t.text)) &&
        row.some((t) => /platform/i.test(t.text)) &&
        row.some((t) => /price/i.test(t.text))
    )

    if (headerIdx === -1) continue // no table on this page

    const colBounds = inferColBounds(rows[headerIdx])

    for (let i = headerIdx + 1; i < rows.length; i++) {
      const row = rows[i]
      const rowText = row.map((t) => t.text).join(' ')

      // Skip separator lines and order/date header lines
      if (/^[-──\s]+$/.test(rowText)) continue
      if (/order\s*#|date:/i.test(rowText)) continue
      if (row.length < 2) continue

      try {
        const parsed = parseDataRow(row, colBounds)

        if (!parsed || !parsed.product || !parsed.brand || !parsed.platform) {
          warnings.push(`Row ${i + 1}: missing required columns — skipped`)
          continue
        }

        if (isNaN(parsed.basePrice) || parsed.basePrice <= 0) {
          warnings.push(`Row ${i + 1}: invalid price "${parsed.rawPrice}" — skipped`)
          continue
        }

        items.push({
          itemId: `ITEM-${String(itemCounter).padStart(2, '0')}`,
          product: parsed.product,
          brand: parsed.brand,
          platform: parsed.platform,
          basePrice: Math.round(parsed.basePrice),
        })
        itemCounter++
      } catch {
        warnings.push(`Row ${i + 1}: parse error — skipped`)
      }
    }
  }

  return { data: items, warnings }
}

// ── Helpers ──────────────────────────────────────────────────────

function groupIntoRows(textItems) {
  const sorted = [...textItems].sort((a, b) => b.y - a.y) // top to bottom
  const rows = []

  for (const item of sorted) {
    const existing = rows.find((r) => Math.abs(r[0].y - item.y) <= Y_TOLERANCE)
    if (existing) {
      existing.push(item)
    } else {
      rows.push([item])
    }
  }

  // Sort each row left to right by x
  return rows.map((row) => row.sort((a, b) => a.x - b.x))
}

function inferColBounds(headerRow) {
  const bounds = {}
  for (const item of headerRow) {
    const lower = item.text.toLowerCase()
    if (/product/.test(lower)) bounds.product = item.x
    else if (/brand/.test(lower)) bounds.brand = item.x
    else if (/platform/.test(lower)) bounds.platform = item.x
    else if (/price/.test(lower)) bounds.price = item.x
  }
  return bounds
}

function parseDataRow(row, colBounds) {
  const hasCoords =
    colBounds.product != null &&
    colBounds.brand != null &&
    colBounds.platform != null &&
    colBounds.price != null

  if (!hasCoords) {
    // Fallback: assign by column index (less reliable for multi-word cells)
    if (row.length < 4) return null
    const priceText = row[row.length - 1].text
    return {
      product: row.slice(0, row.length - 3).map((t) => t.text).join(' ') || row[0].text,
      brand: row[row.length - 3].text,
      platform: row[row.length - 2].text,
      basePrice: parsePrice(priceText),
      rawPrice: priceText,
    }
  }

  // Sort columns by x-position to build boundaries
  const cols = [
    { name: 'product', x: colBounds.product },
    { name: 'brand', x: colBounds.brand },
    { name: 'platform', x: colBounds.platform },
    { name: 'price', x: colBounds.price },
  ].sort((a, b) => a.x - b.x)

  const buckets = { product: [], brand: [], platform: [], price: [] }

  for (const item of row) {
    // Assign to the column whose header x is closest (but not to the right of item)
    let assigned = cols[0].name
    for (let i = 0; i < cols.length; i++) {
      if (item.x >= cols[i].x - 5) assigned = cols[i].name
    }
    buckets[assigned].push(item.text)
  }

  const rawPrice = buckets.price.join(' ')
  return {
    product: buckets.product.join(' ').trim(),
    brand: buckets.brand.join(' ').trim(),
    platform: buckets.platform.join(' ').trim(),
    basePrice: parsePrice(rawPrice),
    rawPrice,
  }
}

function parsePrice(text) {
  // Strip "Rs.", commas, spaces → float
  const cleaned = text.replace(/Rs\.?/gi, '').replace(/[,\s]/g, '').trim()
  return parseFloat(cleaned)
}
