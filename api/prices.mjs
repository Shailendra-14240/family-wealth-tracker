const SYMBOL_MAP = {
  'NIFTBEES': 'NIFTYBEES',
}

const SUFFIX_ORDER = ['.NS', '.BO']

async function searchSymbol(query) {
  try {
    const resp = await fetch(
      `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=5&newsCount=0`,
      { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' } }
    )
    if (!resp.ok) return null
    const data = await resp.json()
    const match = data?.quotes?.find(q => {
      const exch = q.exchange || ''
      return exch === 'NSI' || exch === 'BSE'
    })
    return match?.symbol || null
  } catch {
    return null
  }
}

export default async function handler(req, res) {
  const { symbols } = req.query
  if (!symbols) return res.status(400).json({ error: 'symbols parameter required' })

  const list = symbols.split(',').map(s => s.trim().toUpperCase()).filter(Boolean)
  const results = {}

  await Promise.allSettled(list.map(async (sym) => {
    const mapped = SYMBOL_MAP[sym] || sym
    for (const suffix of SUFFIX_ORDER) {
      try {
        const yahooSym = mapped + suffix
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
    // Fallback: search Yahoo for the correct symbol
    if (!results[sym]) {
      const found = await searchSymbol(mapped)
      if (found && found !== mapped) {
        try {
          const resp = await fetch(
            `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(found)}?range=1d&interval=1d`,
            { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' } }
          )
          if (resp.ok) {
            const data = await resp.json()
            const price = data?.chart?.result?.[0]?.meta?.regularMarketPrice
            if (price != null) results[sym] = price
          }
        } catch {}
      }
    }
  }))

  res.setHeader('Cache-Control', 's-maxage=180, stale-while-revalidate=60')
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.json(results)
}
