import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { calculateHoldings, calculateSummary } from '../lib/pnlCalc'
import { formatIndian } from '../lib/format'

export default function Holdings() {
  const [allTxns, setAllTxns] = useState([])
  const [allActions, setAllActions] = useState([])
  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(true)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [symbolFilter, setSymbolFilter] = useState('')
  const [accountFilter, setAccountFilter] = useState('')
  const [currentOnly, setCurrentOnly] = useState(true)

  useEffect(() => {
    if (!supabase) return
    Promise.all([
      supabase.from('transactions').select('*').order('date').limit(1000000),
      supabase.from('corporate_actions').select('*'),
      supabase.from('accounts').select('id, name'),
    ]).then(([txnRes, actRes, acctRes]) => {
      if (txnRes.data) setAllTxns(txnRes.data)
      if (actRes.data) setAllActions(actRes.data)
      if (acctRes.data) setAccounts(acctRes.data)
      setLoading(false)
    })
  }, [])

  const latestPrices = useMemo(() => {
    const prices = {}
    for (const t of allTxns) {
      if (t.type === 'buy' || t.type === 'sell') prices[t.symbol] = Number(t.price)
    }
    return prices
  }, [allTxns])

  const filtered = useMemo(() => {
    let txns = allTxns
    if (dateFrom) txns = txns.filter(t => t.date >= dateFrom)
    if (dateTo) txns = txns.filter(t => t.date <= dateTo)
    if (symbolFilter.trim()) {
      const symbols = symbolFilter.toUpperCase().split(',').map(s => s.trim()).filter(Boolean)
      if (symbols.length) txns = txns.filter(t => symbols.includes(t.symbol))
    }
    if (accountFilter) txns = txns.filter(t => t.account_id === Number(accountFilter))
    return txns
  }, [allTxns, dateFrom, dateTo, symbolFilter, accountFilter])

  const holdings = useMemo(() => calculateHoldings(filtered, allActions), [filtered, allActions])

  const { openPositions, closedPositions } = useMemo(() => {
    const open = []
    const closed = []
    for (const h of holdings) {
      if (h.qty > 0) {
        const currentPrice = latestPrices[h.symbol] || 0
        open.push({ ...h, currentPrice, unrealizedPnl: currentPrice > 0 ? Math.round((currentPrice - h.avgCost) * h.qty * 100) / 100 : 0 })
      } else if (h.realizedPnl !== 0) {
        closed.push(h)
      }
    }
    return { openPositions: open, closedPositions: closed }
  }, [holdings, latestPrices])

  const displayPositions = useMemo(() => {
    const all = currentOnly ? openPositions : [...openPositions, ...closedPositions]
    return all
  }, [currentOnly, openPositions, closedPositions])

  const summary = useMemo(() => {
    const totalInvested = openPositions.reduce((s, h) => s + h.invested, 0)
    const totalRealizedPnl = holdings.reduce((s, h) => s + h.realizedPnl, 0)
    const totalUnrealizedPnl = openPositions.reduce((s, h) => s + h.unrealizedPnl, 0)
    return {
      totalInvested: Math.round(totalInvested * 100) / 100,
      totalRealizedPnl: Math.round(totalRealizedPnl * 100) / 100,
      totalUnrealizedPnl: Math.round(totalUnrealizedPnl * 100) / 100,
    }
  }, [openPositions, holdings])

  if (!supabase) return <p className="text-gray-500 text-center mt-10">Connect Supabase to see holdings</p>
  if (loading) return <p className="text-gray-500 text-center mt-10">Loading...</p>

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-gray-900/60 border border-gray-800/50 p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Filters</p>
          <p className="text-xs text-gray-600">{filtered.length} txns</p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
          <div>
            <label className="text-[10px] text-gray-500 mb-1 block">From</label>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              className="w-full bg-gray-800/80 border border-gray-700/50 text-white rounded-lg px-2 py-1.5 text-xs" />
          </div>
          <div>
            <label className="text-[10px] text-gray-500 mb-1 block">To</label>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
              className="w-full bg-gray-800/80 border border-gray-700/50 text-white rounded-lg px-2 py-1.5 text-xs" />
          </div>
          <div>
            <label className="text-[10px] text-gray-500 mb-1 block">Symbol</label>
            <input type="text" placeholder="RELIANCE, TCS" value={symbolFilter}
              onChange={e => setSymbolFilter(e.target.value)}
              className="w-full bg-gray-800/80 border border-gray-700/50 text-white rounded-lg px-2 py-1.5 text-xs placeholder:text-gray-600" />
          </div>
          <div>
            <label className="text-[10px] text-gray-500 mb-1 block">Account</label>
            <select value={accountFilter} onChange={e => setAccountFilter(e.target.value)}
              className="w-full bg-gray-800/80 border border-gray-700/50 text-white rounded-lg px-2 py-1.5 text-xs">
              <option value="">All</option>
              {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
        </div>
        <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer">
          <input type="checkbox" checked={currentOnly} onChange={e => setCurrentOnly(e.target.checked)}
            className="accent-blue-500 w-3.5 h-3.5 rounded" />
          Current holdings only
        </label>
      </div>

      <div className="rounded-xl bg-gray-900/60 border border-gray-800/50 p-4">
        <div className="grid grid-cols-3 gap-4">
          <div>
            <p className="text-[10px] text-gray-500 uppercase tracking-wider">Invested</p>
            <p className="text-base sm:text-lg font-bold text-white mt-0.5">₹{formatIndian(summary.totalInvested)}</p>
          </div>
          <div className="text-center">
            <p className="text-[10px] text-gray-500 uppercase tracking-wider">Unrealized P&L</p>
            <p className={`text-base sm:text-lg font-bold mt-0.5 ${summary.totalUnrealizedPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {summary.totalUnrealizedPnl >= 0 ? '+' : ''}₹{formatIndian(summary.totalUnrealizedPnl)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[10px] text-gray-500 uppercase tracking-wider">Realized P&L</p>
            <p className={`text-base sm:text-lg font-bold mt-0.5 ${summary.totalRealizedPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {summary.totalRealizedPnl >= 0 ? '+' : ''}₹{formatIndian(summary.totalRealizedPnl)}
            </p>
          </div>
        </div>
      </div>

      {openPositions.length > 0 && (
        <>
          <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wider">Open Positions</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {openPositions.map((h) => (
              <div key={h.symbol} className="rounded-xl bg-gray-900/60 border border-gray-800/50 p-3 hover:border-gray-700/50 transition-colors">
                <div className="flex justify-between items-center mb-1.5">
                  <p className="font-semibold text-sm text-white">{h.symbol}</p>
                  <span className="text-[10px] text-gray-400">{formatIndian(h.qty)} shares</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-gray-400">Avg ₹{formatIndian(h.avgCost)}</span>
                  <span className="text-white font-medium">₹{formatIndian(h.invested)}</span>
                </div>
                <div className="grid grid-cols-2 gap-1 mt-0.5 text-[10px]">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Unrealized</span>
                    <span className={`font-medium ${h.unrealizedPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {h.unrealizedPnl >= 0 ? '+' : ''}₹{formatIndian(h.unrealizedPnl)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Realized</span>
                    <span className={`font-medium ${h.realizedPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {h.realizedPnl >= 0 ? '+' : ''}₹{formatIndian(h.realizedPnl)}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {closedPositions.length > 0 && !currentOnly && (
        <>
          <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wider mt-4">Closed Positions</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {closedPositions.map((h) => (
              <div key={h.symbol} className="rounded-xl bg-gray-900/60 border border-gray-800/50 p-3 opacity-80 hover:opacity-100 transition-opacity">
                <div className="flex justify-between items-center mb-1.5">
                  <p className="font-semibold text-sm text-gray-300">{h.symbol}</p>
                  <span className="text-[10px] text-gray-600">Closed</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-gray-500">Avg ₹{formatIndian(h.avgCost)}</span>
                  <span className="text-gray-500">₹{formatIndian(h.invested)}</span>
                </div>
                <div className="flex justify-between items-center text-xs mt-0.5">
                  <span className="text-gray-500">Realized P&L</span>
                  <span className={`font-medium ${h.realizedPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {h.realizedPnl >= 0 ? '+' : ''}₹{formatIndian(h.realizedPnl)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {displayPositions.length === 0 && (
        <p className="text-gray-500 text-center py-10 text-sm">No holdings match the current filters.</p>
      )}
    </div>
  )
}
