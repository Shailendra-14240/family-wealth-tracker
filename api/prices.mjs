const MAP = { 'NIFTBEES': 'NIFTYBEES', 'MOM': 'MOM100' }
const AV_KEY = process.env.ALPHA_VANTAGE_KEY

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

async function fetchYahoo(sym) {
  const mapped = MAP[sym] || sym
  for (const sfx of ['.NS', '.BO']) {
    try {
      const r = await fetch(
        `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(mapped)}${sfx}?range=1d&interval=1d`,
        { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36' } }
      )
      if (!r.ok) continue
      const d = await r.json()
      const p = d?.chart?.result?.[0]?.meta?.regularMarketPrice
      if (p != null) return p
    } catch {}
  }
  return null
}

async function fetchBatch(symbols) {
  if (!AV_KEY || !symbols.length) return {}
  try {
    const r = await fetch(
      `https://www.alphavantage.co/query?function=BATCH_STOCK_QUOTES&symbols=${symbols.join(',')}&apikey=${AV_KEY}`
    )
    if (!r.ok) return {}
    const d = await r.json()
    const results = {}
    for (const q of (d?.['Stock Quotes'] || [])) {
      const sym = (q?.['1. symbol'] || '').replace(/\.(NS|BO|BSE|NSE)$/i, '').toUpperCase()
      const price = parseFloat(q?.['2. price'])
      if (sym && !isNaN(price)) results[sym] = price
    }
    return results
  } catch { return {} }
}

export default async function handler(req, res) {
  const query = req.query.symbols
  if (!query) return res.status(400).json({ error: 'symbols required' })

  const list = query.split(',').map(s => s.trim().toUpperCase()).filter(Boolean)
  const CONCURRENCY = 3
  const results = {}
  const failed = []

  // Sequential batches of 3 — avoids Yahoo rate limiting
  for (let i = 0; i < list.length; i += CONCURRENCY) {
    const batch = list.slice(i, i + CONCURRENCY)
    const settled = await Promise.allSettled(batch.map(sym => fetchYahoo(sym)))
    batch.forEach((sym, j) => {
      const price = settled[j].status === 'fulfilled' ? settled[j].value : null
      if (price != null) results[sym] = price
      else failed.push(MAP[sym] || sym)
    })
    if (i + CONCURRENCY < list.length) await sleep(150)
  }

  // Alpha Vantage batch for Yahoo misses
  if (failed.length) {
    const av = await fetchBatch(failed)
    Object.assign(results, av)
  }

  res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate=60')
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.json(results)
}
