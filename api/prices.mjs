const MAP = { 'NIFTBEES': 'NIFTYBEES' }
const SUFFIXES = ['.NS', '.BO']
const AV_KEY = process.env.ALPHA_VANTAGE_KEY

export default async function handler(req, res) {
  const symbols = req.query.symbols
  if (!symbols) return res.status(400).json({ error: 'symbols required' })

  const list = symbols.split(',').map(s => s.trim().toUpperCase()).filter(Boolean)
  const prices = {}

  const results = await Promise.allSettled(list.map(async (sym) => {
    const mapped = MAP[sym] || sym
    for (const sfx of SUFFIXES) {
      try {
        const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(mapped)}${sfx}?range=1d&interval=1d`, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
        })
        if (r.ok) {
          const d = await r.json()
          const p = d?.chart?.result?.[0]?.meta?.regularMarketPrice
          if (p != null) { prices[sym] = p; return }
        }
      } catch {}
    }
    if (AV_KEY) {
      try {
        const r = await fetch(`https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${mapped}.BSE&apikey=${AV_KEY}`)
        if (r.ok) {
          const d = await r.json()
          const p = parseFloat(d?.['Global Quote']?.['05. price'])
          if (!isNaN(p)) prices[sym] = p
        }
      } catch {}
    }
  }))

  res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate=60')
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.json(prices)
}
