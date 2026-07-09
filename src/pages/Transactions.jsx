import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { detectFormat, parseCSV } from '../lib/csvParser'
import { formatIndian } from '../lib/format'

const BROKERS = [
  { id: '', label: 'Auto-detect' },
  { id: 'zerodha', label: 'Zerodha Kite' },
  { id: 'paytm', label: 'Paytm Money' },
  { id: 'icici', label: 'ICICI Direct' },
  { id: 'generic', label: 'Generic' },
]

export default function Transactions() {
  const [txns, setTxns] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const fileRef = useRef()
  const [currentFile, setCurrentFile] = useState('')
  const [broker, setBroker] = useState('')
  const [csvAccountId, setCsvAccountId] = useState('')
  const [filterAccountId, setFilterAccountId] = useState('')
  const [filterDateFrom, setFilterDateFrom] = useState('')
  const [filterDateTo, setFilterDateTo] = useState('')
  const [filterSymbol, setFilterSymbol] = useState('')
  const [visibleCount, setVisibleCount] = useState(100)
  const [parsed, setParsed] = useState(null)
  const [parsing, setParsing] = useState(false)
  const [uploadStatus, setUploadStatus] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [form, setForm] = useState({
    date: new Date().toISOString().split('T')[0],
    type: 'buy',
    symbol: '',
    qty: '',
    price: '',
    account_id: '',
  })
  const [accounts, setAccounts] = useState([])

  useEffect(() => {
    if (!supabase) return
    Promise.all([
      supabase.from('transactions').select('*, accounts(name)', { count: 'exact' }).order('date', { ascending: false }).limit(1000000),
      supabase.from('accounts').select('id, name'),
    ]).then(([txnRes, acctRes]) => {
      if (txnRes.data) setTxns(txnRes.data)
      if (acctRes.data) setAccounts(acctRes.data)
      setLoading(false)
    })
  }, [])

  const handleAdd = async (e) => {
    e.preventDefault()
    if (!form.symbol || !form.qty || !form.price || !supabase) return
    const { data } = await supabase.from('transactions').insert({
      date: form.date,
      type: form.type,
      symbol: form.symbol,
      qty: Number(form.qty),
      price: Number(form.price),
      account_id: form.account_id || null,
    }).select('*, accounts(name)').single()
    if (data) {
      setTxns([data, ...txns])
      setForm({ ...form, symbol: '', qty: '', price: '', account_id: '' })
      setShowForm(false)
    }
  }

  const handleFileSelect = (e) => {
    const file = fileRef.current?.files?.[0]
    if (!file) return
    setCurrentFile(file.name)
    setUploadStatus(null)
    setParsed(null)
    setParsing(true)
    const reader = new FileReader()
    reader.onload = (evt) => {
      const text = evt.target.result
      setTimeout(() => {
        const result = parseCSV(text, broker || null)
        setParsed(result)
        setParsing(false)
      }, 50)
    }
    reader.readAsText(file)
  }

  const handleConfirmUpload = async () => {
    if (!parsed || !parsed.rows.length || !supabase) return
    setUploading(true)
    setUploadStatus({ type: 'info', msg: 'Checking duplicates...' })

    try {
      let rows = parsed.rows.map(r => {
        const { _raw_order_id: _, ...rest } = r
        return {
          ...rest,
          account_id: csvAccountId || null,
          notes: currentFile
            ? (r.notes ? r.notes + '\n' : '') + 'source: ' + currentFile
            : r.notes || null,
        }
      })
      const acct = csvAccountId || null

      // Dedup by order_id within same account
      const orderIds = rows.map(r => r.order_id).filter(Boolean)
      if (orderIds.length) {
        const chunkSize = 500
        const existingIds = new Set()
        for (let i = 0; i < orderIds.length; i += chunkSize) {
          const chunk = orderIds.slice(i, i + chunkSize)
          let q = supabase.from('transactions').select('order_id').in('order_id', chunk)
          if (acct) q = q.eq('account_id', acct); else q = q.is('account_id', null)
          const { data: existing } = await q
          if (existing) existing.forEach(r => existingIds.add(r.order_id))
        }
        rows = rows.filter(r => !r.order_id || !existingIds.has(r.order_id))
      }

      // Fallback dedup by (date,symbol,type,qty,price,account_id) against existing rows (including null-order_id)
      let q = supabase.from('transactions').select('date,symbol,type,qty,price,account_id')
      if (acct) q = q.eq('account_id', acct); else q = q.is('account_id', null)
      const { data: existingTxns } = await q
      const existingFingerprints = new Set(
        (existingTxns || []).map(t => `${t.date}|${t.symbol}|${t.type}|${t.qty}|${t.price}|${t.account_id}`)
      )
      rows = rows.filter(r => !existingFingerprints.has(`${r.date}|${r.symbol}|${r.type}|${r.qty}|${r.price}|${r.account_id}`))

      const skipped = parsed.rows.length - rows.length
      if (!rows.length) {
        setUploadStatus({ type: 'warn', msg: `All ${skipped} rows already exist (duplicate order_ids)` })
        setUploading(false)
        return
      }

      setUploadStatus({ type: 'info', msg: `Uploading ${rows.length} transactions...` })

      const batchSize = 500
      let inserted = []
      for (let i = 0; i < rows.length; i += batchSize) {
        const batch = rows.slice(i, i + batchSize)
        const { data, error } = await supabase.from('transactions').insert(batch).select('*, accounts(name)')
        if (error) throw new Error(error.message)
        if (data) inserted.push(...data)
      }

      if (inserted.length) {
        setTxns([...inserted, ...txns])
        const lines = [`✓ Added ${inserted.length} new transactions`]
        if (skipped > 0) lines.push(`↻ Skipped ${skipped} duplicate${skipped > 1 ? 's' : ''} (already exist)`)
        setUploadStatus({ type: 'success', msg: lines.join('\n') })
        setParsed(null)
        fileRef.current.value = ''
      }
    } catch (err) {
      setUploadStatus({ type: 'error', msg: `Upload failed: ${err.message}` })
    }
    setUploading(false)
  }

  if (!supabase) return <p className="text-gray-500 text-center mt-10">Connect Supabase to add transactions</p>
  if (loading) return <p className="text-gray-500 text-center mt-10">Loading...</p>

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold">Transactions</h2>
        <button onClick={() => setShowForm(!showForm)} className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">+ Add</button>
      </div>

      <div className="rounded-xl bg-gray-900/60 border border-gray-800/50 p-4">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Upload trade history (CSV)</p>
        <div className="flex gap-2 mb-3">
          <select value={broker} onChange={(e) => setBroker(e.target.value)} className="bg-gray-800/80 text-white border border-gray-700/50 rounded-lg px-3 py-2 text-sm placeholder:text-gray-600 flex-1">
            {BROKERS.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
          </select>
          <select value={csvAccountId} onChange={(e) => setCsvAccountId(e.target.value)} className="bg-gray-800/80 text-white border border-gray-700/50 rounded-lg px-3 py-2 text-sm placeholder:text-gray-600 flex-1">
            <option value="">Select account</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".csv"
          onChange={handleFileSelect}
          className="text-sm text-gray-400 file:mr-3 file:bg-blue-600 file:hover:bg-blue-500 file:text-white file:border-0 file:rounded-lg file:px-3 file:py-2 file:text-sm file:font-medium file:transition-colors"
        />

        {parsing && (
          <p className="text-xs text-yellow-400 mt-3">Parsing CSV, please wait...</p>
        )}

        {parsed && (
          <div className="mt-3 space-y-2">
            <p className="text-xs text-gray-500">Detected format: <span className="text-gray-300">{parsed.format}</span></p>
            {currentFile && <p className="text-xs text-gray-500">File: <span className="text-gray-300">{currentFile}</span></p>}

            {parsed.missingColumns && (
              <p className="text-xs text-yellow-400">
                Could not find columns: {parsed.missingColumns.join(', ')}. Fill them manually or try a different format.
              </p>
            )}

            <p className="text-xs text-gray-500">
              {parsed.rows.length} valid rows, {parsed.errors.length} errors
            </p>

            {parsed.rows.length > 0 && (
              <>
                <div className="max-h-40 overflow-y-auto space-y-1 rounded-xl bg-gray-900/60 border border-gray-800/50 p-2">
                  {parsed.rows.slice(0, 10).map((r, i) => (
                    <div key={i} className="text-xs flex gap-3 text-gray-300">
                      <span className="w-20 text-gray-500">{r.date}</span>
                      <span className="w-8 text-gray-500">{r.type.toUpperCase()}</span>
                      <span className="w-20 font-semibold text-white">{r.symbol}</span>
                      <span className="w-12 text-right">{formatIndian(r.qty)}</span>
                      <span className="w-16 text-right">@{formatIndian(r.price)}</span>
                    </div>
                  ))}
                  {parsed.rows.length > 10 && (
                      <p className="text-xs text-gray-600">...and {parsed.rows.length - 10} more</p>
                    )}
                </div>

                <button
                  onClick={handleConfirmUpload}
                  disabled={uploading}
                  className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors w-full"
                >
                  {uploading ? 'Uploading...' : `Upload ${parsed.rows.length} transactions`}
                </button>
              </>
            )}

            {parsed.errors.length > 0 && (
              <div className="text-xs max-h-20 overflow-y-auto space-y-1">
                {parsed.errors.map((e, i) => (
                  <p key={i} className="text-yellow-400">{e}</p>
                ))}
              </div>
            )}

            {uploadStatus && (
              <div className={`text-sm whitespace-pre-line ${
                uploadStatus.type === 'success' ? 'text-green-400' :
                uploadStatus.type === 'error' ? 'text-red-400' : 'text-yellow-400'
              }`}>{uploadStatus.msg}</div>
            )}
          </div>
        )}
      </div>

      {showForm && (
        <form onSubmit={handleAdd} className="rounded-xl bg-gray-900/60 border border-gray-800/50 p-4 space-y-3">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Add Transaction</p>
          <div className="grid grid-cols-2 gap-3">
            <input type="date" className="bg-gray-800/80 text-white border border-gray-700/50 rounded-lg px-3 py-2 text-sm placeholder:text-gray-600" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            <select className="bg-gray-800/80 text-white border border-gray-700/50 rounded-lg px-3 py-2 text-sm placeholder:text-gray-600" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              <option value="buy">Buy</option>
              <option value="sell">Sell</option>
            </select>
          </div>
          <input placeholder="Symbol (e.g. RELIANCE)" className="w-full bg-gray-800/80 text-white border border-gray-700/50 rounded-lg px-3 py-2 text-sm placeholder:text-gray-600" value={form.symbol} onChange={(e) => setForm({ ...form, symbol: e.target.value.toUpperCase().replace(/#/g, '').replace(/\d+$/, '') })} />
          <div className="grid grid-cols-2 gap-3">
            <input type="number" placeholder="Qty" className="bg-gray-800/80 text-white border border-gray-700/50 rounded-lg px-3 py-2 text-sm placeholder:text-gray-600" value={form.qty} onChange={(e) => setForm({ ...form, qty: e.target.value })} />
            <input type="number" placeholder="Price" className="bg-gray-800/80 text-white border border-gray-700/50 rounded-lg px-3 py-2 text-sm placeholder:text-gray-600" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
          </div>
          <select className="w-full bg-gray-800/80 text-white border border-gray-700/50 rounded-lg px-3 py-2 text-sm placeholder:text-gray-600" value={form.account_id} onChange={(e) => setForm({ ...form, account_id: e.target.value })}>
            <option value="">No account</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <button type="submit" className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">Save</button>
        </form>
      )}

      <div className="rounded-xl bg-gray-900/60 border border-gray-800/50 p-4 space-y-3">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Filters</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">From</label>
            <input type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)}
              className="w-full bg-gray-800/80 text-white border border-gray-700/50 rounded-lg px-3 py-2 text-sm placeholder:text-gray-600 mt-1" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">To</label>
            <input type="date" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)}
              className="w-full bg-gray-800/80 text-white border border-gray-700/50 rounded-lg px-3 py-2 text-sm placeholder:text-gray-600 mt-1" />
          </div>
        </div>
        <div className="flex gap-2">
          <select value={filterAccountId} onChange={(e) => setFilterAccountId(e.target.value)} className="bg-gray-800/80 text-white border border-gray-700/50 rounded-lg px-3 py-2 text-sm placeholder:text-gray-600 flex-1">
            <option value="">All accounts</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <input type="text" placeholder="Symbol" value={filterSymbol} onChange={e => setFilterSymbol(e.target.value.toUpperCase())}
            className="bg-gray-800/80 text-white border border-gray-700/50 rounded-lg px-3 py-2 text-sm placeholder:text-gray-600 w-28" />
        </div>
      </div>

      <div className="space-y-2">
        {(() => {
          let filtered = txns
          if (filterAccountId) filtered = filtered.filter(t => t.account_id === Number(filterAccountId))
          if (filterDateFrom) filtered = filtered.filter(t => t.date >= filterDateFrom)
          if (filterDateTo) filtered = filtered.filter(t => t.date <= filterDateTo)
          if (filterSymbol) filtered = filtered.filter(t => t.symbol.includes(filterSymbol))
          const shown = filtered.slice(0, visibleCount)
          const hasMore = filtered.length > shown.length
          return (
            <>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">{filtered.length} of {txns.length} transactions</p>
              {shown.map((t) => (
                <div key={t.id} className="rounded-xl bg-gray-900/60 border border-gray-800/50 p-4 hover:border-gray-700/50 transition-colors">
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="font-semibold text-white">{t.symbol}</p>
                      <p className="text-xs text-gray-500">{t.type.toUpperCase()} {formatIndian(t.qty)} @ ₹{formatIndian(t.price)} &middot; {t.date}</p>
                      {t.accounts?.name && <p className="text-xs text-gray-600">{t.accounts.name}</p>}
                    </div>
                    <p className="font-medium text-white">₹{formatIndian(t.qty * t.price)}</p>
                  </div>
                </div>
              ))}
              {hasMore && (
                <button onClick={() => setVisibleCount(v => v + 200)}
                className="w-full text-center text-sm text-blue-400 py-2 hover:text-blue-300">
                  Show {Math.min(200, filtered.length - shown.length)} more ({filtered.length - shown.length} remaining)
                </button>
              )}
            </>
          )
        })()}
      </div>
    </div>
  )
}