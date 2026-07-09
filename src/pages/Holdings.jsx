import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { calculateHoldings, calculateSummary } from '../lib/pnlCalc'
import { formatIndian } from '../lib/format'

export default function Holdings() {
  const [allTxns, setAllTxns] = useState([])
  const [allActions, setAllActions] = useState([])
  const [loading, setLoading] = useState(true)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [symbolFilter, setSymbolFilter] = useState('')
  const [currentOnly, setCurrentOnly] = useState(false)

  useEffect(() => {
    if (!supabase) return
    Promise.all([
      supabase.from('transactions').select('*').order('date').limit(1000000),
      supabase.from('corporate_actions').select('*'),
    ]).then(([txnRes, actRes]) => {
      if (txnRes.data) setAllTxns(txnRes.data)
      if (actRes.data) setAllActions(actRes.data)
      setLoading(false)
    })
  }, [])

  const filtered = useMemo(() => {
    let txns = allTxns
    if (dateFrom) txns = txns.filter(t => t.date >= dateFrom)
    if (dateTo) txns = txns.filter(t => t.date <= dateTo)
    if (symbolFilter.trim()) {
      const symbols = symbolFilter.toUpperCase().split(',').map(s => s.trim()).filter(Boolean)
      if (symbols.length) txns = txns.filter(t => symbols.includes(t.symbol))
    }
    return txns
  }, [allTxns, dateFrom, dateTo, symbolFilter])

  const holdings = useMemo(() => calculateHoldings(filtered, allActions), [filtered, allActions])
  const displayHoldings = useMemo(() => currentOnly ? holdings.filter(h => h.qty > 0) : holdings, [holdings, currentOnly])
  const summary = useMemo(() => calculateSummary(holdings), [holdings])

  if (!supabase) return <p className="text-gray-500 text-center mt-10">Connect Supabase to see holdings</p>
  if (loading) return <p className="text-gray-500 text-center mt-10">Loading...</p>

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-gray-900/60 border border-gray-800/50 p-4">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">Filters</p>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">From</label>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              className="w-full bg-gray-800/80 border border-gray-700/50 text-white rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">To</label>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
              className="w-full bg-gray-800/80 border border-gray-700/50 text-white rounded-lg px-3 py-2 text-sm" />
          </div>
        </div>
        <div className="mb-3">
          <label className="text-xs text-gray-500 mb-1 block">Symbols (comma-separated)</label>
          <input type="text" placeholder="RELIANCE, TCS, INFY" value={symbolFilter}
            onChange={e => setSymbolFilter(e.target.value)}
            className="w-full bg-gray-800/80 border border-gray-700/50 text-white rounded-lg px-3 py-2 text-sm placeholder:text-gray-600" />
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer">
          <input type="checkbox" checked={currentOnly} onChange={e => setCurrentOnly(e.target.checked)}
            className="accent-blue-500 w-4 h-4 rounded" />
          Current holdings only
        </label>
        <p className="text-xs text-gray-600 mt-2">Showing {filtered.length} of {allTxns.length} transactions</p>
      </div>

      <div className="rounded-xl bg-gray-900/60 border border-gray-800/50 p-4">
        <div className="flex justify-between items-center">
          <span className="text-sm text-gray-400">Total Invested</span>
          <span className="text-base sm:text-lg md:text-xl font-bold text-white truncate">₹{formatIndian(summary.totalInvested)}</span>
        </div>
        <div className="flex justify-between items-center mt-1.5">
          <span className="text-sm text-gray-400">Realized P&L</span>
          <span className={`text-base sm:text-lg md:text-xl font-bold truncate ${summary.totalRealizedPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {summary.totalRealizedPnl >= 0 ? '+' : ''}₹{formatIndian(summary.totalRealizedPnl)}
          </span>
        </div>
      </div>

      <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wider">Current Holdings</h2>

      {displayHoldings.length === 0 && (
        <p className="text-gray-500 text-center py-10">No holdings match the current filters.</p>
      )}

      <div className="space-y-2">
        {displayHoldings.map((h) => (
          <div key={h.symbol} className="rounded-xl bg-gray-900/60 border border-gray-800/50 p-4 hover:border-gray-700/50 transition-colors">
            <div className="flex justify-between items-start">
              <div>
                <p className="font-semibold text-white">{h.symbol}</p>
                <p className="text-xs text-gray-400 mt-0.5">{formatIndian(h.qty)} shares</p>
                <p className="text-xs text-gray-500">Avg cost: ₹{formatIndian(h.avgCost)}</p>
              </div>
              <div className="text-right">
                <p className="font-medium text-white">₹{formatIndian(h.invested)}</p>
                <p className={`text-sm mt-0.5 ${h.realizedPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {h.realizedPnl >= 0 ? '+' : ''}₹{formatIndian(h.realizedPnl)}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
