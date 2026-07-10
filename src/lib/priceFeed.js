import { isBondSymbol } from './format'

const CACHE_KEY = 'live_prices'
const CACHE_TTL = 300000

function loadCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return {}
    const cached = JSON.parse(raw)
    if (Date.now() - cached.ts > CACHE_TTL) return {}
    return cached.data || {}
  } catch { return {} }
}

function saveCache(data) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data }))
  } catch {}
}

export async function fetchPrices(symbols) {
  const unique = [...new Set(symbols.map(s => s.trim().toUpperCase()).filter(Boolean))]
  const stocks = unique.filter(s => !isBondSymbol(s))
  const cached = loadCache()

  try {
    const res = await fetch(`/api/prices?symbols=${stocks.join(',')}`)
    if (res.ok) {
      const fresh = await res.json()
      const merged = { ...cached, ...fresh }
      saveCache(merged)
      return merged
    }
  } catch {}

  return { ...cached }
}
