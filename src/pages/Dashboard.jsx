import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { calculateHoldings, calculateSummary } from '../lib/pnlCalc'
import { calculateFoPnl, calculateFoSummary } from '../lib/foPnlCalc'
import { formatIndian } from '../lib/format'
import { fetchPrices } from '../lib/priceFeed'
import { fetchFoPrices } from '../lib/foPriceFeed'
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import clsx from 'clsx'

// --- Tooltip Components ---
const NetWorthTooltip = ({ active, payload }) => {
  if (active && payload?.length) {
    return (
      <div className="rounded-lg bg-gray-800/80 backdrop-blur-sm border border-gray-700/50 p-2.5 shadow-lg">
        <p className="text-sm font-semibold text-white">₹{formatIndian(payload[0].value)}</p>
        <p className="text-xs text-gray-400">{payload[0].payload.date}</p>
      </div>
    )
  }
  return null
}

const HoldingsTooltip = ({ active, payload }) => {
  if (active && payload?.length) {
    const d = payload[0].payload
    return (
      <div className="rounded-lg bg-gray-800/80 backdrop-blur-sm border border-gray-700/50 p-2.5 shadow-lg text-xs space-y-1">
        <p className="font-bold text-white">{d.symbol}</p>
        <p>Qty: <span className="font-medium text-gray-200">{formatIndian(d.qty)}</span></p>
        <p>Avg. Cost: <span className="font-medium text-gray-200">₹{formatIndian(d.avgCost)}</span></p>
        {d.currentPrice > 0 && <p>LTP: <span className="font-medium text-gray-200">₹{formatIndian(d.currentPrice)}</span></p>}
        <p>Invested: <span className="font-medium text-blue-400">₹{formatIndian(d.invested)}</span></p>
        {d.marketValue > 0 && <p>Market Value: <span className="font-medium text-purple-400">₹{formatIndian(d.marketValue)}</span></p>}
        {d.unrealizedPnl !== 0 && (
          <p className={clsx('font-bold', d.unrealizedPnl > 0 ? 'text-emerald-400' : 'text-red-400')}>
            P/L: {d.unrealizedPnl > 0 ? '+' : ''}₹{formatIndian(d.unrealizedPnl)}
          </p>
        )}
      </div>
    )
  }
  return null
}

