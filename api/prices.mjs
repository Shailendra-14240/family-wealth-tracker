const SYMBOL_MAP = {
  'NIFTBEES': 'NIFTYBEES',
}

const SUFFIX_ORDER = ['.NS', '.BO']
const BATCH_SIZE = 2
const BATCH_DELAY_MS = 300

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
}

function isBond(sym) {
  if (['RECLTD', 'SGBMR29XII', 'TMCV', 'TMPV', 'BAJFINANCE6', 'LIQUIDCASE'].includes(sym)) return true
  return /^\d/.test(sym) || /-(?:N\d|GB)$/i.test(sym)
}

// --- Yahoo Finance ---
async function yahooPrice(yahooSym, attempt = 0) {
  try {
    const resp = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSym)}?range=1d&interval=1d`,
      { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' } }
    )
    if (resp.status === 429) return null
    if (!resp.ok) {
      if (attempt < 2) { await sleep([300, 700][attempt]); return yahooPrice(yahooSym, attempt + 1) }
      return null
    }
    const data = await resp.json()
    return data?.chart?.result?.[0]?.meta?.regularMarketPrice ?? null
  } catch {
    if (attempt < 2) { await sleep([300, 700][attempt]); return yahooPrice(yahooSym, attempt + 1) }
    return null
  }
}

// --- Alpha Vantage ---
const AV_KEY = process.env.ALPHA_VANTAGE_KEY

async function avPrice(sym) {
  if (!AV_KEY) return null
  try {
    const resp = await fetch(
      `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(sym)}.BSE&apikey=${AV_KEY}`
    )
    if (!resp.ok) return null
    const data = await resp.json()
    const price = data?.['Global Quote']?.['05. price']
    return price ? parseFloat(price) : null
  } catch { return null }
}

async function fetchSymbol(sym) {
  const mapped = SYMBOL_MAP[sym] || sym

  // Try Yahoo with .NS and .BO
  for (const suffix of SUFFIX_ORDER) {
    const price = await yahooPrice(mapped + suffix)
    if (price != null) return price
  }

  // Fallback to Alpha Vantage
  if (AV_KEY) {
    const price = await avPrice(mapped)
    if (price != null) return price
  }

  return null
}

export default async function handler(req, res) {
  const { symbols } = req.query
  if (!symbols) return res.status(400).json({ error: 'symbols parameter required' })

  const list = symbols.split(',').map(s => s.trim().toUpperCase()).filter(Boolean)
  const stocks = list.filter(s => !isBond(s))
  const results = {}

  for (let i = 0; i < stocks.length; i += BATCH_SIZE) {
    const batch = stocks.slice(i, i + BATCH_SIZE)
    const prices = await Promise.allSettled(batch.map(fetchSymbol))
    prices.forEach((p, idx) => {
      if (p.status === 'fulfilled' && p.value != null) results[batch[idx]] = p.value
    })
    if (i + BATCH_SIZE < list.length) await sleep(BATCH_DELAY_MS)
  }

  res.setHeader('Cache-Control', 's-maxage=180, stale-while-revalidate=60')
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.json(results)
}
