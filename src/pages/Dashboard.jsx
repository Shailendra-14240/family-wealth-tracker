import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { calculateHoldings, calculateSummary } from '../lib/pnlCalc'
import { formatIndian } from '../lib/format'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, CartesianGrid,
} from 'recharts'

const COLORS = ['#3b82f6', '#22c55e', '#a855f7', '#f59e0b', '#06b6d4', '#ec4899', '#84cc16', '#f97316']

export default function Dashboard() {
  const [accounts, setAccounts] = useState([])
  const [allTxns, setAllTxns] = useState([])
  const [allActions, setAllActions] = useState([])
  const [snapshots, setSnapshots] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!supabase) return
    Promise.all([
      supabase.from('accounts').select('*'),
      supabase.from('transactions').select('*').limit(1000000),
      supabase.from('corporate_actions').select('*'),
      supabase.from('net_worth_snapshots').select('*').order('date').limit(200),
    ]).then(([acctRes, txnRes, actRes, snapRes]) => {
      if (acctRes.data) setAccounts(acctRes.data)
      if (txnRes.data) setAllTxns(txnRes.data)
      if (actRes.data) setAllActions(actRes.data)
      if (snapRes.data) setSnapshots(snapRes.data)
      setLoading(false)
    })
  }, [])

  const holdings = useMemo(() => {
    if (!allTxns.length) return []
    return calculateHoldings(allTxns, allActions)
  }, [allTxns, allActions])

  const summary = useMemo(() => calculateSummary(holdings), [holdings])

  const perAccount = useMemo(() => {
    if (!allTxns.length || !accounts.length) return []
    return accounts
      .map(acct => {
        const txns = allTxns.filter(t => t.account_id === acct.id)
        if (!txns.length) return { ...acct, invested: 0, realizedPnl: 0 }
        const h = calculateHoldings(txns, allActions)
        const s = calculateSummary(h)
        return { ...acct, invested: s.totalInvested, realizedPnl: s.totalRealizedPnl }
      })
      .filter(a => a.invested !== 0 || a.realizedPnl !== 0 || Number(a.balance) !== 0)
  }, [allTxns, allActions, accounts])

  const topHoldings = useMemo(() => {
    const bySymbol = {}
    for (const h of holdings) {
      if (h.qty > 0) {
        if (!bySymbol[h.symbol]) bySymbol[h.symbol] = { invested: 0, qty: 0 }
        bySymbol[h.symbol].invested += h.invested
        bySymbol[h.symbol].qty += h.qty
      }
    }
    return Object.entries(bySymbol)
      .sort((a, b) => b[1].invested - a[1].invested)
      .slice(0, 10)
      .map(([symbol, data], i) => ({
        symbol,
        invested: Math.round(data.invested),
        qty: Math.round(data.qty),
        avgCost: Math.round(data.qty > 0 ? data.invested / data.qty : 0),
        fill: COLORS[i % COLORS.length],
      }))
  }, [holdings])

  const pnlByAccount = useMemo(() => {
    return perAccount.map(a => ({ name: a.name, pnl: Math.round(a.realizedPnl) }))
  }, [perAccount])

  const portfolioComposition = useMemo(() => {
    const assets = accounts.filter(a => a.balance > 0).reduce((s, a) => s + Number(a.balance), 0)
    const items = [
      { name: 'Invested', value: Math.round(summary.totalInvested), color: '#3b82f6' },
      { name: 'Cash', value: Math.round(assets), color: '#22c55e' },
    ]
    if (summary.totalRealizedPnl !== 0) {
      items.push({
        name: 'Realized P&L',
        value: Math.abs(Math.round(summary.totalRealizedPnl)),
        color: summary.totalRealizedPnl > 0 ? '#a855f7' : '#ef4444',
      })
    }
    return items.filter(d => d.value > 0)
  }, [summary, accounts])

  if (!supabase) return <p className="text-gray-500 text-center mt-10">Connect Supabase to see live data</p>
  if (loading) return <p className="text-gray-500 text-center mt-10">Loading...</p>

  const assets = accounts.filter((a) => a.balance > 0).reduce((s, a) => s + Number(a.balance), 0)
  const liabilities = accounts.filter((a) => a.balance < 0).reduce((s, a) => s + Number(a.balance), 0)
  const netWorth = assets + liabilities + summary.totalInvested

  const tooltipContent = { backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px', color: '#f3f4f6', fontSize: '13px' }

  return (
    <div className="space-y-4">
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-blue-600/10 via-gray-900 to-purple-600/10 border border-gray-800/50 p-5 md:p-7">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-blue-500/5 via-transparent to-transparent" />
        <div className="relative">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-widest">Net Worth</p>
          <p className="text-2xl sm:text-3xl md:text-5xl font-bold tracking-tight mt-1.5 bg-gradient-to-r from-blue-400 via-white to-purple-400 bg-clip-text text-transparent break-words">
            ₹{formatIndian(netWorth)}
          </p>
          <div className="flex gap-6 mt-3">
            <span className="flex items-center gap-1.5 text-sm">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <span className="text-emerald-400 font-medium">+₹{formatIndian(assets)}</span>
            </span>
            <span className="flex items-center gap-1.5 text-sm">
              <span className="w-2 h-2 rounded-full bg-red-400" />
              <span className="text-red-400 font-medium">-₹{formatIndian(Math.abs(liabilities))}</span>
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Accounts', value: accounts.length, color: 'text-white' },
          { label: 'Invested', value: `₹${formatIndian(summary.totalInvested)}`, color: 'text-blue-400' },
          { label: 'Realized P&L', value: `${summary.totalRealizedPnl >= 0 ? '+' : ''}₹${formatIndian(summary.totalRealizedPnl)}`, color: summary.totalRealizedPnl >= 0 ? 'text-emerald-400' : 'text-red-400' },
        ].map(stat => (
          <div key={stat.label} className="rounded-xl bg-gray-900/60 border border-gray-800/50 p-3.5 md:p-4 text-center backdrop-blur-sm">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">{stat.label}</p>
            <p className={`text-sm sm:text-base md:text-xl font-bold tracking-tight mt-0.5 truncate ${stat.color}`}>{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-xl bg-gray-900/60 border border-gray-800/50 p-4">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">Top Holdings</p>
          {topHoldings.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={topHoldings} layout="vertical" margin={{ left: 5, right: 10 }}>
                <XAxis type="number" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="symbol" tick={{ fill: '#d1d5db', fontSize: 11 }} axisLine={false} tickLine={false} width={70} />
                <Tooltip
                  contentStyle={tooltipContent}
                  formatter={(_, __, props) => {
                    const d = props.payload
                    return [
                      <div className="text-xs space-y-1">
                        <div className="text-gray-300 font-medium mb-1">{d.symbol}</div>
                        <div>Qty: <span className="text-white font-medium">{formatIndian(d.qty)}</span></div>
                        <div>Avg Cost: <span className="text-white font-medium">₹{formatIndian(d.avgCost)}</span></div>
                        <div>Invested: <span className="text-blue-400 font-medium">₹{formatIndian(d.invested)}</span></div>
                      </div>
                    ]
                  }}
                />
                <Bar dataKey="invested" radius={[0, 4, 4, 0]}>
                  {topHoldings.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-48 flex items-center justify-center text-gray-600 text-sm">No holdings data</div>
          )}
        </div>

        <div className="rounded-xl bg-gray-900/60 border border-gray-800/50 p-4">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">P&L by Account</p>
          {pnlByAccount.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={pnlByAccount} margin={{ top: 0, right: 10, bottom: 0, left: -10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
                <XAxis dataKey="name" tick={{ fill: '#d1d5db', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={tooltipContent} formatter={(v) => [`₹${formatIndian(v)}`, 'P&L']} />
                <Bar dataKey="pnl" radius={[4, 4, 0, 0]}>
                  {pnlByAccount.map((entry, i) => <Cell key={i} fill={entry.pnl >= 0 ? '#22c55e' : '#ef4444'} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-48 flex items-center justify-center text-gray-600 text-sm">No account data</div>
          )}
        </div>

        <div className="rounded-xl bg-gray-900/60 border border-gray-800/50 p-4">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">Portfolio Composition</p>
          {portfolioComposition.length > 0 ? (
            <div className="flex items-center justify-center gap-4">
              <ResponsiveContainer width="60%" height={200}>
                <PieChart>
                  <Pie data={portfolioComposition} cx="50%" cy="50%" innerRadius={45} outerRadius={75} dataKey="value" paddingAngle={3}>
                    {portfolioComposition.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                  <Tooltip contentStyle={tooltipContent} formatter={(v, name) => [`₹${formatIndian(v)}`, name]} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-2.5 text-xs">
                {portfolioComposition.map((entry) => (
                  <div key={entry.name} className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
                    <span className="text-gray-400">{entry.name}</span>
                    <span className="text-gray-200 font-medium">₹{formatIndian(entry.value)}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="h-48 flex items-center justify-center text-gray-600 text-sm">No data</div>
          )}
        </div>

        <div className="rounded-xl bg-gray-900/60 border border-gray-800/50 p-4">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">Net Worth Trend</p>
          {snapshots.length > 1 ? (
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={snapshots}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
                <XAxis dataKey="date" tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={tooltipContent} formatter={(v) => [`₹${formatIndian(v)}`, 'Net Worth']} />
                <Line type="monotone" dataKey="net_worth" stroke="#3b82f6" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-48 flex items-center justify-center text-gray-600 text-sm">
              {snapshots.length === 1 ? 'Add more snapshots to see a trend' : 'Add net worth entries in Returns page'}
            </div>
          )}
        </div>
      </div>

      <div>
        <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-3">Accounts</h2>
        <div className="space-y-2">
          {perAccount.map((acct) => (
            <div key={acct.id} className="rounded-xl bg-gray-900/60 border border-gray-800/50 p-4 hover:border-gray-700/50 transition-colors">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <div className={`w-2.5 h-2.5 rounded-full ${Number(acct.balance) >= 0 ? 'bg-emerald-400' : 'bg-red-400'}`} />
                  <div>
                    <p className="font-medium text-white">{acct.name}</p>
                    <p className="text-xs text-gray-500 capitalize">{acct.type.replace('_', ' ')}</p>
                  </div>
                </div>
                <p className={`font-semibold truncate max-w-[120px] ${Number(acct.balance) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  ₹{formatIndian(acct.balance)}
                </p>
              </div>
              {(acct.invested !== 0 || acct.realizedPnl !== 0) && (
                <div className="flex gap-4 mt-2 pt-2 border-t border-gray-800/50 text-xs">
                  <span className="text-gray-500">Invested: <span className="text-blue-400 font-medium">₹{formatIndian(acct.invested)}</span></span>
                  <span className="text-gray-500">P&L: <span className={`font-medium ${acct.realizedPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {acct.realizedPnl >= 0 ? '+' : ''}₹{formatIndian(acct.realizedPnl)}
                  </span></span>
                </div>
              )}
            </div>
          ))}
          {perAccount.length === 0 && (
            <p className="text-center text-gray-500 text-sm py-4">No accounts with data</p>
          )}
        </div>
      </div>
    </div>
  )
}
