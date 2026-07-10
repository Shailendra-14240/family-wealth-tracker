let cache = {}
let lastFetch = 0
const CACHE_TTL = 180000

export async function fetchPrices(symbols) {
  const unique = [...new Set(symbols.map(s => s.trim().toUpperCase()).filter(Boolean))]
  const now = Date.now()
  const cached = {}

  if (now - lastFetch < CACHE_TTL) {
    for (const sym of unique) {
      if (cache[sym] !== undefined) cached[sym] = cache[sym]
    }
    return cached
  }

  const uncached = unique.filter(sym => cache[sym] === undefined)
  if (uncached.length === 0) {
    for (const sym of unique) cached[sym] = cache[sym]
    return cached
  }

  try {
    const res = await fetch(`/api/prices?symbols=${uncached.join(',')}`)
    if (res.ok) {
      const data = await res.json()
      Object.assign(cache, data)
      lastFetch = now
    }
  } catch (err) {
    console.error('Price fetch failed:', err)
  }

  for (const sym of unique) {
    if (cache[sym] !== undefined) cached[sym] = cache[sym]
  }
  return cached
}
