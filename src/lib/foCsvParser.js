const SENTINEL_ORDER_ID = /^(DISCREPANT|TRANSFEROUT|IPO|REVERSAL)$/i
const SENTINEL_TRADE_ID = /^(DISCREPANT|TRANSFEROUT|IPO|REVERSAL)$/i

function isSentinelVal(val, pattern) {
  return val && pattern.test(val.toString().trim())
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
    let a = parseInt(parts[1], 10), b = parseInt(parts[2], 10), y = parts[3]
    if (a > 12) return `${y}-${String(b).padStart(2, '0')}-${String(a).padStart(2, '0')}`
    if (b > 12) return `${y}-${String(a).padStart(2, '0')}-${String(b).padStart(2, '0')}`
    return `${y}-${String(a).padStart(2, '0')}-${String(b).padStart(2, '0')}`
  }
  const d = new Date(v)
  if (!isNaN(d.getTime())) return d.toISOString().split('T')[0]
  return new Date().toISOString().split('T')[0]
}

const COLUMN_MAP = {
  date: [/trade.?date/i],
  symbol: [/^symbol$|tradingsymbol/i],
  trade_type: [/trade.?type/i],
  qty: [/^quantity$/i],
  price: [/^price$/i],
  trade_id: [/^trade_id$/i],
  order_id: [/^order_id$/i],
  order_execution_time: [/order_execution_time|trade_time/i],
  expiry_date: [/expiry_date|expiry/i],
  exchange: [/^exchange$/i],
  isin: [/^isin$/i],
}

function findColumn(headers, patterns) {
  for (let i = 0; i < headers.length; i++) {
    for (const pat of patterns) {
      if (pat.test(headers[i])) return i
    }
  }
  return -1
}

export function parseFoCsv(text) {
  const lines = text.split('\n').filter(Boolean)
  if (lines.length < 2) return { rows: [], errors: ['CSV has no data rows'] }

  const rawHeaders = lines[0].split(',').map(h => h.replace(/["']/g, '').trim())

  const colIdx = {}
  for (const [field, patterns] of Object.entries(COLUMN_MAP)) {
    colIdx[field] = findColumn(rawHeaders, patterns)
  }

  const missing = Object.entries(colIdx).filter(([, v]) => v === -1).map(([k]) => k)
    .filter(k => k !== 'isin' && k !== 'exchange' && k !== 'order_execution_time')

  const rows = []
  const errors = []

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',').map(c => c.replace(/["']/g, '').trim())

    try {
      const rawDate = colIdx.date >= 0 && cols[colIdx.date] !== undefined ? cols[colIdx.date] : ''
      const rawSymbol = colIdx.symbol >= 0 && cols[colIdx.symbol] !== undefined ? cols[colIdx.symbol] : ''
      const rawType = colIdx.trade_type >= 0 && cols[colIdx.trade_type] !== undefined ? cols[colIdx.trade_type] : ''
      const rawQty = colIdx.qty >= 0 && cols[colIdx.qty] !== undefined ? cols[colIdx.qty] : ''
      const rawPrice = colIdx.price >= 0 && cols[colIdx.price] !== undefined ? cols[colIdx.price] : ''
      const rawTradeId = colIdx.trade_id >= 0 && cols[colIdx.trade_id] !== undefined ? cols[colIdx.trade_id] : ''
      const rawOrderId = colIdx.order_id >= 0 && cols[colIdx.order_id] !== undefined ? cols[colIdx.order_id] : ''
      const rawExecTime = colIdx.order_execution_time >= 0 && cols[colIdx.order_execution_time] !== undefined ? cols[colIdx.order_execution_time] : ''
      const rawExpiry = colIdx.expiry_date >= 0 && cols[colIdx.expiry_date] !== undefined ? cols[colIdx.expiry_date] : ''
      const rawExchange = colIdx.exchange >= 0 && cols[colIdx.exchange] !== undefined ? cols[colIdx.exchange] : 'NSE'
      const rawIsin = colIdx.isin >= 0 && cols[colIdx.isin] !== undefined ? cols[colIdx.isin] : ''

      const symbol = rawSymbol.toString().toUpperCase().replace(/["']/g, '').trim()
      const type = rawType.toString().toLowerCase().trim() === 'sell' ? 'sell' : 'buy'
      const qty = parseValue(rawQty)
      const price = parseValue(rawPrice)
      const date = parseDate(rawDate)
      const expiry = parseDate(rawExpiry)

      const tradeId = isSentinelVal(rawTradeId, SENTINEL_TRADE_ID) ? null : (rawTradeId || null)
      const orderId = isSentinelVal(rawOrderId, SENTINEL_ORDER_ID) ? null : (rawOrderId || null)

      if (!symbol) { errors.push(`Row ${i + 1}: missing symbol`); continue }
      if (qty <= 0) { errors.push(`Row ${i + 1}: invalid qty (${rawQty})`); continue }
      if (price < 0) { errors.push(`Row ${i + 1}: invalid price (${rawPrice})`); continue }
      if (!expiry) { errors.push(`Row ${i + 1}: missing expiry_date`); continue }

      rows.push({
        symbol,
        type,
        qty,
        price,
        date,
        expiry_date: expiry,
        trade_id: tradeId,
        order_id: orderId,
        order_execution_time: rawExecTime || null,
        exchange: rawExchange || 'NSE',
        isin: rawIsin || null,
      })
    } catch (e) {
      errors.push(`Row ${i + 1}: ${e.message}`)
    }
  }

  return { rows, errors, total: rows.length + errors.length }
}
