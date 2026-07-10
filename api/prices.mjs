export default async function handler(req, res) {
  const { symbols } = req.query
  if (!symbols) return res.status(400).json({ error: 'symbols parameter required' })

  const list = symbols.split(',').map(s => s.trim().toUpperCase()).filter(Boolean)
  const results = {}

  await Promise.allSettled(list.map(async (sym) => {
    const urls = [`${sym}.NS`, `${sym}.BO`]
    for (const yahooSym of urls) {
      try {
        const resp = await fetch(
          `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSym)}?range=1d&interval=1d`,
          { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' } }
        )
        if (!resp.ok) continue
        const data = await resp.json()
        const price = data?.chart?.result?.[0]?.meta?.regularMarketPrice
        if (price != null) {
          results[sym] = price
          return
        }
      } catch {}
    }
  }))

  res.setHeader('Cache-Control', 's-maxage=180, stale-while-revalidate=60')
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.json(results)
}
