// src/lib/foPriceFeed.js
// Client-side lib to fetch live LTP for open F&O positions via /api/fo-prices

const FO_CACHE_KEY = 'fo_live_prices'
const FO_CACHE_TTL = 60000 // 60s — options move fast

function loadFoCache() {
  try {
    const raw = localStorage.getItem(FO_CACHE_KEY)
    if (!raw) return {}
    const cached = JSON.parse(raw)
    if (Date.now() - cached.ts > FO_CACHE_TTL) return {}
    return cached.data || {}
  } catch { return {} }
}

function saveFoCache(data) {
  try {
    localStorage.setItem(FO_CACHE_KEY, JSON.stringify({ ts: Date.now(), data }))
  } catch {}
}

/**
 * Fetch live LTPs for a list of option symbols (e.g. "NIFTY26JAN24000CE")
 * Returns: { [symbol]: ltp }
 */
export async function fetchFoPrices(symbols) {
  if (!symbols?.length) return {}
  const uniq = [...new Set(symbols.map(s => s.toUpperCase().trim()))].filter(Boolean)
  const cached = loadFoCache()

  try {
    const res = await fetch(`/api/fo-prices?symbols=${uniq.join(',')}`)
    if (res.ok) {
      const fresh = await res.json()
      const merged = { ...cached, ...fresh }
      saveFoCache(merged)
      return merged
    }
  } catch {}

  return { ...cached }
}
