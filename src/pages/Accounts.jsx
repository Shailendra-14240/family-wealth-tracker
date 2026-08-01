import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { calculateHoldings, calculateSummary } from '../lib/pnlCalc'
import { calculateFoPnl, calculateFoSummary } from '../lib/foPnlCalc'
import { formatIndian } from '../lib/format'
import { fetchPrices } from '../lib/priceFeed'
import clsx from 'clsx'

const ACCOUNT_TYPES = ['demat', 'savings', 'loan', 'mutual_fund', 'crypto', 'other']

export default function Accounts() {
  const [accounts, setAccounts] = useState([])
  const [allTxns, setAllTxns] = useState([])
  const [foTxns, setFoTxns] = useState([])
  const [allActions, setAllActions] = useState([])
  const [currentPrices, setCurrentPrices] = useState({})
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', type: 'savings', balance: '' })

  useEffect(() => {
    if (!supabase) return
    setLoading(true)
    Promise.all([
      supabase.from('accounts').select('*').order('created_at'),
      supabase.from('transactions').select('*').limit(1000000),
      supabase.from('corporate_actions').select('*'),
      supabase.from('fo_transactions').select('*').limit(1000000),
    ]).then(([acctRes, txnRes, actRes, foRes]) => {
      if (acctRes.data) setAccounts(acctRes.data)
      if (txnRes.data) setAllTxns(txnRes.data)
      if (actRes.data) setAllActions(actRes.data)
      if (foRes.data) setFoTxns(foRes.data)
      setLoading(false)
    }).catch(err => {
      console.error(err)
      setLoading(false)
    })
  }, [])

  const holdings = useMemo(() => calculateHoldings(allTxns, allActions), [allTxns, allActions])
  const allOpenSymbols = useMemo(() => [...new Set(holdings.filter(h => h.qty > 0).map(h => h.symbol))], [holdings])

  useEffect(() => {
    if (!allOpenSymbols.length) return
    const fetch = () => fetchPrices(allOpenSymbols).then(setCurrentPrices)
    fetch()
    const interval = setInterval(fetch, 180000)
    return () => clearInterval(interval)
  }, [allOpenSymbols])

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

  const handleAdd = async (e) => {
    e.preventDefault()
    if (!form.name || form.balance === '' || !supabase) return
    const { data } = await supabase.from('accounts').insert({
      name: form.name,
      type: form.type,
      balance: Number(form.balance),
    }).select().single()
    if (data) {
      setAccounts([...accounts, data])
      setForm({ name: '', type: 'savings', balance: '' })
      setShowForm(false)
    }
  }

  if (!supabase) return <p className="text-gray-500 text-center mt-10">Connect Supabase to manage accounts</p>
  if (loading) return <p className="text-gray-500 text-center mt-10">Loading...</p>

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold text-white">Accounts</h2>
        <button onClick={() => setShowForm(!showForm)} className="bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded-lg text-sm font-medium transition-colors">+ Add</button>
      </div>

      {showForm && (
        <form onSubmit={handleAdd} className="rounded-xl bg-gray-900/60 border border-gray-800/50 p-4 space-y-3">
          <label className="text-xs text-gray-500 mb-1 block">Account name</label>
          <input placeholder="Account name" className="w-full bg-gray-800/80 text-white border border-gray-700/50 rounded-lg px-3 py-2 text-sm placeholder:text-gray-600" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <label className="text-xs text-gray-500 mb-1 block">Type</label>
          <select className="w-full bg-gray-800/80 text-white border border-gray-700/50 rounded-lg px-3 py-2 text-sm" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
            {ACCOUNT_TYPES.map((t) => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
          </select>
          <label className="text-xs text-gray-500 mb-1 block">Balance</label>
          <input type="number" placeholder="Balance (negative for loans)" className="w-full bg-gray-800/80 text-white border border-gray-700/50 rounded-lg px-3 py-2 text-sm placeholder:text-gray-600" value={form.balance} onChange={(e) => setForm({ ...form, balance: e.target.value })} />
          <button type="submit" className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">Save</button>
        </form>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {perAccountSummary.map((acct) => (
          <div key={acct.id} className="rounded-xl bg-gray-900/70 border border-gray-800/80 p-4 flex flex-col">
            <div className="flex justify-between items-start">
              <div>
                <p className="font-semibold text-white">{acct.name}</p>
                <p className="text-sm text-gray-500 capitalize">{acct.type.replace('_', ' ')}</p>
              </div>
              <p className={clsx('font-bold text-lg', Number(acct.balance) >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                ₹{formatIndian(acct.balance)}
              </p>
            </div>
            <div className="space-y-2 pt-3 mt-3 border-t border-gray-800/80 text-sm">
              <div className="flex justify-between">
                <p className="text-gray-400">Invested</p>
                <p className="font-medium text-blue-400">₹{formatIndian(acct.invested)}</p>
              </div>
              <div className="flex justify-between">
                <p className="text-gray-400">Unrealized P&L</p>
                <p className={clsx('font-medium', acct.unrealizedPnl >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                  {acct.unrealizedPnl >= 0 ? '+' : ''}₹{formatIndian(acct.unrealizedPnl)}
                </p>
              </div>
              <div className="flex justify-between">
                <p className="text-gray-400">Realized P&L</p>
                <p className={clsx('font-medium', acct.realizedPnl >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                  {acct.realizedPnl >= 0 ? '+' : ''}₹{formatIndian(acct.realizedPnl)}
                </p>
              </div>
              {acct.foRealizedPnl !== undefined && acct.foRealizedPnl !== 0 && (
                <div className="flex justify-between">
                  <p className="text-gray-400">F&O Realized P&L</p>
                  <p className={clsx('font-medium', acct.foRealizedPnl >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                    {acct.foRealizedPnl >= 0 ? '+' : ''}₹{formatIndian(acct.foRealizedPnl)}
                  </p>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
