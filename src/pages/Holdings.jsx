import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export default function Holdings() {
  const [holdings, setHoldings] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!supabase) return
    supabase.from('holdings').select('*, accounts(name)').order('created_at').then(({ data }) => {
      if (data) setHoldings(data)
      setLoading(false)
    })
  }, [])

  if (!supabase) return <p className="text-gray-500 text-center mt-10">Connect Supabase to see holdings</p>
  if (loading) return <p className="text-gray-500 text-center mt-10">Loading...</p>

  const totalPnl = holdings.reduce((s, h) => s + (Number(h.ltp || 0) - Number(h.avg_price)) * Number(h.qty), 0)

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold">Holdings</h2>
        <p className={`font-semibold ${totalPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
          P&L: ₹{totalPnl.toLocaleString()}
        </p>
      </div>

      {holdings.length === 0 && (
        <p className="text-gray-500 text-center py-10">No holdings yet. Add transactions to build your portfolio.</p>
      )}

      <div className="space-y-2">
        {holdings.map((h) => {
          const pnl = (Number(h.ltp || 0) - Number(h.avg_price)) * Number(h.qty)
          return (
            <div key={h.id} className="bg-gray-900 rounded-xl p-4">
              <div className="flex justify-between items-start">
                <div>
                  <p className="font-semibold">{h.symbol}</p>
                  <p className="text-xs text-gray-500">{h.qty} shares @ ₹{Number(h.avg_price).toLocaleString()}</p>
                  <p className="text-xs text-gray-600">{h.accounts?.name}</p>
                </div>
                <div className="text-right">
                  <p className="font-medium">₹{(Number(h.ltp || 0) * Number(h.qty)).toLocaleString()}</p>
                  <p className={`text-sm ${pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {pnl >= 0 ? '+' : ''}₹{pnl.toLocaleString()}
                  </p>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
