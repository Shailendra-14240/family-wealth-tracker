import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { calculateHoldings } from '../lib/pnlCalc'
import { formatIndian, isBondSymbol } from '../lib/format'
import { fetchPrices } from '../lib/priceFeed'
import clsx from 'clsx'

export default function Holdings() {
  const [allTxns, setAllTxns] = useState([])
  const [allActions, setAllActions] = useState([])
  const [accounts, setAccounts] = useState([])
  const [currentPrices, setCurrentPrices] = useState({})
  const [loading, setLoading] = useState(true)
  const [accountFilter, setAccountFilter] = useState('')
  const [showClosed, setShowClosed] = useState(false)
  
  // Sortable/Filterable table
  const [sortBy, setSortBy] = useState('market_value')
  const [sortAsc, setSortAsc] = useState(false)
  const [activeFilterCol, setActiveFilterCol] = useState(null)
  const [columnFilters, setColumnFilters] = useState({})

  useEffect(() => {
    if (!supabase) return
    Promise.all([
      supabase.from('transactions').select('*').order('date'),
      supabase.from('corporate_actions').select('*'),
      supabase.from('accounts').select('id, name'),
    ]).then(([txnRes, actRes, acctRes]) => {
      if (txnRes.data) setAllTxns(txnRes.data)
      if (actRes.data) setAllActions(actRes.data)
      if (acctRes.data) setAccounts(acctRes.data)
      setLoading(false)
    })
  }, [])

  const filteredTxns = useMemo(() => {
    return accountFilter ? allTxns.filter(t => t.account_id === Number(accountFilter)) : allTxns
  }, [allTxns, accountFilter])

  const holdings = useMemo(() => calculateHoldings(filteredTxns, allActions), [filteredTxns, allActions])

  const allOpenSymbols = useMemo(() => [...new Set(holdings.filter(h => h.qty > 0).map(h => h.symbol))], [holdings])

  useEffect(() => {
    if (!allOpenSymbols.length) return
    const fetch = () => fetchPrices(allOpenSymbols).then(setCurrentPrices)
    fetch()
    const interval = setInterval(fetch, 180000)
    return () => clearInterval(interval)
  }, [allOpenSymbols])

  const processedHoldings = useMemo(() => {
    return holdings.map(h => {
      const price = currentPrices[h.symbol]
      const marketValue = price > 0 ? price * h.qty : 0
      const unrealizedPnl = h.qty > 0 && marketValue > 0 ? marketValue - h.invested : 0
      return { ...h, marketValue, unrealizedPnl, currentPrice: price }
    })
  }, [holdings, currentPrices])

  const { openPositions, closedPositions } = useMemo(() => {
    const open = processedHoldings.filter(h => h.qty > 0)
    const closed = processedHoldings.filter(h => h.qty <= 0 && h.realizedPnl !== 0)
    return { openPositions: open, closedPositions: closed }
  }, [processedHoldings])

  const sortedPositions = useMemo(() => {
    let positions = showClosed ? closedPositions : openPositions
    
    // Apply column filters
    if (columnFilters.symbol) {
      positions = positions.filter(h => h.symbol.toUpperCase().includes(columnFilters.symbol.toUpperCase()))
    }
    
    // Sort
    return [...positions].sort((a, b) => {
      let aVal, bVal
      switch(sortBy) {
        case 'symbol': aVal = a.symbol; bVal = b.symbol; break
        case 'qty': aVal = a.qty; bVal = b.qty; break
        case 'invested': aVal = a.invested; bVal = b.invested; break
        case 'avgCost': aVal = a.avgCost; bVal = b.avgCost; break
        case 'market_value': aVal = a.marketValue; bVal = b.marketValue; break
        case 'unrealized': aVal = a.unrealizedPnl; bVal = b.unrealizedPnl; break
        case 'realized': aVal = a.realizedPnl; bVal = b.realizedPnl; break
        default: aVal = a.marketValue; bVal = b.marketValue
      }
      if (typeof aVal === 'string') {
        return sortAsc ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal)
      }
      return sortAsc ? aVal - bVal : bVal - aVal
    })
  }, [openPositions, closedPositions, showClosed, sortBy, sortAsc, columnFilters])

  const summary = useMemo(() => {
    const pos = showClosed ? closedPositions : openPositions
    return {
      invested: pos.reduce((sum, h) => sum + h.invested, 0),
      marketValue: pos.reduce((sum, h) => sum + h.marketValue, 0),
      realizedPnl: pos.reduce((sum, h) => sum + h.realizedPnl, 0),
      unrealizedPnl: pos.reduce((sum, h) => sum + h.unrealizedPnl, 0),
    }
  }, [openPositions, closedPositions, showClosed])

  if (loading) return <p className="text-center text-gray-500 mt-10">Loading...</p>

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <FilterButton active={!showClosed} onClick={() => setShowClosed(false)}>Open</FilterButton>
          <FilterButton active={showClosed} onClick={() => setShowClosed(true)}>Closed</FilterButton>
        </div>
        <div className="flex items-center gap-2">
          <select value={accountFilter} onChange={e => setAccountFilter(e.target.value)} className="input-base">
            <option value="">All Accounts</option>
            {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
      </div>

      <SummaryCard summary={summary} showClosed={showClosed} />

      <div className="rounded-xl bg-gray-900/70 border border-gray-800/80 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-900 text-xs text-gray-400 uppercase tracking-wider">
              <tr>
                {/* Symbol */}
                <th 
                  scope="col" 
                  onClick={() => { setSortBy('symbol'); setSortAsc(!sortAsc) }}
                  className="px-4 py-3 cursor-pointer hover:bg-gray-800/50 transition"
                >
                  <div className="flex items-center gap-1">
                    <span>Symbol {sortBy === 'symbol' && (sortAsc ? '▲' : '▼')}</span>
                  </div>
                  {activeFilterCol === 'symbol' && (
                    <input
                      type="text"
                      placeholder="Filter..."
                      value={columnFilters.symbol || ''}
                      onChange={(e) => setColumnFilters({...columnFilters, symbol: e.target.value})}
                      onClick={(e) => e.stopPropagation()}
                      className="w-full mt-1 px-2 py-1 text-xs bg-gray-700 text-white rounded border border-gray-600"
                      autoFocus
                    />
                  )}
                </th>
                
                {/* Qty */}
                <th 
                  scope="col" 
                  onClick={() => { setSortBy('qty'); setSortAsc(!sortAsc) }}
                  className="px-4 py-3 text-right cursor-pointer hover:bg-gray-800/50 transition"
                >
                  <span>Qty {sortBy === 'qty' && (sortAsc ? '▲' : '▼')}</span>
                </th>
                
                {/* Avg Cost */}
                <th 
                  scope="col" 
                  onClick={() => { setSortBy('avgCost'); setSortAsc(!sortAsc) }}
                  className="px-4 py-3 text-right cursor-pointer hover:bg-gray-800/50 transition"
                >
                  <span>Avg. Cost {sortBy === 'avgCost' && (sortAsc ? '▲' : '▼')}</span>
                </th>
                
                {/* LTP */}
                {!showClosed && (
                  <th scope="col" className="px-4 py-3 text-right">LTP</th>
                )}
                
                {/* Invested */}
                <th 
                  scope="col" 
                  onClick={() => { setSortBy('invested'); setSortAsc(!sortAsc) }}
                  className="px-4 py-3 text-right cursor-pointer hover:bg-gray-800/50 transition"
                >
                  <span>Invested {sortBy === 'invested' && (sortAsc ? '▲' : '▼')}</span>
                </th>
                
                {/* Market Value */}
                {!showClosed && (
                  <th 
                    scope="col" 
                    onClick={() => { setSortBy('market_value'); setSortAsc(!sortAsc) }}
                    className="px-4 py-3 text-right cursor-pointer hover:bg-gray-800/50 transition"
                  >
                    <span>Market Value {sortBy === 'market_value' && (sortAsc ? '▲' : '▼')}</span>
                  </th>
                )}

                {/* P&L */}
                <th 
                  scope="col" 
                  onClick={() => { setSortBy(showClosed ? 'realized' : 'unrealized'); setSortAsc(!sortAsc) }}
                  className="px-4 py-3 text-right cursor-pointer hover:bg-gray-800/50 transition"
                >
                  <span>{showClosed ? 'Realized' : 'Unrealized'} P&L {(sortBy === 'realized' || sortBy === 'unrealized') && (sortAsc ? '▲' : '▼')}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedPositions.map(h => <HoldingRow key={h.symbol} holding={h} isClosed={showClosed} />)}
            </tbody>
          </table>
        </div>
        {sortedPositions.length === 0 && (
          <p className="text-center text-gray-500 py-10">No {showClosed ? 'closed' : 'open'} positions.</p>
        )}
      </div>
    </div>
  )
}

