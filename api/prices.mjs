const MAP = { 'NIFTBEES': 'NIFTYBEES' }
const AV_KEY = process.env.ALPHA_VANTAGE_KEY

async function fetchYahoo(sym) {
  const mapped = MAP[sym] || sym
  for (const sfx of ['.NS', '.BO']) {
    try {
      const r = await fetch(
        `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(mapped)}${sfx}?range=1d&interval=1d`,
        { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' } }
      )
      if (!r.ok) continue
      const d = await r.json()
      const p = d?.chart?.result?.[0]?.meta?.regularMarketPrice
      if (p != null) return p
    } catch {}
  }
  return null
}

async function fetchAlphaVantageBatch(symbols) {
  if (!AV_KEY || !symbols.length) return {}
  const results = {}
  // AV batch endpoint accepts comma-separated symbols
  const r = await fetch(
    `https://www.alphavantage.co/query?function=BATCH_STOCK_QUOTES&symbols=${symbols.join(',')}&apikey=${AV_KEY}`
  )
  if (!r.ok) return results
  const d = await r.json()
  const quotes = d?.['Stock Quotes'] || []
  for (const q of quotes) {
    const raw = q?.['1. symbol'] || ''
    const sym = raw.replace(/\.(NS|BO|BSE|NSE)$/i, '').toUpperCase()
    const price = parseFloat(q?.['2. price'])
    if (sym && !isNaN(price)) results[sym] = price
  }
  return results
}

export default async function handler(req, res) {
  const symbols = req.query.symbols
  if (!symbols) return res.status(400).json({ error: 'symbols required' })

  const list = symbols.split(',').map(s => s.trim().toUpperCase()).filter(Boolean)
  const results = {}
  const failed = []

  // 1. Yahoo in parallel — fast, handles most Indian stocks
  const settled = await Promise.allSettled(list.map(sym => fetchYahoo(sym)))

  list.forEach((sym, i) => {
    const val = settled[i].status === 'fulfilled' ? settled[i].value : null
    if (val != null) results[sym] = val
    else failed.push(MAP[sym] || sym)
  })

  // 2. Alpha Vantage batch for anything Yahoo missed — single request
  if (failed.length) {
    const av = await fetchAlphaVantageBatch(failed)
    Object.assign(results, av)
  }

  res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate=60')
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.json(results)
}
