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
      {/* Filters */}
      <div className="bg-gray-900 rounded-xl p-4 space-y-3">
        <p className="text-sm text-gray-400 font-medium">Filters</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-gray-500">From</label>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              className="w-full bg-gray-800 rounded px-2 py-1.5 text-sm mt-1" />
          </div>
          <div>
            <label className="text-xs text-gray-500">To</label>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
              className="w-full bg-gray-800 rounded px-2 py-1.5 text-sm mt-1" />
          </div>
        </div>
        <div>
          <label className="text-xs text-gray-500">Symbols (comma-separated)</label>
          <input type="text" placeholder="RELIANCE, TCS, INFY" value={symbolFilter}
            onChange={e => setSymbolFilter(e.target.value)}
            className="w-full bg-gray-800 rounded px-2 py-1.5 text-sm mt-1" />
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer">
          <input type="checkbox" checked={currentOnly} onChange={e => setCurrentOnly(e.target.checked)}
            className="accent-blue-600 w-4 h-4" />
          Current holdings only (qty &gt; 0)
        </label>
        <p className="text-xs text-gray-600">
          Showing {filtered.length} of {allTxns.length} transactions
        </p>
      </div>

      {/* Summary */}
      <div className="bg-gray-900 rounded-xl p-4">
        <div className="flex justify-between items-center mb-1">
          <p className="text-sm text-gray-400">Total Invested</p>
          <p className="text-sm md:text-xl font-bold">₹{formatIndian(summary.totalInvested)}</p>
        </div>
        <div className="flex justify-between items-center">
          <p className="text-sm text-gray-400">Realized P&L</p>
          <p className={`text-sm md:text-lg font-semibold ${summary.totalRealizedPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {summary.totalRealizedPnl >= 0 ? '+' : ''}₹{formatIndian(summary.totalRealizedPnl)}
          </p>
        </div>
      </div>

      <h2 className="text-lg font-semibold">Current Holdings</h2>

      {displayHoldings.length === 0 && (
        <p className="text-gray-500 text-center py-10">No holdings match the current filters.</p>
      )}

      <div className="space-y-2">
        {displayHoldings.map((h) => (
          <div key={h.symbol} className="bg-gray-900 rounded-xl p-4">
            <div className="flex justify-between items-start">
              <div>
                <p className="font-semibold text-lg">{h.symbol}</p>
                <p className="text-xs text-gray-500">{h.qty} shares</p>
                <p className="text-xs text-gray-600">Avg cost: ₹{formatIndian(h.avgCost)}</p>
              </div>
              <div className="text-right">
                <p className="font-medium">₹{formatIndian(h.invested)}</p>
                <p className={`text-sm ${h.realizedPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  Realized: {h.realizedPnl >= 0 ? '+' : ''}₹{formatIndian(h.realizedPnl)}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