// --- Main Dashboard Component ---
export default function Dashboard() {
  // --- State ---
  const [accounts, setAccounts] = useState([])
  const [allTxns, setAllTxns] = useState([])
  const [foTxns, setFoTxns] = useState([])
  const [allActions, setAllActions] = useState([])
  const [snapshots, setSnapshots] = useState([])
  const [currentPrices, setCurrentPrices] = useState({})
  const [foLivePrices, setFoLivePrices] = useState({})
  const [loading, setLoading] = useState(true)

  // --- Data Fetching ---
  useEffect(() => {
    if (!supabase) return
    setLoading(true)
    Promise.all([
      supabase.from('accounts').select('*'),
      supabase.from('transactions').select('*').limit(1000000),
      supabase.from('corporate_actions').select('*'),
      supabase.from('net_worth_snapshots').select('*').order('date').limit(365),
      supabase.from('fo_transactions').select('*').limit(1000000),
    ]).then(([acctRes, txnRes, actRes, snapRes, foRes]) => {
      if (acctRes.data) setAccounts(acctRes.data)
      if (txnRes.data) setAllTxns(txnRes.data)
      if (actRes.data) setAllActions(actRes.data)
      if (snapRes.data) setSnapshots(snapRes.data)
      if (foRes.data) setFoTxns(foRes.data)
      setLoading(false)
    }).catch(err => {
      console.error(err)
      setLoading(false)
    })
  }, [])

  // --- Calculations ---
  const holdings = useMemo(() => calculateHoldings(allTxns, allActions), [allTxns, allActions])
  const summary = useMemo(() => calculateSummary(holdings), [holdings])
  const allOpenSymbols = useMemo(() => [...new Set(holdings.filter(h => h.qty > 0).map(h => h.symbol))], [holdings])

  const foSummary = useMemo(() => {
    const results = calculateFoPnl(foTxns)
    return calculateFoSummary(results)
  }, [foTxns])

  useEffect(() => {
    if (!allOpenSymbols.length) return
    const fetch = () => fetchPrices(allOpenSymbols).then(setCurrentPrices)
    fetch()
    const interval = setInterval(fetch, 180000)
    return () => clearInterval(interval)
  }, [allOpenSymbols])

  // Live F&O prices for open positions
  const openFoSymbols = useMemo(() => foTxns.length
    ? calculateFoPnl(foTxns).filter(r => r.netQty !== 0).map(r => r.symbol)
    : [], [foTxns])

  useEffect(() => {
    if (!openFoSymbols.length) return
    const doFetch = () => fetchFoPrices(openFoSymbols).then(setFoLivePrices)
    doFetch()
    const interval = setInterval(doFetch, 60000)
    return () => clearInterval(interval)
  }, [openFoSymbols])

  const totalUnrealizedPnl = useMemo(() => {
    return holdings.reduce((total, h) => {
      if (h.qty <= 0) return total
      const price = currentPrices[h.symbol]
      return price > 0 ? total + (price - h.avgCost) * h.qty : total
    }, 0)
  }, [holdings, currentPrices])

  const { netWorth, totalAssets, totalLiabilities } = useMemo(() => {
    const assets = accounts.filter(a => a.balance > 0).reduce((s, a) => s + Number(a.balance), 0)
    const liabilities = accounts.filter(a => a.balance < 0).reduce((s, a) => s + Number(a.balance), 0)
    const netWorth = assets + liabilities + summary.totalInvested + totalUnrealizedPnl
    return { netWorth, totalAssets: assets, totalLiabilities: liabilities }
  }, [accounts, summary.totalInvested, totalUnrealizedPnl])

  const foUnrealizedPnl = useMemo(() => {
    if (!Object.keys(foLivePrices).length) return null
    const openPositions = calculateFoPnl(foTxns).filter(r => r.netQty !== 0)
    return openPositions.reduce((total, r) => {
      const ltp = foLivePrices[r.symbol]
      if (ltp == null) return total
      // Short: profit when price falls; Long: profit when price rises
      const openPrice = r.netQty < 0
        ? r.openLots.reduce((s, l) => s + Math.abs(l.qty) * l.price, 0) / Math.abs(r.netQty)
        : r.openLots.reduce((s, l) => s + l.qty * l.price, 0) / r.netQty
      const pnl = r.netQty < 0
        ? (openPrice - ltp) * Math.abs(r.netQty)
        : (ltp - openPrice) * r.netQty
      return total + pnl
    }, 0)
  }, [foTxns, foLivePrices])

  const perAccountSummary = useMemo(() => {
    if (!accounts.length) return []
    return accounts.map(acct => {
      const txns = allTxns.filter(t => Number(t.account_id) === Number(acct.id))
      const h = calculateHoldings(txns, allActions)
      const s = calculateSummary(h)
      const unrealizedPnl = h.reduce((total, pos) => {
        if (pos.qty <= 0) return total
        const price = currentPrices[pos.symbol]
        return price > 0 ? total + (price - pos.avgCost) * pos.qty : total
      }, 0)

      const accountFoTxns = foTxns.filter(t => Number(t.account_id) === Number(acct.id))
      const foResults = calculateFoPnl(accountFoTxns)
      const foSumm = calculateFoSummary(foResults)

      return {
        ...acct,
        invested: s.totalInvested,
        realizedPnl: s.totalRealizedPnl,
        unrealizedPnl,
        foRealizedPnl: foSumm.totalRealizedPnl,
      }
    })
  }, [accounts, allTxns, allActions, currentPrices, foTxns])

  const topHoldings = useMemo(() => {
    const bySymbol = holdings.reduce((acc, h) => {
      if (h.qty > 0) {
        if (!acc[h.symbol]) acc[h.symbol] = { invested: 0, qty: 0 }
        acc[h.symbol].invested += h.invested
        acc[h.symbol].qty += h.qty
      }
      return acc
    }, {})

    return Object.entries(bySymbol)
      .map(([symbol, data]) => {
        const currentPrice = currentPrices[symbol] || 0
        const marketValue = currentPrice * data.qty
        const unrealizedPnl = marketValue - data.invested
        return { symbol, invested: data.invested, qty: data.qty, avgCost: data.invested / data.qty, currentPrice, marketValue, unrealizedPnl }
      })
      .sort((a, b) => b.marketValue - a.marketValue)
      .slice(0, 10)
  }, [holdings, currentPrices])

  // --- Render ---
  if (!supabase) return <p className="text-center text-gray-500 mt-10">Connect Supabase to see live data</p>
  if (loading) return <p className="text-center text-gray-500 mt-10">Loading...</p>

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
        <div className="md:col-span-2 rounded-2xl bg-gray-900/70 border border-gray-800/80 p-4 md:p-6">
          <p className="text-sm font-medium text-gray-400">Net Worth</p>
          <p className="text-3xl sm:text-4xl font-bold tracking-tight text-white mt-1">₹{formatIndian(netWorth)}</p>
          {snapshots.length > 1 ? (
            <div className="h-48 mt-4">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={snapshots} margin={{ top: 5, right: 20, left: -20, bottom: 5 }}>
                  <Tooltip content={<NetWorthTooltip />} />
                  <Line type="monotone" dataKey="net_worth" stroke="#3b82f6" strokeWidth={2.5} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-48 mt-4 flex items-center justify-center text-sm text-gray-500">
              Add entries on the Returns page to see a trend
            </div>
          )}
        </div>
        <div className="space-y-4">
          <StatCard label="Total Assets" value={totalAssets + summary.totalInvested + totalUnrealizedPnl} />
          <StatCard label="Total Liabilities" value={totalLiabilities} />
          <StatCard label="Invested" value={summary.totalInvested} />
          <StatCard label="Unrealized P&L" value={totalUnrealizedPnl} isPnl />
          <StatCard label="Realized P&L" value={summary.totalRealizedPnl} isPnl />
          <StatCard label="F&O Realized P&L" value={foSummary.totalRealizedPnl} isPnl />
          <StatCard
            label="F&O Open Premium"
            value={foSummary.totalOpenPremium}
            isPnl
            subtitle={foSummary.totalOpenPremium >= 0 ? 'Net seller' : 'Net buyer'}
          />
          {foUnrealizedPnl != null && (
            <StatCard label="F&O Unrealized P&L" value={Math.round(foUnrealizedPnl)} isPnl subtitle="Live" />
          )}
        </div>
      </div>

      <div className="rounded-2xl bg-gray-900/70 border border-gray-800/80 p-4 md:p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Top 10 Holdings</h2>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={topHoldings} layout="vertical" margin={{ left: 10, right: 10, top: 10, bottom: 10 }}>
              <XAxis type="number" hide />
              <YAxis type="category" dataKey="symbol" width={70} tick={{ fill: '#a1a1aa', fontSize: 12 }} axisLine={false} tickLine={false} />
              <Tooltip content={<HoldingsTooltip />} cursor={{ fill: 'rgba(161, 161, 170, 0.1)' }} />
              <Bar dataKey="marketValue" radius={[0, 8, 8, 0]}>
                {topHoldings.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={index % 2 === 0 ? '#3b82f6' : '#6366f1'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div>
        <h2 className="text-lg font-semibold text-white mb-4">Accounts</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {perAccountSummary.map(acct => <AccountCard key={acct.id} account={acct} />)}
        </div>
      </div>
    </div>
  )
}

// --- Sub-Components ---
const StatCard = ({ label, value, isPnl = false, subtitle = null }) => {
  const color = isPnl ? (value >= 0 ? 'text-emerald-400' : 'text-red-400') : 'text-blue-400'
  const sign = isPnl && value >= 0 ? '+' : ''
  return (
    <div className="rounded-2xl bg-gray-900/70 border border-gray-800/80 p-4">
      <p className="text-sm font-medium text-gray-400">{label}</p>
      <p className={clsx('text-2xl font-bold tracking-tight mt-1', color)}>
        {sign}₹{formatIndian(value)}
      </p>
      {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
    </div>
  )
}

const AccountCard = ({ account }) => (
  <div className="rounded-xl bg-gray-900/70 border border-gray-800/80 p-4 flex flex-col">
    <div className="flex justify-between items-start">
      <div>
        <p className="font-semibold text-white">{account.name}</p>
        <p className="text-sm text-gray-500 capitalize">{account.type.replace('_', ' ')}</p>
      </div>
      <p className={clsx('font-bold text-lg', Number(account.balance) >= 0 ? 'text-emerald-400' : 'text-red-400')}>
        ₹{formatIndian(account.balance)}
      </p>
    </div>
    <div className="space-y-2 pt-3 mt-3 border-t border-gray-800/80 text-sm">
      <div className="flex justify-between">
        <p className="text-gray-400">Invested</p>
        <p className="font-medium text-blue-400">₹{formatIndian(account.invested)}</p>
      </div>
      <div className="flex justify-between">
        <p className="text-gray-400">Unrealized P&L</p>
        <p className={clsx('font-medium', account.unrealizedPnl >= 0 ? 'text-emerald-400' : 'text-red-400')}>
          {account.unrealizedPnl >= 0 ? '+' : ''}₹{formatIndian(account.unrealizedPnl)}
        </p>
      </div>
      <div className="flex justify-between">
        <p className="text-gray-400">Realized P&L</p>
        <p className={clsx('font-medium', account.realizedPnl >= 0 ? 'text-emerald-400' : 'text-red-400')}>
          {account.realizedPnl >= 0 ? '+' : ''}₹{formatIndian(account.realizedPnl)}
        </p>
      </div>
      {account.foRealizedPnl !== undefined && account.foRealizedPnl !== 0 && (
        <div className="flex justify-between">
          <p className="text-gray-400">F&O Realized P&L</p>
          <p className={clsx('font-medium', account.foRealizedPnl >= 0 ? 'text-emerald-400' : 'text-red-400')}>
            {account.foRealizedPnl >= 0 ? '+' : ''}₹{formatIndian(account.foRealizedPnl)}
          </p>
        </div>
      )}
    </div>
  </div>
)
