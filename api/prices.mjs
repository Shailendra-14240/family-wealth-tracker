const SYMBOL_MAP = {
  'NIFTBEES': 'NIFTYBEES',
}

const SUFFIX_ORDER = ['.NS', '.BO']
const DELAY_MS = 350

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
}

async function fetchYahooPrice(yahooSym) {
  const resp = await fetch(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSym)}?range=1d&interval=1d`,
    { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' } }
  )
  if (!resp.ok) return null
  const data = await resp.json()
  return data?.chart?.result?.[0]?.meta?.regularMarketPrice ?? null
}

async function searchYahooSymbol(query) {
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

  for (const sym of list) {
    const mapped = SYMBOL_MAP[sym] || sym
    let price = null

    // Try primary suffix
    for (const suffix of SUFFIX_ORDER) {
      price = await fetchYahooPrice(mapped + suffix)
      if (price != null) break
      await sleep(DELAY_MS)
    }

    // Fallback: search Yahoo for correct symbol
    if (price == null) {
      const found = await searchYahooSymbol(mapped)
      if (found && found !== mapped) {
        await sleep(DELAY_MS)
        price = await fetchYahooPrice(found)
      }
    }

    if (price != null) results[sym] = price
    await sleep(DELAY_MS)
  }

  res.setHeader('Cache-Control', 's-maxage=180, stale-while-revalidate=60')
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.json(results)
}