const FilterButton = ({ active, onClick, children }) => (
  <button onClick={onClick} className={clsx(
    'px-3 py-1.5 text-sm font-medium rounded-md transition-colors',
    active ? 'bg-primary-500 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
  )}>
    {children}
  </button>
)

const SummaryCard = ({ summary, showClosed }) => (
  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
    <Stat label="Invested" value={summary.invested} />
    {!showClosed && <Stat label="Market Value" value={summary.marketValue} />}
    <Stat label={showClosed ? "Total Realized" : "Total Unrealized"} value={showClosed ? summary.realizedPnl : summary.unrealizedPnl} isPnl />
    {showClosed && <Stat label="From Closed" value={summary.invested} />}
  </div>
)

const Stat = ({ label, value, isPnl = false }) => {
  const color = isPnl ? (value >= 0 ? 'text-emerald-400' : 'text-red-400') : 'text-white'
  return (
    <div className="rounded-xl bg-gray-900/70 border border-gray-800/80 p-4">
      <p className="text-xs text-gray-500 uppercase tracking-wider">{label}</p>
      <p className={clsx('text-lg font-bold mt-1', color)}>
        {isPnl && value > 0 ? '+' : ''}₹{formatIndian(value)}
      </p>
    </div>
  )
}

const HoldingRow = ({ holding: h, isClosed }) => (
  <tr className="border-b border-gray-800/80 hover:bg-gray-800/50 transition-colors">
    <th scope="row" className="px-4 py-3 font-medium text-white whitespace-nowrap">{h.symbol}</th>
    <td className="px-4 py-3 text-right">{formatIndian(h.qty)}</td>
    <td className="px-4 py-3 text-right">₹{formatIndian(h.avgCost)}</td>
    {!isClosed && (
      <td className="px-4 py-3 text-right">
        {h.currentPrice > 0 ? `₹${formatIndian(h.currentPrice)}` : <span className="text-gray-500">N/A</span>}
      </td>
    )}
    <td className="px-4 py-3 text-right">₹{formatIndian(h.invested)}</td>
    {!isClosed && (
      <td className="px-4 py-3 text-right">
        {h.marketValue > 0 ? `₹${formatIndian(h.marketValue)}` : <span className="text-gray-500">N/A</span>}
      </td>
    )}
    <td className={clsx('px-4 py-3 text-right font-medium', isClosed || h.unrealizedPnl >= 0 ? 'text-emerald-400' : 'text-red-400')}>
      {isClosed ? (
        `${h.realizedPnl >= 0 ? '+' : ''}₹${formatIndian(h.realizedPnl)}`
      ) : (
        h.marketValue > 0 ? `${h.unrealizedPnl >= 0 ? '+' : ''}₹${formatIndian(h.unrealizedPnl)}` : <span className="text-gray-500">N/A</span>
      )}
    </td>
  </tr>
)
