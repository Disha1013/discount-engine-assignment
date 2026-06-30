/**
 * App.jsx
 *
 * Wires adapters → state → engine → results.
 * Three input paths (CSV rules, NL rule, PDF cart) all produce the same
 * canonical types the engine consumes — the engine never knows the source.
 */

import { useState, useRef } from 'react'
import CsvUploader from './components/CsvUploader.jsx'
import DataTable from './components/DataTable.jsx'
import ErrorBanner from './components/ErrorBanner.jsx'
import { parseRulesCSV, parseCartCSV } from './engine/csvParser.js'
import { parseNlRule, validateParsedRule } from './engine/nlRuleParser.js'
import { parsePdfCart } from './engine/pdfCartParser.js'
import { processCartWithCartOffer } from './engine/discountEngine.js'

// ── Column definitions ────────────────────────────────────────────

const RULES_COLUMNS = [
  { key: 'ruleId', label: 'Rule ID' },
  { key: 'scope', label: 'Scope', render: (v) => v.charAt(0).toUpperCase() + v.slice(1) },
  { key: 'appliesTo', label: 'Applies To', render: (v) => v ?? '—' },
  { key: 'type', label: 'Type', render: (v) => v.charAt(0).toUpperCase() + v.slice(1) },
  {
    key: 'value',
    label: 'Value',
    render: (v, row) => (row.type === 'percentage' ? `${v}% off` : `Rs.${v} off`),
  },
  { key: 'stackable', label: 'Stackable', render: (v) => (v ? 'Yes' : 'No') },
  {
    key: 'minCartValue',
    label: 'Min Cart',
    render: (v) => (v ? `Rs.${v.toLocaleString('en-IN')}` : '—'),
  },
]

const CART_COLUMNS = [
  { key: 'itemId', label: 'Item' },
  { key: 'product', label: 'Product' },
  { key: 'brand', label: 'Brand' },
  { key: 'platform', label: 'Platform' },
  { key: 'basePrice', label: 'Base Price', render: (v) => `Rs.${v.toLocaleString('en-IN')}` },
]

const RESULTS_COLUMNS = [
  { key: 'itemId', label: 'Item' },
  { key: 'product', label: 'Product' },
  { key: 'basePrice', label: 'Base Price', render: (v) => `Rs.${v.toLocaleString('en-IN')}` },
  {
    key: 'finalPrice',
    label: 'Final Price',
    render: (v, row) => (
      <span style={{ fontWeight: 700, color: row.totalDiscount > 0 ? '#1e5c2c' : '#131A48' }}>
        Rs.{v.toLocaleString('en-IN')}
      </span>
    ),
  },
  {
    key: 'totalDiscount',
    label: 'You Save',
    render: (v) =>
      v > 0 ? (
        <span style={{ color: '#1e5c2c', fontWeight: 600 }}>Rs.{v.toLocaleString('en-IN')}</span>
      ) : (
        <span style={{ color: '#888' }}>—</span>
      ),
  },
  {
    key: 'reasoning',
    label: 'Offer Applied',
    render: (v) => (
      <span
        style={{
          color: v === 'No offers available' ? '#888' : '#131A48',
          fontStyle: v === 'No offers available' ? 'italic' : 'normal',
        }}
      >
        {v}
      </span>
    ),
  },
]

// ── Styles ────────────────────────────────────────────────────────

