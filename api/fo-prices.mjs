// api/fo-prices.mjs
// Vercel serverless function: proxies NSE option chain to fetch live option LTPs
// Usage: /api/fo-prices?symbols=NIFTY26JAN24000CE,BANKNIFTY26JAN52000PE

const INDEX_SYMBOLS = new Set(['NIFTY', 'BANKNIFTY', 'FINNIFTY', 'MIDCPNIFTY', 'SENSEX', 'BANKEX'])
const MONTHS = { JAN:0, FEB:1, MAR:2, APR:3, MAY:4, JUN:5, JUL:6, AUG:7, SEP:8, OCT:9, NOV:10, DEC:11 }

function parseOptionSymbol(symbol) {
  const match = symbol.match(/^([A-Z&]+)(\d{2})([A-Z]{3})(\d+(?:\.\d+)?)(CE|PE|FUT)$/i)
  if (!match) return null
  return {
    symbol,
    underlying: match[1].toUpperCase(),
    year: 2000 + parseInt(match[2]),
    month: match[3].toUpperCase(),
    strike: parseFloat(match[4]),
    type: match[5].toUpperCase(),
  }
}

async function getNseCookies() {
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5',
    'Connection': 'keep-alive',
  }
  try {
    const homeRes = await fetch('https://www.nseindia.com/', { headers })
    const setCookie = homeRes.headers.get('set-cookie') || ''
    const cookies = setCookie
      .split(/,(?=[^;])/)
      .map(c => c.split(';')[0].trim())
      .filter(Boolean)
      .join('; ')
    await fetch('https://www.nseindia.com/market-data/live-equity-market', {
      headers: { ...headers, Cookie: cookies }
    })
    return cookies
  } catch { return '' }
}

async function fetchOptionChain(underlying, cookies) {
  const isIndex = INDEX_SYMBOLS.has(underlying)
  const url = isIndex
    ? `https://www.nseindia.com/api/option-chain-indices?symbol=${encodeURIComponent(underlying)}`
    : `https://www.nseindia.com/api/option-chain-equities?symbol=${encodeURIComponent(underlying)}`
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Referer': 'https://www.nseindia.com/',
      'Cookie': cookies,
    }
  })
  if (!res.ok) throw new Error(`NSE HTTP ${res.status} for ${underlying}`)
  const data = await res.json()
  return data?.records?.data || []
}

function matchLtp(chainData, item) {
  const targetMonth = MONTHS[item.month]
  const targetYear = item.year
  for (const row of chainData) {
    if (Math.abs(row.strikePrice - item.strike) > 0.01) continue
    const parts = row.expiryDate?.split('-')
    if (!parts || parts.length < 3) continue
    const expiryMonthStr = parts[1].toUpperCase().substring(0, 3)
    const expiryYear = parseInt(parts[2]) < 100 ? 2000 + parseInt(parts[2]) : parseInt(parts[2])
    if (MONTHS[expiryMonthStr] !== targetMonth || expiryYear !== targetYear) continue
    const optData = item.type === 'FUT' ? row['FUT'] : row[item.type]
    if (optData?.lastPrice != null) return optData.lastPrice
  }
  return null
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  const { symbols } = req.query
  if (!symbols) return res.status(400).json({ error: 'symbols query param required' })

  const parsed = symbols.split(',').map(s => s.trim().toUpperCase()).filter(Boolean)
    .map(parseOptionSymbol).filter(Boolean)
  if (!parsed.length) return res.json({})

  const byUnderlying = {}
  for (const p of parsed) {
    if (!byUnderlying[p.underlying]) byUnderlying[p.underlying] = []
    byUnderlying[p.underlying].push(p)
  }

  const cookies = await getNseCookies()
  const prices = {}

  for (const [underlying, items] of Object.entries(byUnderlying)) {
    try {
      const chainData = await fetchOptionChain(underlying, cookies)
      for (const item of items) {
        const ltp = matchLtp(chainData, item)
        if (ltp != null) prices[item.symbol] = ltp
      }
    } catch (err) {
      console.error(`fo-prices: error for ${underlying}:`, err.message)
    }
  }

  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=30')
  res.json(prices)
}
