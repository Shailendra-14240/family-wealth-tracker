import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { calculateLotWisePnl, consolidateLotRecords } from '../lib/pnlCalc'
import { formatIndian } from '../lib/format'
import clsx from 'clsx'

export default function LotWisePnl() {
  const [transactions, setTransactions] = useState([])
  const [corpActions, setCorpActions] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedSymbol, setSelectedSymbol] = useState(null)
  const [doConsolidate, setDoConsolidate] = useState(true)

  useEffect(() => {
    if (!supabase) return
    Promise.all([
      supabase.from('transactions').select('symbol, date, type, qty, price, account_id'),
      supabase.from('corporate_actions').select('*'),
    ]).then(([txRes, caRes]) => {
      if (txRes.data) setTransactions(txRes.data)
      if (caRes.data) setCorpActions(caRes.data)
      setLoading(false)
    })
  }, [])

  const uniqueSymbols = useMemo(() => {
    const symbols = new Set(transactions.map(t => t.symbol))
    return Array.from(symbols).sort()
  }, [transactions])

  const pnlData = useMemo(() => {
    if (!selectedSymbol) return null
    const symbolTxns = transactions.filter(t => t.symbol === selectedSymbol)
    const raw = calculateLotWisePnl(symbolTxns, corpActions)
    return doConsolidate ? consolidateLotRecords(raw) : raw
  }, [selectedSymbol, transactions, corpActions, doConsolidate])

  if (loading) return <p className="text-center text-gray-500 mt-10">Loading...</p>

  if (!selectedSymbol) {
    return (
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-white">Select a Symbol</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {uniqueSymbols.map(symbol => (
            <button
              key={symbol}
              onClick={() => setSelectedSymbol(symbol)}
              className="p-4 rounded-xl bg-gray-900/70 border border-gray-800/80 text-white font-semibold text-center hover:bg-gray-800/50 hover:border-gray-700/50 transition-colors"
            >
              {symbol}
            </button>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <button onClick={() => setSelectedSymbol(null)} className="text-primary-400 hover:text-primary-300 font-medium">
          &larr; Back to Symbols
        </button>
        <label className="flex items-center gap-2 text-sm text-gray-400">
          <input
            type="checkbox"
            className="accent-primary-500 w-4 h-4 rounded"
            checked={doConsolidate}
            onChange={e => setDoConsolidate(e.target.checked)}
          />
          Group by Date
        </label>
      </div>

      {pnlData && pnlData.map(group => (
        <div key={group.symbol} className="rounded-xl bg-gray-900/70 border border-gray-800/80 p-4">
          <h3 className="font-bold text-xl text-primary-400 mb-3">{group.symbol}</h3>
          <div className="overflow-x-auto">
            <LotPnlTable lots={group.lots} />
          </div>
        </div>
      ))}
    </div>
  )
}

const LotPnlTable = ({ lots }) => {
  const totals = useMemo(() => {
    return {
      buyValue: lots.reduce((s, l) => s + l.buyQty * l.buyPrice, 0),
      sellValue: lots.reduce((s, l) => s + l.sells.reduce((s2, sl) => s2 + sl.qty * sl.price, 0), 0),
      totalPnl: lots.reduce((s, l) => s + l.sellTotalPnl, 0),
      remainingQty: lots.reduce((s, l) => s + l.remainingQty, 0),
    }
  }, [lots])

  return (
    <table className="w-full text-sm text-gray-300">
      <thead>
        <tr className="text-gray-500 text-xs uppercase tracking-wider font-medium border-b border-gray-800/50">
          <th className="text-left py-2 pr-3">Buy Date</th>
          <th className="text-right py-2 px-3">Buy Qty</th>
          <th className="text-right py-2 px-3">Buy Price</th>
          <th className="text-left py-2 px-3">Sell Date</th>
          <th className="text-right py-2 px-3">Sell Qty</th>
          <th className="text-right py-2 px-3">Sell Price</th>
          <th className="text-right py-2 px-3">P&L</th>
          <th className="text-right py-2 pl-3">Rem. Qty</th>
        </tr>
      </thead>
      <tbody>
        {lots.map((lot, i) => <LotRow key={i} lot={lot} />)}
      </tbody>
      <tfoot>
        <tr className="text-gray-200 font-bold border-t-2 border-gray-700/50">
          <td className="py-2 pr-3">Total</td>
          <td colSpan="2" className="text-right px-3">₹{formatIndian(totals.buyValue)}</td>
          <td colSpan="2"></td>
          <td className="text-right px-3">₹{formatIndian(totals.sellValue)}</td>
          <td className={clsx('text-right px-3', totals.totalPnl >= 0 ? 'text-emerald-400' : 'text-red-400')}>
            {totals.totalPnl >= 0 ? '+' : ''}₹{formatIndian(totals.totalPnl)}
          </td>
          <td className="text-right pl-3">{formatIndian(totals.remainingQty)}</td>
        </tr>
      </tfoot>
    </table>
  )
}

const LotRow = ({ lot }) => {
  if (lot.sells.length === 0) {
    return (
      <tr className="border-b border-gray-800/50">
        <td className="py-2 pr-3 text-gray-400">{lot.buyDate}</td>
        <td className="text-right py-2 px-3">{formatIndian(lot.buyQty)}</td>
        <td className="text-right py-2 px-3">₹{formatIndian(lot.buyPrice)}</td>
        <td colSpan="4" className="py-2 px-3 text-center text-gray-600">-- Open --</td>
        <td className="text-right py-2 pl-3 text-yellow-400">{formatIndian(lot.remainingQty)}</td>
      </tr>
    )
  }

  return lot.sells.map((sell, j) => (
    <tr key={j} className="border-b border-gray-800/50">
      {j === 0 && <>
        <td rowSpan={lot.sells.length} className="py-2 pr-3 text-gray-400 align-top">{lot.buyDate}</td>
        <td rowSpan={lot.sells.length} className="text-right py-2 px-3 align-top">{formatIndian(lot.buyQty)}</td>
        <td rowSpan={lot.sells.length} className="text-right py-2 px-3 align-top">₹{formatIndian(lot.buyPrice)}</td>
      </>}
      <td className="py-2 px-3 text-gray-400">{sell.date}</td>
      <td className="text-right py-2 px-3">{formatIndian(sell.qty)}</td>
      <td className="text-right py-2 px-3">₹{formatIndian(sell.price)}</td>
      <td className={clsx('text-right py-2 px-3 font-medium', sell.pnl >= 0 ? 'text-emerald-400' : 'text-red-400')}>
        {sell.pnl >= 0 ? '+' : ''}{formatIndian(sell.pnl)}
      </td>
      {j === lot.sells.length - 1 &&
        <td rowSpan={lot.sells.length} className="text-right py-2 pl-3 align-top">{formatIndian(lot.remainingQty)}</td>
      }
    </tr>
  ))
}