const S = {
  page: { minHeight: '100vh', background: '#f7f7f9', fontFamily: 'Arial, sans-serif' },
  header: {
    background: '#131A48',
    padding: '0.85rem 2rem',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  logoTxt: {
    fontFamily: 'Georgia, serif',
    fontSize: 17,
    fontWeight: 700,
    color: '#fff',
    letterSpacing: '-0.02em',
  },
  logoSpan: { color: '#FF5800' },
  headerSub: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.5)',
    textTransform: 'uppercase',
    letterSpacing: '0.07em',
  },
  main: { maxWidth: 960, margin: '0 auto', padding: '1.8rem 1.5rem' },
  section: {
    background: '#fff',
    border: '1px solid #CECECE',
    borderRadius: 6,
    padding: '1.2rem 1.4rem',
    marginBottom: '1.2rem',
  },
  sectionTitle: {
    fontFamily: 'Georgia, serif',
    fontWeight: 700,
    fontSize: 14,
    color: '#131A48',
    marginBottom: '0.7rem',
    paddingBottom: 6,
    borderBottom: '2px solid #FF5800',
    display: 'inline-block',
  },
  grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' },
  btn: {
    background: '#FF5800',
    color: '#fff',
    border: 'none',
    borderRadius: 4,
    padding: '0.65rem 2rem',
    fontSize: 13,
    fontWeight: 700,
    cursor: 'pointer',
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
  },
  btnSmall: {
    background: '#131A48',
    color: '#fff',
    border: 'none',
    borderRadius: 4,
    padding: '0.45rem 1.2rem',
    fontSize: 12,
    fontWeight: 700,
    cursor: 'pointer',
    letterSpacing: '0.04em',
  },
  btnOutline: {
    background: 'transparent',
    color: '#131A48',
    border: '1px solid #CECECE',
    borderRadius: 4,
    padding: '0.45rem 1.2rem',
    fontSize: 12,
    fontWeight: 700,
    cursor: 'pointer',
  },
  btnDisabled: {
    background: '#CECECE',
    color: '#fff',
    border: 'none',
    borderRadius: 4,
    padding: '0.65rem 2rem',
    fontSize: 13,
    fontWeight: 700,
    cursor: 'not-allowed',
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
  },
  totalRow: {
    display: 'flex',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: '1rem',
    marginTop: '0.75rem',
    paddingTop: '0.75rem',
    borderTop: '1px solid #CECECE',
  },
  totalLabel: { fontWeight: 700, fontSize: 13, color: '#131A48' },
  totalValue: { fontWeight: 700, fontSize: 15, color: '#131A48' },
  cartOfferRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: '0.5rem',
    padding: '0.5rem 0.75rem',
    background: '#f0faf2',
    border: '1px solid #a8d5b0',
    borderRadius: 4,
    fontSize: 13,
    color: '#1e5c2c',
    fontWeight: 600,
  },
  finalTotalRow: {
    display: 'flex',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: '1rem',
    marginTop: '0.5rem',
    paddingTop: '0.75rem',
    borderTop: '2px solid #131A48',
  },
  divider: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    margin: '0.75rem 0',
    color: '#aaa',
    fontSize: 11,
  },
  dividerLine: { flex: 1, height: 1, background: '#E5E5E5' },
  nlInput: {
    width: '100%',
    border: '1px solid #CECECE',
    borderRadius: 4,
    padding: '0.5rem 0.75rem',
    fontSize: 13,
    fontFamily: 'Arial, sans-serif',
    resize: 'vertical',
    minHeight: 60,
    boxSizing: 'border-box',
    outline: 'none',
  },
  confirmCard: {
    background: '#f4f6ff',
    border: '1px solid #b0bfff',
    borderRadius: 6,
    padding: '0.9rem 1rem',
    marginTop: '0.75rem',
  },
  confirmTitle: { fontWeight: 700, fontSize: 12, color: '#131A48', marginBottom: '0.5rem' },
  confirmField: { fontSize: 12, color: '#333', marginBottom: 3 },
  confirmLabel: { fontWeight: 700, color: '#131A48' },
  warningBanner: {
    background: '#fff8e1',
    border: '1px solid #f0c060',
    borderLeft: '3px solid #e0a020',
    borderRadius: 4,
    padding: '0.5rem 0.75rem',
    marginTop: '0.5rem',
    fontSize: 12,
    color: '#6b4c00',
  },
}

// ── App ───────────────────────────────────────────────────────────

