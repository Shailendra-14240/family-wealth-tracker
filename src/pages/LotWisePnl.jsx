import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { calculateLotWisePnl, consolidateLotRecords } from '../lib/pnlCalc'
import { formatIndian } from '../lib/format'

export default function LotWisePnl() {
  const [transactions, setTransactions] = useState([])
  const [corpActions, setCorpActions] = useState([])
  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(true)
  const [filterSymbol, setFilterSymbol] = useState('')
  const [filterAccount, setFilterAccount] = useState('')
  const [filterDateFrom, setFilterDateFrom] = useState('')
  const [filterDateTo, setFilterDateTo] = useState('')
  const [showClosedOnly, setShowClosedOnly] = useState(false)
  const [doConsolidate, setDoConsolidate] = useState(true)

  useEffect(() => {
    if (!supabase) return
    Promise.all([
      supabase.from('transactions').select('*').order('date'),
      supabase.from('corporate_actions').select('*'),
      supabase.from('accounts').select('id, name').order('name'),
    ]).then(([txRes, caRes, acctRes]) => {
      if (txRes.data) setTransactions(txRes.data)
      if (caRes.data) setCorpActions(caRes.data)
      if (acctRes.data) setAccounts(acctRes.data)
      setLoading(false)
    })
  }, [])

  const txnsForAccount = useMemo(() => {
    if (!filterAccount) return transactions
    return transactions.filter(t => Number(t.account_id) === Number(filterAccount))
  }, [transactions, filterAccount])

  const pnlData = useMemo(() => {
    if (!txnsForAccount.length) return []
    const raw = calculateLotWisePnl(txnsForAccount, corpActions)
    return doConsolidate ? consolidateLotRecords(raw) : raw
  }, [txnsForAccount, corpActions, doConsolidate])

  const symbols = useMemo(() => pnlData.map(d => d.symbol).sort(), [pnlData])

  const filtered = useMemo(() => {
    let data = pnlData.slice().sort((a, b) => a.symbol.localeCompare(b.symbol))
    if (filterSymbol) data = data.filter(d => d.symbol === filterSymbol)
    if (showClosedOnly) data = data.filter(d => d.lots.every(l => l.remainingQty === 0))
    return data.map(group => ({
      ...group,
      lots: group.lots.filter(l => {
        if (filterDateFrom && l.buyDate < filterDateFrom) return false
        if (filterDateTo && l.buyDate > filterDateTo) return false
        return true
      }),
    })).filter(g => g.lots.length > 0)
  }, [pnlData, filterSymbol, filterDateFrom, filterDateTo, showClosedOnly])

  if (!supabase) return <p className="text-gray-500 text-center mt-10">Connect Supabase</p>
  if (loading) return <p className="text-gray-500 text-center mt-10">Loading...</p>

  return (
    <div className="space-y-4">
      <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wider">Lot-wise P&L</h2>

      <div className="rounded-xl bg-gray-900/60 border border-gray-800/50 p-3 flex flex-wrap gap-2">
        <select className="bg-gray-800/80 text-white border border-gray-700/50 rounded-lg px-3 py-2 text-sm" value={filterAccount} onChange={e => setFilterAccount(e.target.value)}>
          <option value="">All Accounts</option>
          {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <select className="bg-gray-800/80 text-white border border-gray-700/50 rounded-lg px-3 py-2 text-sm" value={filterSymbol} onChange={e => setFilterSymbol(e.target.value)}>
          <option value="">All Symbols</option>
          {symbols.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <input type="date" className="bg-gray-800/80 text-white border border-gray-700/50 rounded-lg px-3 py-2 text-sm" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} placeholder="From" />
        <input type="date" className="bg-gray-800/80 text-white border border-gray-700/50 rounded-lg px-3 py-2 text-sm" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)} placeholder="To" />
        <label className="flex items-center gap-1 text-sm text-gray-400">
          <input type="checkbox" className="accent-blue-500 w-4 h-4 rounded" checked={showClosedOnly} onChange={e => setShowClosedOnly(e.target.checked)} />
          Closed only
        </label>
        <label className="flex items-center gap-1 text-sm text-gray-400">
          <input type="checkbox" className="accent-blue-500 w-4 h-4 rounded" checked={doConsolidate} onChange={e => setDoConsolidate(e.target.checked)} />
          Group by date
        </label>
      </div>

      <div className="space-y-4">
        {filtered.map(group => (
          <div key={group.symbol} className="rounded-xl bg-gray-900/60 border border-gray-800/50 p-4">
            <h3 className="font-bold text-blue-400 mb-2">{group.symbol}</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-gray-300">
                <thead>
                  <tr className="text-gray-500 text-xs uppercase tracking-wider font-medium border-b border-gray-800/50">
                    <th className="text-left py-2 pr-3">Buy Date</th>
                    <th className="text-right py-2 px-3">Buy Qty</th>
                    <th className="text-right py-2 px-3">Buy Price</th>
                    <th className="text-right py-2 px-3">Buy Value</th>
                    <th className="text-left py-2 px-3">Sell Date</th>
                    <th className="text-right py-2 px-3">Sell Qty</th>
                    <th className="text-right py-2 px-3">Sell Price</th>
                    <th className="text-right py-2 px-3">Sell Value</th>
                    <th className="text-right py-2 px-3">P&L</th>
                    <th className="text-right py-2 pl-3">Rem Qty</th>
                  </tr>
                </thead>
                <tbody>
                  {group.lots.map((lot, i) => {
                    const rows = []
                    const buyValue = lot.buyQty * lot.buyPrice
                    if (lot.sells.length === 0) {
                      rows.push(
                        <tr key={`${i}-open`} className="border-b border-gray-800/50">
                          <td className="py-2 pr-3 text-gray-400">{lot.buyDate}</td>
                          <td className="text-right py-2 px-3">{formatIndian(lot.buyQty)}</td>
                          <td className="text-right py-2 px-3">{formatIndian(lot.buyPrice)}</td>
                          <td className="text-right py-2 px-3">{formatIndian(buyValue)}</td>
                          <td className="py-2 px-3 text-gray-600">--</td>
                          <td className="text-right py-2 px-3">--</td>
                          <td className="text-right py-2 px-3">--</td>
                          <td className="text-right py-2 px-3">--</td>
                          <td className="text-right py-2 px-3 text-gray-600">--</td>
                          <td className="text-right py-2 pl-3 text-yellow-400">{formatIndian(lot.remainingQty)}</td>
                        </tr>
                      )
                    } else {
                      lot.sells.forEach((sell, j) => {
                        const sellValue = sell.qty * sell.price
                        rows.push(
                          <tr key={`${i}-${j}`} className="border-b border-gray-800/50">
                            <td className="py-2 pr-3 text-gray-400">{j === 0 ? lot.buyDate : ''}</td>
                            <td className="text-right py-2 px-3">{j === 0 ? formatIndian(lot.buyQty) : ''}</td>
                            <td className="text-right py-2 px-3">{j === 0 ? formatIndian(lot.buyPrice) : ''}</td>
                            <td className="text-right py-2 px-3">{j === 0 ? formatIndian(buyValue) : ''}</td>
                            <td className="py-2 px-3 text-gray-400">{sell.date}</td>
                            <td className="text-right py-2 px-3">{formatIndian(sell.qty)}</td>
                            <td className="text-right py-2 px-3">{formatIndian(sell.price)}</td>
                            <td className="text-right py-2 px-3">{formatIndian(sellValue)}</td>
                            <td className={`text-right py-2 px-3 font-medium ${sell.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                              {sell.pnl >= 0 ? '+' : ''}{formatIndian(sell.pnl)}
                            </td>
                            <td className="text-right py-2 pl-3">{j === lot.sells.length - 1 ? formatIndian(lot.remainingQty) : ''}</td>
                          </tr>
                        )
                      })
                    }
                    return rows
                  })}
                </tbody>
                <tfoot>
                  <tr className="text-gray-300 font-medium border-t border-gray-700/50">
                    <td className="py-2 pr-3">Total</td>
                    <td></td>
                    <td></td>
                    <td className="text-right px-3">{formatIndian(group.lots.reduce((s, l) => s + l.buyQty * l.buyPrice, 0))}</td>
                    <td></td>
                    <td></td>
                    <td></td>
                    <td className="text-right px-3">{formatIndian(group.lots.reduce((s, l) => s + l.sells.reduce((s2, sl) => s2 + sl.qty * sl.price, 0), 0))}</td>
                    <td className={`text-right px-3 font-semibold ${group.lots.reduce((s, l) => s + l.sellTotalPnl, 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {group.lots.reduce((s, l) => s + l.sellTotalPnl, 0) >= 0 ? '+' : ''}{formatIndian(group.lots.reduce((s, l) => s + l.sellTotalPnl, 0))}
                    </td>
                    <td className="text-right pl-3">{formatIndian(group.lots.reduce((s, l) => s + l.remainingQty, 0))}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        ))}
        {filtered.length === 0 && <p className="text-gray-500 text-center py-10">No data matching filters.</p>}
      </div>
    </div>
  )
}
