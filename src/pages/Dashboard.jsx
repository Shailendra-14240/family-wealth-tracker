import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { calculateHoldings, calculateSummary } from '../lib/pnlCalc'

export default function Dashboard() {
  const [accounts, setAccounts] = useState([])
  const [allTxns, setAllTxns] = useState([])
  const [allActions, setAllActions] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!supabase) return
    Promise.all([
      supabase.from('accounts').select('*'),
      supabase.from('transactions').select('*'),
      supabase.from('corporate_actions').select('*'),
    ]).then(([acctRes, txnRes, actRes]) => {
      if (acctRes.data) setAccounts(acctRes.data)
      if (txnRes.data) setAllTxns(txnRes.data)
      if (actRes.data) setAllActions(actRes.data)
      setLoading(false)
    })
  }, [])

  const holdings = useMemo(() => {
    if (!allTxns.length) return []
    return calculateHoldings(allTxns, allActions)
  }, [allTxns, allActions])

  const summary = useMemo(() => calculateSummary(holdings), [holdings])

  const totalInvestedEver = useMemo(() => {
    return Math.round(allTxns.filter(t => t.type === 'buy').reduce((s, t) => s + Number(t.qty) * Number(t.price), 0) * 100) / 100
  }, [allTxns])

  const perAccount = useMemo(() => {
    if (!allTxns.length || !accounts.length) return []
    return accounts
      .map(acct => {
        const txns = allTxns.filter(t => t.account_id === acct.id)
        if (!txns.length) return { ...acct, invested: 0, realizedPnl: 0 }
        const invested = Math.round(txns.filter(t => t.type === 'buy').reduce((s, t) => s + Number(t.qty) * Number(t.price), 0) * 100) / 100
        const h = calculateHoldings(txns, allActions)
        const s = calculateSummary(h)
        return { ...acct, invested, realizedPnl: s.totalRealizedPnl }
      })
      .filter(a => a.invested !== 0 || a.realizedPnl !== 0 || Number(a.balance) !== 0)
  }, [allTxns, allActions, accounts])

  if (!supabase) return <p className="text-gray-500 text-center mt-10">Connect Supabase to see live data</p>
  if (loading) return <p className="text-gray-500 text-center mt-10">Loading...</p>

  const assets = accounts.filter((a) => a.balance > 0).reduce((s, a) => s + Number(a.balance), 0)
  const liabilities = accounts.filter((a) => a.balance < 0).reduce((s, a) => s + Number(a.balance), 0)
  const netWorth = assets + liabilities + summary.totalInvested

  return (
    <div className="space-y-4">
      <div className="bg-gray-900 rounded-xl p-4 text-center">
        <p className="text-sm text-gray-400">Net Worth</p>
        <p className="text-3xl font-bold">₹{netWorth.toLocaleString()}</p>
        <div className="flex justify-center gap-6 mt-2 text-sm">
          <span className="text-green-400">+₹{assets.toLocaleString()}</span>
          <span className="text-red-400">-₹{Math.abs(liabilities).toLocaleString()}</span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="bg-gray-900 rounded-xl p-3 text-center">
          <p className="text-xs text-gray-400">Accounts</p>
          <p className="text-xl font-bold">{accounts.length}</p>
        </div>
        <div className="bg-gray-900 rounded-xl p-3 text-center">
          <p className="text-xs text-gray-400">Invested</p>
          <p className="text-xl font-bold text-blue-400">₹{summary.totalInvested.toLocaleString()}</p>
        </div>
        <div className="bg-gray-900 rounded-xl p-3 text-center">
          <p className="text-xs text-gray-400">Realized P&L</p>
          <p className={`text-xl font-bold ${summary.totalRealizedPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {summary.totalRealizedPnl >= 0 ? '+' : ''}₹{summary.totalRealizedPnl.toLocaleString()}
          </p>
        </div>
      </div>

      <div className="bg-gray-900 rounded-xl p-4">
        <p className="text-sm text-gray-400 mb-2">Net Worth Trend</p>
        <div className="h-32 flex items-center justify-center text-gray-600 border border-dashed border-gray-700 rounded-lg">
          Chart coming soon
        </div>
      </div>

      <h2 className="text-lg font-semibold mt-4">Accounts</h2>
      <div className="space-y-2">
        {perAccount.map((acct) => (
          <div key={acct.id} className="bg-gray-900 rounded-xl p-4">
            <div className="flex justify-between items-center mb-1">
              <div>
                <p className="font-medium">{acct.name}</p>
                <p className="text-xs text-gray-500 capitalize">{acct.type}</p>
              </div>
              <p className={`font-semibold ${acct.balance >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                ₹{Number(acct.balance).toLocaleString()}
              </p>
            </div>
            {(acct.invested !== 0 || acct.realizedPnl !== 0) && (
              <div className="flex gap-4 text-xs text-gray-400 border-t border-gray-800 pt-1.5 mt-1">
                <span>Invested: <span className="text-blue-400">₹{acct.invested.toLocaleString()}</span></span>
                <span>P&L: <span className={acct.realizedPnl >= 0 ? 'text-green-400' : 'text-red-400'}>
                  {acct.realizedPnl >= 0 ? '+' : ''}₹{acct.realizedPnl.toLocaleString()}
                </span></span>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
