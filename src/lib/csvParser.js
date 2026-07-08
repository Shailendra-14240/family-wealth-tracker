const SENTINEL_ORDER_ID = /^(DISCREPANT|TRANSFEROUT|IPO)$/i

function isSentinel(val) {
  return val && SENTINEL_ORDER_ID.test(val.toString().trim())
}

const FORMATS = [
  {
    id: 'zerodha',
    label: 'Zerodha Kite',
    detect: (headers) =>
      (headers.some(h => /^symbol$/i.test(h)) && headers.some(h => /trade_date/i.test(h))) ||
      (headers.some(h => /tradingsymbol/i.test(h)) && (headers.some(h => /transaction_type/i.test(h)) || headers.some(h => /^trade_type$/i.test(h)))),
    map: (headers) => ({
      date: headers.findIndex(h => /trade.?date/i.test(h)),
      symbol: headers.findIndex(h => /tradingsymbol|^symbol$/i.test(h)),
      type: headers.findIndex(h => /^transaction.?type$|^buy.?sell$/i.test(h)),
      trade_type: headers.findIndex(h => /^trade.?type$/i.test(h)),
      qty: headers.findIndex(h => /^quantity$/i.test(h)),
      price: headers.findIndex(h => /^price$/i.test(h) || /average.?price/i.test(h)),
      trade_id: headers.findIndex(h => /^trade_id$/i.test(h)),
      order_id: headers.findIndex(h => /^order_id$/i.test(h)),
      order_execution_time: headers.findIndex(h => /order_execution_time|trade_time/i.test(h)),
    }),
  },
  {
    id: 'paytm',
    label: 'Paytm Money',
    detect: (headers) =>
      headers.some(h => /scrip/i.test(h)) ||
      headers.some(h => /paytm/i.test(h)),
    map: (headers) => ({
      date: headers.findIndex(h => /trade.?date|date|timestamp/i.test(h)),
      symbol: headers.findIndex(h => /scrip|trading.?symbol|^symbol$/i.test(h) || /instrument/i.test(h)),
      type: headers.findIndex(h => /transaction.?type|order.?type|type|side/i.test(h)),
      trade_type: () => -1,
      qty: headers.findIndex(h => /quantity|qty/i.test(h)),
      price: headers.findIndex(h => /avg.?price|^price$/i.test(h) || /rate|average/i.test(h)),
    }),
  },
  {
    id: 'icici',
    label: 'ICICI Direct',
    detect: (headers) =>
      headers.some(h => /scrip.?name|stock.?name/i.test(h)),
    map: (headers) => ({
      date: headers.findIndex(h => /trade.?date|date/i.test(h)),
      symbol: headers.findIndex(h => /scrip.?name|stock.?name|^symbol$/i.test(h) || /instrument/i.test(h)),
      type: headers.findIndex(h => /buy.?sell|transaction.?type|type|side/i.test(h)),
      trade_type: () => -1,
      qty: headers.findIndex(h => /quantity|buy.?qty|sell.?qty|qty/i.test(h)),
      price: headers.findIndex(h => /avg.?price|^price$/i.test(h) || /rate/i.test(h)),
    }),
  },
  {
    id: 'generic',
    label: 'Generic (auto-detect)',
    detect: () => true,
    map: (headers) => ({
      date: headers.findIndex(h => /date|timestamp/i.test(h)),
      symbol: headers.findIndex(h => /^symbol$|scrip|tradingsymbol|instrument|stock/i.test(h)),
      type: headers.findIndex(h => /type|side|transaction|buy.?sell/i.test(h)),
      trade_type: () => -1,
      qty: headers.findIndex(h => /qty|quantity/i.test(h)),
      price: headers.findIndex(h => /price|rate|cost|avg/i.test(h)),
      trade_id: headers.findIndex(h => /^trade_id$/i.test(h)),
      order_id: headers.findIndex(h => /^order_id$/i.test(h)),
      order_execution_time: headers.findIndex(h => /order_execution_time|trade_time/i.test(h)),
    }),
  },
]

