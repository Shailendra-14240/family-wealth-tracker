import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { calculateHoldings, calculateSummary } from '../lib/pnlCalc'

export default function Holdings() {
  const [holdings, setHoldings] = useState([])
  const [summary, setSummary] = useState({ totalInvested: 0, totalRealizedPnl: 0 })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!supabase) return
    supabase.from('transactions').select('*').then(({ data }) => {
      if (data && data.length) {
        const h = calculateHoldings(data)
        setHoldings(h)
        setSummary(calculateSummary(h))
      }
      setLoading(false)
    })
  }, [])

  if (!supabase) return <p className="text-gray-500 text-center mt-10">Connect Supabase to see holdings</p>
  if (loading) return <p className="text-gray-500 text-center mt-10">Loading...</p>

  return (
    <div className="space-y-4">
      <div className="bg-gray-900 rounded-xl p-4">
        <div className="flex justify-between items-center mb-1">
          <p className="text-sm text-gray-400">Total Invested</p>
          <p className="text-xl font-bold">₹{summary.totalInvested.toLocaleString()}</p>
        </div>
        <div className="flex justify-between items-center">
          <p className="text-sm text-gray-400">Realized P&L</p>
          <p className={`text-lg font-semibold ${summary.totalRealizedPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {summary.totalRealizedPnl >= 0 ? '+' : ''}₹{summary.totalRealizedPnl.toLocaleString()}
          </p>
        </div>
      </div>

      <h2 className="text-lg font-semibold">Current Holdings</h2>

      {holdings.length === 0 && (
        <p className="text-gray-500 text-center py-10">No holdings yet. Add transactions to build your portfolio.</p>
      )}

      <div className="space-y-2">
        {holdings.map((h) => (
          <div key={h.symbol} className="bg-gray-900 rounded-xl p-4">
            <div className="flex justify-between items-start">
              <div>
                <p className="font-semibold text-lg">{h.symbol}</p>
                <p className="text-xs text-gray-500">{h.qty} shares</p>
                <p className="text-xs text-gray-600">Avg cost: ₹{h.avgCost.toLocaleString()}</p>
              </div>
              <div className="text-right">
                <p className="font-medium">₹{h.invested.toLocaleString()}</p>
                <p className={`text-sm ${h.realizedPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  Realized: {h.realizedPnl >= 0 ? '+' : ''}₹{h.realizedPnl.toLocaleString()}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