export default function App() {
  // Rules state
  const [rules, setRules] = useState([])
  const [rulesErrors, setRulesErrors] = useState([])
  const [rulesFileName, setRulesFileName] = useState('')

  // Cart state
  const [cartItems, setCartItems] = useState([])
  const [cartErrors, setCartErrors] = useState([])
  const [cartFileName, setCartFileName] = useState('')
  const [pdfWarnings, setPdfWarnings] = useState([])

  // Results state
  const [results, setResults] = useState(null)

  // NL rule state
  const [nlText, setNlText] = useState('')
  const [nlStatus, setNlStatus] = useState('idle') // idle | loading | confirming | error
  const [nlError, setNlError] = useState('')
  const [pendingRule, setPendingRule] = useState(null)
  const nlRuleCounter = useRef(0)

  // ── Engine runner ──

  function runEngine(activeRules, cart) {
    if (activeRules.length === 0 || cart.length === 0) return
    setResults(processCartWithCartOffer(cart, activeRules))
  }

  // ── Rules handlers ──

  function handleRulesLoad(csvText, fileName) {
    const { data, errors } = parseRulesCSV(csvText)
    setRules(data)
    setRulesErrors(errors)
    setRulesFileName(fileName)
    setResults(null)
    setNlText('')
    setNlStatus('idle')
    setPendingRule(null)
  }

  // ── Cart handlers ──

  function handleCartCsvLoad(csvText, fileName) {
    const { data, errors } = parseCartCSV(csvText)
    setCartItems(data)
    setCartErrors(errors)
    setCartFileName(fileName)
    setPdfWarnings([])
    if (data.length > 0 && rules.length > 0) {
      runEngine(rules, data)
    } else {
      setResults(null)
    }
  }

  async function handlePdfLoad(file) {
    setCartErrors([])
    setPdfWarnings([])
    setCartFileName(file.name)
    try {
      const { data, warnings } = await parsePdfCart(file)
      if (data.length === 0) {
        setCartErrors(['No cart items could be extracted from the PDF.'])
        setCartItems([])
        setResults(null)
        return
      }
      setCartItems(data)
      setPdfWarnings(warnings)
      runEngine(rules, data)
    } catch (err) {
      setCartErrors([`PDF parse error: ${err.message}`])
      setResults(null)
    }
  }

  // ── Calculate button (manual) ──

  function handleCalculate() {
    runEngine(rules, cartItems)
  }

  // ── NL rule handlers ──

  async function handleParseRule() {
    if (!nlText.trim()) return
    setNlStatus('loading')
    setNlError('')
    setPendingRule(null)

    try {
      const raw = await parseNlRule(nlText)
      const validation = validateParsedRule(raw)

      if (!validation.valid) {
        if (validation.unresolvable) {
          setNlStatus('error')
          setNlError(validation.reason)
        } else {
          setNlStatus('error')
          setNlError(validation.error)
        }
        return
      }

      setPendingRule(raw)
      setNlStatus('confirming')
    } catch (err) {
      setNlStatus('error')
      setNlError(err.message || 'Could not connect to the rule parser. Try again.')
    }
  }

  function handleConfirmRule() {
    if (!pendingRule) return
    nlRuleCounter.current += 1
    const newRule = {
      ...pendingRule,
      ruleId: `RULE-NL-${nlRuleCounter.current}`,
      minCartValue: pendingRule.minCartValue ?? null,
    }
    const updatedRules = [...rules, newRule]
    setRules(updatedRules)
    setNlText('')
    setNlStatus('idle')
    setPendingRule(null)
    runEngine(updatedRules, cartItems)
  }

  function handleDiscardRule() {
    setNlText('')
    setNlStatus('idle')
    setPendingRule(null)
    setNlError('')
  }

  const canCalculate = rules.length > 0 && cartItems.length > 0

  // ── Render ────────────────────────────────────────────────────────

  return (
    <div style={S.page}>
      {/* Header */}
      <div style={S.header}>
        <div style={S.logoTxt}>
          O<span style={S.logoSpan}>pp</span>tra
        </div>
        <div style={S.headerSub}>Discount Engine</div>
      </div>

      <div style={S.main}>
        {/* Upload row */}
        <div style={S.grid2}>
          {/* ── Rules section ── */}
          <div style={S.section}>
            <div style={S.sectionTitle}>Discount Rules</div>

            <CsvUploader
              label="rules.csv"
              description="Upload your discount rules CSV"
              onLoad={handleRulesLoad}
              hasData={rules.length > 0}
              fileName={rulesFileName}
            />
            <ErrorBanner errors={rulesErrors} />

            {rules.length > 0 && (
              <div style={{ marginTop: '0.75rem' }}>
                <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>
                  {rules.length} rule{rules.length > 1 ? 's' : ''} loaded
                </div>
                <DataTable columns={RULES_COLUMNS} rows={rules} />
              </div>
            )}

            {/* NL rule input */}
            <div style={{ ...S.divider, marginTop: '1rem' }}>
              <div style={S.dividerLine} />
              <span>or add a rule in plain English</span>
              <div style={S.dividerLine} />
            </div>

            <textarea
              style={S.nlInput}
              placeholder='e.g. "20% off for Natura Casa brand, stackable"'
              value={nlText}
              onChange={(e) => {
                setNlText(e.target.value)
                if (nlStatus !== 'idle') {
                  setNlStatus('idle')
                  setNlError('')
                  setPendingRule(null)
                }
              }}
              disabled={nlStatus === 'loading'}
            />

            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
              <button
                style={
                  nlText.trim() && nlStatus !== 'loading' ? S.btnSmall : { ...S.btnSmall, opacity: 0.4, cursor: 'not-allowed' }
                }
                onClick={handleParseRule}
                disabled={!nlText.trim() || nlStatus === 'loading'}
              >
                {nlStatus === 'loading' ? 'Parsing…' : 'Parse Rule'}
              </button>
              {(nlStatus === 'confirming' || nlStatus === 'error') && (
                <button style={S.btnOutline} onClick={handleDiscardRule}>
                  Clear
                </button>
              )}
            </div>

            {/* NL error */}
            {nlStatus === 'error' && nlError && (
              <div style={{ ...S.warningBanner, marginTop: '0.5rem' }}>
                <strong>Could not parse rule:</strong> {nlError}
              </div>
            )}

            {/* NL confirmation card */}
            {nlStatus === 'confirming' && pendingRule && (
              <div style={S.confirmCard}>
                <div style={S.confirmTitle}>Confirm this rule before adding:</div>
                <div style={S.confirmField}>
                  <span style={S.confirmLabel}>Scope: </span>
                  {pendingRule.scope.charAt(0).toUpperCase() + pendingRule.scope.slice(1)}
                </div>
                {pendingRule.appliesTo && (
                  <div style={S.confirmField}>
                    <span style={S.confirmLabel}>Applies to: </span>
                    {pendingRule.appliesTo}
                  </div>
                )}
                <div style={S.confirmField}>
                  <span style={S.confirmLabel}>Type: </span>
                  {pendingRule.type.charAt(0).toUpperCase() + pendingRule.type.slice(1)}
                </div>
                <div style={S.confirmField}>
                  <span style={S.confirmLabel}>Value: </span>
                  {pendingRule.type === 'percentage'
                    ? `${pendingRule.value}% off`
                    : `Rs.${pendingRule.value} off`}
                </div>
                <div style={S.confirmField}>
                  <span style={S.confirmLabel}>Stackable: </span>
                  {pendingRule.stackable ? 'Yes' : 'No'}
                </div>
                {pendingRule.minCartValue && (
                  <div style={S.confirmField}>
                    <span style={S.confirmLabel}>Min cart value: </span>
                    Rs.{pendingRule.minCartValue.toLocaleString('en-IN')}
                  </div>
                )}
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
                  <button style={S.btn} onClick={handleConfirmRule}>
                    Confirm &amp; Add
                  </button>
                  <button style={S.btnOutline} onClick={handleDiscardRule}>
                    Discard
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* ── Cart section ── */}
          <div style={S.section}>
            <div style={S.sectionTitle}>Cart Items</div>

            {/* CSV uploader */}
            <CsvUploader
              label="cart.csv"
              description="Upload your cart CSV"
              onLoad={handleCartCsvLoad}
              hasData={cartItems.length > 0 && !cartFileName.endsWith('.pdf')}
              fileName={!cartFileName.endsWith('.pdf') ? cartFileName : ''}
            />

            {/* PDF uploader */}
            <div style={{ ...S.divider, marginTop: '0.75rem' }}>
              <div style={S.dividerLine} />
              <span>or upload a PDF</span>
              <div style={S.dividerLine} />
            </div>

            <PdfUploader
              hasData={cartItems.length > 0 && cartFileName.endsWith('.pdf')}
              fileName={cartFileName.endsWith('.pdf') ? cartFileName : ''}
              onLoad={handlePdfLoad}
            />

            <ErrorBanner errors={cartErrors} />

            {pdfWarnings.length > 0 && (
              <div style={S.warningBanner}>
                <strong>{pdfWarnings.length} row{pdfWarnings.length > 1 ? 's' : ''} skipped:</strong>{' '}
                {pdfWarnings.join(' | ')}
              </div>
            )}

            {cartItems.length > 0 && (
              <div style={{ marginTop: '0.75rem' }}>
                <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>
                  {cartItems.length} item{cartItems.length > 1 ? 's' : ''} loaded
                </div>
                <DataTable columns={CART_COLUMNS} rows={cartItems} />
              </div>
            )}
          </div>
        </div>

        {/* Calculate button */}
        <div style={{ textAlign: 'center', marginBottom: '1.2rem' }}>
          <button
            style={canCalculate ? S.btn : S.btnDisabled}
            onClick={handleCalculate}
            disabled={!canCalculate}
          >
            Calculate Discounts
          </button>
          {!canCalculate && (
            <div style={{ fontSize: 11, color: '#888', marginTop: 6 }}>
              Load rules and cart items to calculate
            </div>
          )}
        </div>

        {/* Results */}
        {results && (
          <div style={S.section}>
            <div style={S.sectionTitle}>Cart Summary</div>
            <DataTable columns={RESULTS_COLUMNS} rows={results.itemResults} />

            {/* Cart total before offer */}
            <div style={S.totalRow}>
              <span style={S.totalLabel}>Items total</span>
              <span style={S.totalValue}>
                Rs.{results.cartTotalBeforeOffer.toLocaleString('en-IN')}
              </span>
            </div>

            {/* Cart offer row — only when threshold is met */}
            {results.cartOffer && (
              <div style={S.cartOfferRow}>
                <span>{results.cartOffer.label}</span>
                <span style={{ fontWeight: 700 }}>
                  −Rs.{results.cartOffer.saved.toLocaleString('en-IN')}
                </span>
              </div>
            )}

            {/* Final cart total */}
            <div style={S.finalTotalRow}>
              <span style={{ ...S.totalLabel, fontSize: 15 }}>
                {results.cartOffer ? 'Final Cart Total' : 'Cart Total'}
              </span>
              <span
                style={{
                  ...S.totalValue,
                  fontSize: 18,
                  color: results.cartOffer ? '#1e5c2c' : '#131A48',
                }}
              >
                Rs.{results.finalCartTotal.toLocaleString('en-IN')}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── PdfUploader ───────────────────────────────────────────────────

function PdfUploader({ hasData, fileName, onLoad }) {
  const inputRef = useRef(null)

  function handleFile(e) {
    const file = e.target.files[0]
    if (!file) return
    onLoad(file)
    e.target.value = ''
  }

  return (
    <div
      style={{
        border: `2px dashed ${hasData ? '#1e5c2c' : '#CECECE'}`,
        borderRadius: 6,
        padding: '1rem 1.2rem',
        background: hasData ? '#f0faf2' : '#fafafa',
        cursor: 'pointer',
      }}
      onClick={() => inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".pdf"
        style={{ display: 'none' }}
        onChange={handleFile}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
        <span style={{ fontSize: 20 }}>{hasData ? '✅' : '📋'}</span>
        <div>
          <div style={{ fontWeight: 700, fontSize: 13, color: '#131A48' }}>cart.pdf</div>
          <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>
            {hasData ? fileName : 'Upload a PDF cart (Product, Brand, Platform, Base Price)'}
          </div>
        </div>
        <div style={{ marginLeft: 'auto' }}>
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: hasData ? '#1e5c2c' : '#FF5800',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            {hasData ? 'Change' : 'Upload'}
          </span>
        </div>
      </div>
    </div>
  )
}