function normaliseType(val, tradeTypeVal) {
  const tt = tradeTypeVal ? tradeTypeVal.toString().toLowerCase().trim() : ''
  const isReversal = tt === 'reversal' || tt === 'reversed'

  let dir = 'buy'
  const source = val || tradeTypeVal
  if (source) {
    const v = source.toString().toLowerCase().trim()
    if (v === 'sell' || v === 's' || v.startsWith('sell')) dir = 'sell'
  }

  if (isReversal) return dir === 'sell' ? 'buy' : 'sell'
  return dir
}

function normaliseSymbol(val) {
  if (!val) return ''
  return val.toString()
    .toUpperCase()
    .replace(/["']/g, '')
    .replace(/#/g, '')
    .replace(/\d+$/, '')
    .trim()
}

function parseValue(val) {
  if (!val) return 0
  const cleaned = val.toString().replace(/[₹,",\s]/g, '').trim()
  return parseFloat(cleaned) || 0
}

function parseDate(val) {
  if (!val) return new Date().toISOString().split('T')[0]
  const v = val.toString().trim()
  const parts = v.match(/(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})/)
  if (parts) {
    let m = parseInt(parts[1], 10), d = parseInt(parts[2], 10), y = parts[3]
    if (d > 12) { let t = m; m = d; d = t }
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  }
  const d = new Date(v)
  if (!isNaN(d.getTime())) return d.toISOString().split('T')[0]
  return new Date().toISOString().split('T')[0]
}

export function detectFormat(headers) {
  const normalised = headers.map(h => h.replace(/["']/g, '').trim())
  for (const fmt of FORMATS) {
    if (fmt.detect(normalised)) return fmt
  }
  return FORMATS.find(f => f.id === 'generic')
}

export function parseCSV(text, formatId) {
  const lines = text.split('\n').filter(Boolean)
  if (lines.length < 2) return { rows: [], errors: ['CSV has no data rows'] }

  const rawHeaders = lines[0].split(',').map(h => h.replace(/["']/g, '').trim())
  const fmt = formatId
    ? FORMATS.find(f => f.id === formatId)
    : detectFormat(rawHeaders)

  if (!fmt) return { rows: [], errors: ['Could not detect CSV format'] }

  const colIdx = fmt.map(rawHeaders)
  const missing = Object.entries(colIdx).filter(([, v]) => typeof v === 'number' && v === -1).map(([k]) => k)
    .filter((k) => !(k === 'type' && colIdx.trade_type >= 0))

  const rows = []
  const errors = []

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',').map(c => c.replace(/["']/g, '').trim())
    const raw = {}
    for (const [field, idx] of Object.entries(colIdx)) {
      raw[field] = typeof idx === 'number' && idx >= 0 && cols[idx] !== undefined ? cols[idx] : ''
    }

    try {
      const rawOrderId = !isSentinel(raw.order_id) ? (raw.order_id || null) : null
      const row = {
        symbol: normaliseSymbol(raw.symbol),
        type: normaliseType(raw.type, raw.trade_type),
        qty: parseValue(raw.qty),
        price: parseValue(raw.price),
        date: parseDate(raw.date),
        order_id: !isSentinel(raw.trade_id) ? (raw.trade_id || null) : rawOrderId,
        order_execution_time: raw.order_execution_time || null,
        _raw_order_id: rawOrderId,
      }
      if (!row.symbol) { errors.push(`Row ${i + 1}: missing symbol`); continue }
      if (row.qty <= 0) { errors.push(`Row ${i + 1}: invalid qty (${raw.qty})`); continue }
      if (row.price < 0) { errors.push(`Row ${i + 1}: invalid price (${raw.price})`); continue }
      rows.push(row)
    } catch (e) {
      errors.push(`Row ${i + 1}: ${e.message}`)
    }
  }

  return {
    rows,
    errors,
    format: fmt.label,
    missingColumns: missing.length ? missing : null,
    detected: colIdx,
  }
}
