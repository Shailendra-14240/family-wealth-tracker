import { useState, useEffect, useRef, useMemo } from 'react'
import { supabase } from '../lib/supabase'

export default function Returns() {
  const [accounts, setAccounts] = useState([])
  const [ledgerRows, setLedgerRows] = useState([])
  const [movements, setMovements] = useState([])
  const [snapshots, setSnapshots] = useState([])
  const [loading, setLoading] = useState(true)
  const fileRef = useRef()
  const ledgerRef = useRef()
  const [selectedAccount, setSelectedAccount] = useState('')
  const [fmForm, setFmForm] = useState({ date: new Date().toISOString().split('T')[0], type: 'deposit', amount: '', notes: '' })
  const [ssForm, setSsForm] = useState({ date: new Date().toISOString().split('T')[0], total_value: '', notes: '' })
  const [parsedCsv, setParsedCsv] = useState(null)
  const [parsedLedger, setParsedLedger] = useState(null)
  const [uploadingLedger, setUploadingLedger] = useState(false)
  const [adding, setAdding] = useState(false)

  useEffect(() => {
    if (!supabase) return
    Promise.all([
      supabase.from('accounts').select('id, name').order('name'),
      supabase.from('ledger_rows').select('*').limit(1000000),
      supabase.from('fund_movements').select('*').limit(1000000),
      supabase.from('portfolio_snapshots').select('*').limit(1000000),
    ]).then(([acctRes, lrRes, fmRes, ssRes]) => {
      if (acctRes.data) setAccounts(acctRes.data)
      if (lrRes.data) setLedgerRows(lrRes.data)
      if (fmRes.data) setMovements(fmRes.data)
      if (ssRes.data) setSnapshots(ssRes.data)
      setLoading(false)
    })
  }, [])

  const accountFilter = (item) => !selectedAccount || Number(item.account_id) === Number(selectedAccount)
  const accountFilterNum = (id) => !selectedAccount || Number(id) === Number(selectedAccount)

  const filteredLedger = useMemo(() => ledgerRows.filter(accountFilter), [ledgerRows, selectedAccount])
  const filteredMovements = useMemo(() => movements.filter(accountFilter), [movements, selectedAccount])
  const filteredSnapshots = useMemo(() => snapshots.filter(accountFilter), [snapshots, selectedAccount])

  // Per-account computation
  const perAccount = useMemo(() => {
    const activeIds = [...new Set([
      ...ledgerRows.map(r => r.account_id),
      ...movements.map(m => m.account_id),
      ...snapshots.map(s => s.account_id),
    ].filter(Boolean))]
    return activeIds.map(aid => {
      const lr = ledgerRows.filter(r => Number(r.account_id) === Number(aid))
      const fm = movements.filter(m => Number(m.account_id) === Number(aid))
      const ss = snapshots.filter(s => Number(s.account_id) === Number(aid))
      const deposits = lr.filter(r => r.voucher_type === 'Bank Receipts').reduce((s, r) => s + Number(r.credit), 0)
        + fm.filter(m => m.type === 'deposit').reduce((s, m) => s + Number(m.amount), 0)
      const withdrawals = lr.filter(r => r.voucher_type === 'Bank Payments').reduce((s, r) => s + Number(r.debit), 0)
        + fm.filter(m => m.type === 'withdrawal').reduce((s, m) => s + Number(m.amount), 0)
      const latest = ss.length ? ss.reduce((a, b) => new Date(a.date) > new Date(b.date) ? a : b) : null
      const holdingsVal = latest ? Number(latest.total_value) : 0
      const netBalRow = lr.length ? lr.reduce((a, b) => new Date(a.date) > new Date(b.date) || (a.date === b.date && a.id > b.id) ? a : b) : null
      const cash = netBalRow ? Number(netBalRow.net_balance) || 0 : 0
      const netAdded = deposits - withdrawals
      const totalValue = holdingsVal + cash
      const pnl = totalValue - netAdded
      return { accountId: Number(aid), deposits, withdrawals, netAdded, holdingsVal, cash, totalValue, pnl }
    })
  }, [ledgerRows, movements, snapshots])

  // Apply account filter
  const accountData = useMemo(() => {
    if (!selectedAccount) return perAccount
    return perAccount.filter(a => a.accountId === Number(selectedAccount))
  }, [perAccount, selectedAccount])

  const totalDeposits = accountData.reduce((s, a) => s + a.deposits, 0)
  const totalWithdrawals = accountData.reduce((s, a) => s + a.withdrawals, 0)
  const netAdded = accountData.reduce((s, a) => s + a.netAdded, 0)
  const totalHoldingsVal = accountData.reduce((s, a) => s + a.holdingsVal, 0)
  const totalCash = accountData.reduce((s, a) => s + a.cash, 0)
  const totalValue = totalHoldingsVal + totalCash
  const totalPnl = accountData.reduce((s, a) => s + a.pnl, 0)
  const returnPct = netAdded > 0 ? (totalPnl / netAdded * 100) : 0

  const handleAddMovement = async (e) => {
    e.preventDefault()
    if (!fmForm.amount || !supabase) return
    setAdding(true)
    const { data } = await supabase.from('fund_movements').insert({
      date: fmForm.date, type: fmForm.type, amount: Number(fmForm.amount),
      account_id: selectedAccount || null, notes: fmForm.notes || null,
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
      const rawHeaders = lines[0].split(',').map(h => h.replace(/["']/g, '').trim())
      const headers = rawHeaders.map(h => h.toLowerCase())
      const dateIdx = headers.indexOf('posting_date')
      const voucherIdx = headers.indexOf('voucher_type')
      const creditIdx = headers.indexOf('credit')
      const debitIdx = headers.indexOf('debit')
      const notesIdx = headers.indexOf('particulars')
      const balIdx = headers.indexOf('net_balance')
      if (dateIdx < 0 || voucherIdx < 0) return
      const rows = []
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',').map(c => c.replace(/["']/g, '').trim())
        if (cols.length < 2) continue
        const date = cols[dateIdx] || ''
        if (!date) continue // skip Opening/Closing Balance rows
        rows.push({
          date,
          voucher_type: cols[voucherIdx] || '',
          description: (cols[notesIdx] || '').slice(0, 250),
          debit: parseFloat(cols[debitIdx]) || 0,
          credit: parseFloat(cols[creditIdx]) || 0,
          net_balance: balIdx >= 0 ? (parseFloat(cols[balIdx]) || 0) : null,
        })
      }
      setParsedLedger({ rows, fileName: file.name })
    }
    reader.readAsText(file)
  }

  const handleConfirmLedger = async () => {
    if (!parsedLedger || !supabase || !selectedAccount) return
    setUploadingLedger(true)
    const { error: delErr } = await supabase.from('ledger_rows').delete().eq('account_id', Number(selectedAccount))
    if (delErr) { alert('Delete error: ' + delErr.message); setUploadingLedger(false); return }
    const entries = parsedLedger.rows.map(r => ({
      account_id: Number(selectedAccount),
      date: r.date, voucher_type: r.voucher_type || 'Unknown',
      description: (r.description || '').slice(0, 250),
      debit: r.debit || 0, credit: r.credit || 0,
      net_balance: r.net_balance != null ? r.net_balance : null,
    }))
    const { data, error: insErr } = await supabase.from('ledger_rows').insert(entries).select()
    if (insErr) { alert('Insert error: ' + insErr.message); setUploadingLedger(false); return }
    if (data) setLedgerRows([
      ...ledgerRows.filter(r => Number(r.account_id) !== Number(selectedAccount)),
      ...data,
    ])
    setUploadingLedger(false)
    setParsedLedger(null)
    if (ledgerRef.current) ledgerRef.current.value = ''
  }

  const handleDeleteLedger = async () => {
    if (!supabase || !selectedAccount) return
    await supabase.from('ledger_rows').delete().eq('account_id', Number(selectedAccount))
    setLedgerRows(ledgerRows.filter(r => Number(r.account_id) !== Number(selectedAccount)))
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
      date: ssForm.date, total_value: Number(ssForm.total_value),
      account_id: selectedAccount || null, notes: ssForm.notes || null, method: 'manual',
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
      const curValIdx = headers.findIndex(h => /cur\.?\s*val|current/i.test(h))
      let total = 0
      let count = 0
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',').map(c => c.replace(/["']/g, '').trim())
        if (curValIdx >= 0) {
          const val = parseFloat(cols[curValIdx]) || 0
          if (val) { total += val; count++ }
        } else {
          const qtyIdx = headers.findIndex(h => /qty|quantity|qty\./i.test(h))
          const priceIdx = headers.findIndex(h => /price|rate|cost|avg|ltp/i.test(h))
          const qty = qtyIdx >= 0 ? parseFloat(cols[qtyIdx]) || 0 : 0
          const price = priceIdx >= 0 ? parseFloat(cols[priceIdx]) || 0 : 0
          if (qty && price) { total += qty * price; count++ }
        }
      }
      setParsedCsv({ total: Math.round(total * 100) / 100, count, date: new Date().toISOString().split('T')[0] })
    }
    reader.readAsText(file)
  }

  if (!supabase) return <p className="text-gray-500 text-center mt-10">Connect Supabase to see returns data</p>
  if (loading) return <p className="text-gray-500 text-center mt-10">Loading...</p>

  const accountLedgerRows = filteredLedger.length

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Returns Calculator</h2>

      <div className="bg-gray-900 rounded-xl p-4">
        <label className="text-xs text-gray-500">Account</label>
        <select value={selectedAccount} onChange={e => setSelectedAccount(e.target.value)}
          className="w-full bg-gray-800 rounded px-3 py-2 text-sm mt-1">
          <option value="">All accounts</option>
          {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </div>

      {/* Row 1: Fund flow */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-gray-900 rounded-xl p-3 text-center">
          <p className="text-xs text-gray-400">Total Deposits</p>
          <p className="text-lg font-bold text-green-400">+₹{totalDeposits.toLocaleString()}</p>
        </div>
        <div className="bg-gray-900 rounded-xl p-3 text-center">
          <p className="text-xs text-gray-400">Total Withdrawals</p>
          <p className="text-lg font-bold text-red-400">-₹{totalWithdrawals.toLocaleString()}</p>
        </div>
        <div className="bg-gray-900 rounded-xl p-3 text-center">
          <p className="text-xs text-gray-400">Net Added</p>
          <p className="text-lg font-bold text-blue-400">₹{netAdded.toLocaleString()}</p>
        </div>
      </div>

      {/* Row 2: Current position */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-gray-900 rounded-xl p-3 text-center">
          <p className="text-xs text-gray-400">Holdings Value</p>
          <p className="text-lg font-bold text-purple-400">₹{totalHoldingsVal.toLocaleString()}</p>
        </div>
        <div className="bg-gray-900 rounded-xl p-3 text-center">
          <p className="text-xs text-gray-400">Available Cash</p>
          <p className="text-lg font-bold text-yellow-400">₹{totalCash.toLocaleString()}</p>
        </div>
        <div className="bg-gray-900 rounded-xl p-3 text-center">
          <p className="text-xs text-gray-400">Total Value</p>
          <p className="text-lg font-bold text-white">₹{totalValue.toLocaleString()}</p>
        </div>
      </div>

      {/* Row 3: P&L */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-gray-900 rounded-xl p-3 text-center">
          <p className="text-xs text-gray-400">Total P&L</p>
          <p className={`text-xl font-bold ${totalPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {totalPnl >= 0 ? '+' : ''}₹{totalPnl.toLocaleString()}
          </p>
        </div>
        <div className="bg-gray-900 rounded-xl p-3 text-center">
          <p className="text-xs text-gray-400">Return %</p>
          <p className={`text-xl font-bold ${returnPct >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {returnPct >= 0 ? '+' : ''}{returnPct.toFixed(2)}%
          </p>
        </div>
      </div>

      {/* Per-account breakdown (only in All view) */}
      {!selectedAccount && accountData.length > 1 && (
        <div className="bg-gray-900 rounded-xl p-4">
          <p className="text-sm text-gray-400 mb-2">Per Account</p>
          <div className="space-y-2">
            {accountData.map(a => {
              const acct = accounts.find(x => x.id === a.accountId)
              return (
                <div key={a.accountId} className="text-xs border-b border-gray-800 pb-2 last:border-0">
                  <p className="font-medium text-gray-300 mb-1">{acct?.name || `Account #${a.accountId}`}</p>
                  <div className="grid grid-cols-4 gap-2 text-gray-500">
                    <span>Net: <span className="text-blue-400">₹{a.netAdded.toLocaleString()}</span></span>
                    <span>Holdings: <span className="text-purple-400">₹{a.holdingsVal.toLocaleString()}</span></span>
                    <span>Cash: <span className="text-yellow-400">₹{a.cash.toLocaleString()}</span></span>
                    <span>P&L: <span className={a.pnl >= 0 ? 'text-green-400' : 'text-red-400'}>{a.pnl >= 0 ? '+' : ''}₹{a.pnl.toLocaleString()}</span></span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Ledger Upload */}
      <div className="bg-gray-900 rounded-xl p-4">
        <p className="text-sm text-gray-400 mb-2">Zerodha Ledger</p>
        <p className="text-xs text-gray-600 mb-2">Upload the full ledger CSV — all rows saved as raw data.</p>
        {!selectedAccount && <p className="text-xs text-yellow-500 mb-2">Select an account first</p>}
        <div className="flex gap-2 items-center">
          <input ref={ledgerRef} type="file" accept=".csv" onChange={handleLedgerFile}
            className="text-sm text-gray-400 file:mr-3 file:bg-purple-600 file:text-white file:border-0 file:rounded file:px-3 file:py-1 flex-1" />
          {accountLedgerRows > 0 && (
            <button onClick={handleDeleteLedger} className="text-red-500 text-xs hover:text-red-400">Delete ledger</button>
          )}
        </div>
        {parsedLedger && (
          <div className="mt-2 space-y-1 text-xs">
            <p className="text-gray-400">{parsedLedger.rows.length} rows from {parsedLedger.fileName}</p>
            <p className="text-green-400">Deposits: +₹{parsedLedger.rows.filter(r => r.voucher_type === 'Bank Receipts').reduce((s, r) => s + r.credit, 0).toLocaleString()}</p>
            <p className="text-red-400">Withdrawals: -₹{parsedLedger.rows.filter(r => r.voucher_type === 'Bank Payments').reduce((s, r) => s + r.debit, 0).toLocaleString()}</p>
            <p className="text-xs text-yellow-500">Replaces existing ledger data for this account</p>
            <button onClick={handleConfirmLedger} disabled={uploadingLedger || !selectedAccount}
              className="bg-purple-600 text-white px-3 py-1 rounded text-xs mt-1">
              {uploadingLedger ? 'Saving...' : `Save ${parsedLedger.rows.length} rows`}
            </button>
          </div>
        )}
        {accountLedgerRows > 0 && !parsedLedger && (
          <p className="text-xs text-gray-500 mt-1">{accountLedgerRows} rows saved</p>
        )}
      </div>

      {/* Manual Fund Movement */}
      <div className="bg-gray-900 rounded-xl p-4">
        <p className="text-sm text-gray-400 mb-3">Manual Fund Movement</p>
        <form onSubmit={handleAddMovement} className="flex flex-wrap gap-2">
          <input type="date" className="bg-gray-800 rounded px-2 py-1.5 text-sm flex-1 min-w-[120px]" value={fmForm.date} onChange={e => setFmForm({ ...fmForm, date: e.target.value })} />
          <select className="bg-gray-800 rounded px-2 py-1.5 text-sm w-28" value={fmForm.type} onChange={e => setFmForm({ ...fmForm, type: e.target.value })}>
            <option value="deposit">Deposit</option>
            <option value="withdrawal">Withdrawal</option>
          </select>
          <input type="number" placeholder="Amount" className="bg-gray-800 rounded px-2 py-1.5 text-sm w-28" value={fmForm.amount} onChange={e => setFmForm({ ...fmForm, amount: e.target.value })} />
          <input type="text" placeholder="Notes" className="bg-gray-800 rounded px-2 py-1.5 text-sm flex-1 min-w-[120px]" value={fmForm.notes} onChange={e => setFmForm({ ...fmForm, notes: e.target.value })} />
          <button type="submit" disabled={adding || !selectedAccount} className="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-sm">Add</button>
        </form>
      </div>

      {filteredMovements.length > 0 && (
        <div className="bg-gray-900 rounded-xl p-4">
          <p className="text-sm text-gray-400 mb-2">Manual Movements ({filteredMovements.length})</p>
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {filteredMovements.map(m => (
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
          <button type="submit" disabled={adding || !selectedAccount} className="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-sm">Save</button>
        </form>

        <div className="border-t border-gray-800 pt-3">
          <p className="text-xs text-gray-500 mb-2">Or upload holdings CSV (uses Cur.val column)</p>
          <input ref={fileRef} type="file" accept=".csv" onChange={handleCsvFile}
            className="text-sm text-gray-400 file:mr-3 file:bg-green-600 file:text-white file:border-0 file:rounded file:px-3 file:py-1" />
          {parsedCsv && (
            <div className="mt-2 flex gap-3 items-center">
              <p className="text-xs text-gray-400">{parsedCsv.count} holdings · Total: <span className="text-purple-400 font-semibold">₹{parsedCsv.total.toLocaleString()}</span></p>
              <button onClick={async () => {
                if (!supabase) return
                setAdding(true)
                const { data } = await supabase.from('portfolio_snapshots').insert({
                  date: parsedCsv.date, total_value: parsedCsv.total,
                  account_id: selectedAccount || null, method: 'csv',
                  notes: `From CSV (${parsedCsv.count} holdings)`,
                }).select().single()
                if (data) setSnapshots([data, ...snapshots])
                setAdding(false)
                setParsedCsv(null)
                if (fileRef.current) fileRef.current.value = ''
              }} disabled={adding || !selectedAccount} className="bg-green-600 text-white px-3 py-1 rounded text-xs">Save snapshot</button>
            </div>
          )}
        </div>
      </div>

      {filteredSnapshots.length > 0 && (
        <div className="bg-gray-900 rounded-xl p-4">
          <p className="text-sm text-gray-400 mb-2">Snapshots ({filteredSnapshots.length})</p>
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {filteredSnapshots.map(s => (
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