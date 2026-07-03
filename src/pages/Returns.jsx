import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'

export default function Returns() {
  const [movements, setMovements] = useState([])
  const [snapshots, setSnapshots] = useState([])
  const [loading, setLoading] = useState(true)
  const fileRef = useRef()

  const ledgerRef = useRef()
  const [fmForm, setFmForm] = useState({ date: new Date().toISOString().split('T')[0], type: 'deposit', amount: '', notes: '' })
  const [ssForm, setSsForm] = useState({ date: new Date().toISOString().split('T')[0], total_value: '', notes: '' })
  const [parsedCsv, setParsedCsv] = useState(null)
  const [parsedLedger, setParsedLedger] = useState(null)
  const [adding, setAdding] = useState(false)

  useEffect(() => {
    if (!supabase) return
    Promise.all([
      supabase.from('fund_movements').select('*').order('date', { ascending: false }),
      supabase.from('portfolio_snapshots').select('*').order('date', { ascending: false }).limit(1000000),
    ]).then(([fmRes, ssRes]) => {
      if (fmRes.data) setMovements(fmRes.data)
      if (ssRes.data) setSnapshots(ssRes.data)
      setLoading(false)
    })
  }, [])

  const totalDeposits = movements.filter(m => m.type === 'deposit').reduce((s, m) => s + Number(m.amount), 0)
  const totalWithdrawals = movements.filter(m => m.type === 'withdrawal').reduce((s, m) => s + Number(m.amount), 0)
  const netAdded = totalDeposits - totalWithdrawals
  const latestSnapshot = snapshots.length > 0 ? snapshots.reduce((a, b) => new Date(a.date) > new Date(b.date) ? a : b) : null
  const portfolioValue = latestSnapshot ? Number(latestSnapshot.total_value) : 0
  const totalPnl = portfolioValue - netAdded
  const returnPct = netAdded > 0 ? (totalPnl / netAdded * 100) : 0

  const handleAddMovement = async (e) => {
    e.preventDefault()
    if (!fmForm.amount || !supabase) return
    setAdding(true)
    const { data } = await supabase.from('fund_movements').insert({
      date: fmForm.date, type: fmForm.type, amount: Number(fmForm.amount), notes: fmForm.notes || null,
    }).select().single()
    if (data) {
      setMovements([data, ...movements])
      setFmForm({ ...fmForm, amount: '', notes: '' })
    }
    setAdding(false)
  }

  const handleLedgerFile = (e) => {
    const file = ledgerRef.current?.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (evt) => {
      const lines = evt.target.result.split('\n').filter(Boolean)
      if (lines.length < 2) return
      const headers = lines[0].split(',').map(h => h.replace(/["']/g, '').trim().toLowerCase())
      const dateIdx = headers.indexOf('posting_date')
      const voucherIdx = headers.indexOf('voucher_type')
      const creditIdx = headers.indexOf('credit')
      const debitIdx = headers.indexOf('debit')
      const notesIdx = headers.indexOf('particulars')
      if (dateIdx < 0 || voucherIdx < 0) return
      const deposits = [], withdrawals = []
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',').map(c => c.replace(/["']/g, '').trim())
        const type = cols[voucherIdx] || ''
        const amt = type === 'Bank Receipts' ? parseFloat(cols[creditIdx]) || 0 : type === 'Bank Payments' ? parseFloat(cols[debitIdx]) || 0 : 0
        if (amt <= 0) continue
        const entry = { date: cols[dateIdx] || '', amount: amt, notes: cols[notesIdx]?.slice(0, 120) || '' }
        if (type === 'Bank Receipts') deposits.push(entry)
        else if (type === 'Bank Payments') withdrawals.push(entry)
      }
      setParsedLedger({ deposits, withdrawals })
    }
    reader.readAsText(file)
  }

  const handleConfirmLedger = async () => {
    if (!parsedLedger || !supabase) return
    setAdding(true)
    const allEntries = [
      ...parsedLedger.deposits.map(d => ({ date: d.date, type: 'deposit', amount: d.amount, notes: d.notes })),
      ...parsedLedger.withdrawals.map(w => ({ date: w.date, type: 'withdrawal', amount: w.amount, notes: w.notes })),
    ]
    const { data } = await supabase.from('fund_movements').insert(allEntries).select()
    if (data) setMovements([...data, ...movements])
    setAdding(false)
    setParsedLedger(null)
    if (ledgerRef.current) ledgerRef.current.value = ''
  }

  const handleDeleteMovement = async (id) => {
    if (!supabase) return
    await supabase.from('fund_movements').delete().eq('id', id)
    setMovements(movements.filter(m => m.id !== id))
  }

  const handleAddSnapshot = async (e) => {
    e.preventDefault()
    if (!ssForm.total_value || !supabase) return
    setAdding(true)
    const { data } = await supabase.from('portfolio_snapshots').insert({
      date: ssForm.date, total_value: Number(ssForm.total_value), notes: ssForm.notes || null, method: 'manual',
    }).select().single()
    if (data) {
      setSnapshots([data, ...snapshots])
      setSsForm({ ...ssForm, total_value: '', notes: '' })
    }
    setAdding(false)
  }

  const handleDeleteSnapshot = async (id) => {
    if (!supabase) return
    await supabase.from('portfolio_snapshots').delete().eq('id', id)
    setSnapshots(snapshots.filter(s => s.id !== id))
  }

  const handleCsvFile = (e) => {
    const file = fileRef.current?.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (evt) => {
      const lines = evt.target.result.split('\n').filter(Boolean)
      if (lines.length < 2) return
      const headers = lines[0].split(',').map(h => h.replace(/["']/g, '').trim().toLowerCase())
      const qtyIdx = headers.findIndex(h => /qty|quantity/i.test(h))
      const priceIdx = headers.findIndex(h => /price|rate|cost|avg/i.test(h))
      const symIdx = headers.findIndex(h => /symbol|scrip|tradingsymbol|stock/i.test(h))
      let total = 0
      let count = 0
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',').map(c => c.replace(/["']/g, '').trim())
        const qty = qtyIdx >= 0 ? parseFloat(cols[qtyIdx]) || 0 : 0
        const price = priceIdx >= 0 ? parseFloat(cols[priceIdx]) || 0 : 0
        if (qty && price) { total += qty * price; count++ }
      }
      setParsedCsv({ total: Math.round(total * 100) / 100, count, date: new Date().toISOString().split('T')[0] })
    }
    reader.readAsText(file)
  }

  if (!supabase) return <p className="text-gray-500 text-center mt-10">Connect Supabase to see returns data</p>
  if (loading) return <p className="text-gray-500 text-center mt-10">Loading...</p>

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Returns Calculator</h2>

      <div className="grid grid-cols-3 gap-3">
        <div className="bg-gray-900 rounded-xl p-3 text-center">
          <p className="text-xs text-gray-400">Deposits</p>
          <p className="text-lg font-bold text-green-400">+₹{totalDeposits.toLocaleString()}</p>
        </div>
        <div className="bg-gray-900 rounded-xl p-3 text-center">
          <p className="text-xs text-gray-400">Withdrawals</p>
          <p className="text-lg font-bold text-red-400">-₹{totalWithdrawals.toLocaleString()}</p>
        </div>
        <div className="bg-gray-900 rounded-xl p-3 text-center">
          <p className="text-xs text-gray-400">Net Added</p>
          <p className="text-lg font-bold text-blue-400">₹{netAdded.toLocaleString()}</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="bg-gray-900 rounded-xl p-3 text-center">
          <p className="text-xs text-gray-400">Portfolio Value</p>
          <p className="text-lg font-bold text-purple-400">₹{portfolioValue.toLocaleString()}</p>
          {latestSnapshot && <p className="text-xs text-gray-600">{latestSnapshot.date}</p>}
        </div>
        <div className="bg-gray-900 rounded-xl p-3 text-center">
          <p className="text-xs text-gray-400">Total P&L</p>
          <p className={`text-lg font-bold ${totalPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {totalPnl >= 0 ? '+' : ''}₹{totalPnl.toLocaleString()}
          </p>
        </div>
        <div className="bg-gray-900 rounded-xl p-3 text-center">
          <p className="text-xs text-gray-400">Return %</p>
          <p className={`text-lg font-bold ${returnPct >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {returnPct >= 0 ? '+' : ''}{returnPct.toFixed(2)}%
          </p>
        </div>
      </div>

      <div className="bg-gray-900 rounded-xl p-4">
        <p className="text-sm text-gray-400 mb-3">Add Fund Movement</p>
        <form onSubmit={handleAddMovement} className="flex flex-wrap gap-2">
          <input type="date" className="bg-gray-800 rounded px-2 py-1.5 text-sm flex-1 min-w-[120px]" value={fmForm.date} onChange={e => setFmForm({ ...fmForm, date: e.target.value })} />
          <select className="bg-gray-800 rounded px-2 py-1.5 text-sm w-28" value={fmForm.type} onChange={e => setFmForm({ ...fmForm, type: e.target.value })}>
            <option value="deposit">Deposit</option>
            <option value="withdrawal">Withdrawal</option>
          </select>
          <input type="number" placeholder="Amount" className="bg-gray-800 rounded px-2 py-1.5 text-sm w-28" value={fmForm.amount} onChange={e => setFmForm({ ...fmForm, amount: e.target.value })} />
          <input type="text" placeholder="Notes" className="bg-gray-800 rounded px-2 py-1.5 text-sm flex-1 min-w-[120px]" value={fmForm.notes} onChange={e => setFmForm({ ...fmForm, notes: e.target.value })} />
          <button type="submit" disabled={adding} className="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-sm">Add</button>
        </form>
      </div>

      <div className="bg-gray-900 rounded-xl p-4">
        <p className="text-sm text-gray-400 mb-2">Upload Zerodha Ledger CSV</p>
        <p className="text-xs text-gray-600 mb-2">Auto-extracts deposits (Bank Receipts) and withdrawals (Bank Payments)</p>
        <input ref={ledgerRef} type="file" accept=".csv" onChange={handleLedgerFile}
          className="text-sm text-gray-400 file:mr-3 file:bg-purple-600 file:text-white file:border-0 file:rounded file:px-3 file:py-1" />
        {parsedLedger && (
          <div className="mt-2 space-y-1 text-xs">
            <p className="text-green-400">{parsedLedger.deposits.length} deposits · Total: <span className="font-semibold">+₹{parsedLedger.deposits.reduce((s, d) => s + d.amount, 0).toLocaleString()}</span></p>
            <p className="text-red-400">{parsedLedger.withdrawals.length} withdrawals · Total: <span className="font-semibold">-₹{parsedLedger.withdrawals.reduce((s, w) => s + w.amount, 0).toLocaleString()}</span></p>
            <button onClick={handleConfirmLedger} disabled={adding}
              className="bg-purple-600 text-white px-3 py-1 rounded text-xs mt-1">
              {adding ? 'Saving...' : `Save ${parsedLedger.deposits.length + parsedLedger.withdrawals.length} entries`}
            </button>
          </div>
        )}
      </div>

      {movements.length > 0 && (
        <div className="bg-gray-900 rounded-xl p-4">
          <p className="text-sm text-gray-400 mb-2">Fund Movements ({movements.length})</p>
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {movements.map(m => (
              <div key={m.id} className="flex justify-between items-center text-sm py-1 border-b border-gray-800 last:border-0">
                <span className="text-gray-500 w-24 text-xs">{m.date}</span>
                <span className={`font-medium w-20 ${m.type === 'deposit' ? 'text-green-400' : 'text-red-400'}`}>
                  {m.type === 'deposit' ? '+' : '-'}₹{Number(m.amount).toLocaleString()}
                </span>
                <span className="text-gray-500 flex-1 text-xs truncate px-2">{m.notes}</span>
                <button onClick={() => handleDeleteMovement(m.id)} className="text-red-500 text-xs hover:text-red-400">✕</button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-gray-900 rounded-xl p-4">
        <p className="text-sm text-gray-400 mb-3">Portfolio Snapshot</p>

        <form onSubmit={handleAddSnapshot} className="flex flex-wrap gap-2 mb-3">
          <input type="date" className="bg-gray-800 rounded px-2 py-1.5 text-sm flex-1 min-w-[120px]" value={ssForm.date} onChange={e => setSsForm({ ...ssForm, date: e.target.value })} />
          <input type="number" placeholder="Total value" className="bg-gray-800 rounded px-2 py-1.5 text-sm w-32" value={ssForm.total_value} onChange={e => setSsForm({ ...ssForm, total_value: e.target.value })} />
          <input type="text" placeholder="Notes" className="bg-gray-800 rounded px-2 py-1.5 text-sm flex-1 min-w-[120px]" value={ssForm.notes} onChange={e => setSsForm({ ...ssForm, notes: e.target.value })} />
          <button type="submit" disabled={adding} className="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-sm">Save</button>
        </form>

        <div className="border-t border-gray-800 pt-3">
          <p className="text-xs text-gray-500 mb-2">Or upload current holdings CSV to calculate total value</p>
          <input ref={fileRef} type="file" accept=".csv" onChange={handleCsvFile}
            className="text-sm text-gray-400 file:mr-3 file:bg-green-600 file:text-white file:border-0 file:rounded file:px-3 file:py-1" />
          {parsedCsv && (
            <div className="mt-2 flex gap-3 items-center">
              <p className="text-xs text-gray-400">{parsedCsv.count} holdings · Total: <span className="text-purple-400 font-semibold">₹{parsedCsv.total.toLocaleString()}</span></p>
              <button onClick={async () => {
                if (!supabase) return
                setAdding(true)
                const { data } = await supabase.from('portfolio_snapshots').insert({
                  date: parsedCsv.date, total_value: parsedCsv.total, method: 'csv', notes: `From CSV (${parsedCsv.count} holdings)`,
                }).select().single()
                if (data) setSnapshots([data, ...snapshots])
                setAdding(false)
                setParsedCsv(null)
                if (fileRef.current) fileRef.current.value = ''
              }} disabled={adding} className="bg-green-600 text-white px-3 py-1 rounded text-xs">Save snapshot</button>
            </div>
          )}
        </div>
      </div>

      {snapshots.length > 0 && (
        <div className="bg-gray-900 rounded-xl p-4">
          <p className="text-sm text-gray-400 mb-2">Snapshots ({snapshots.length})</p>
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {snapshots.map(s => (
              <div key={s.id} className="flex justify-between items-center text-sm py-1 border-b border-gray-800 last:border-0">
                <span className="text-gray-500 w-24 text-xs">{s.date}</span>
                <span className="font-medium text-purple-400 w-28">₹{Number(s.total_value).toLocaleString()}</span>
                <span className="text-gray-600 text-xs w-16">{s.method}</span>
                <span className="text-gray-500 flex-1 text-xs truncate px-2">{s.notes}</span>
                <button onClick={() => handleDeleteSnapshot(s.id)} className="text-red-500 text-xs hover:text-red-400">✕</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
