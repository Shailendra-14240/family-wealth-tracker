import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { detectFormat, parseCSV } from '../lib/csvParser'

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
  const [broker, setBroker] = useState('')
  const [csvAccountId, setCsvAccountId] = useState('')
  const [filterAccountId, setFilterAccountId] = useState('')
  const [parsed, setParsed] = useState(null)
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
      supabase.from('transactions').select('*, accounts(name)').order('date', { ascending: false }),
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
    const reader = new FileReader()
    reader.onload = (evt) => {
      const text = evt.target.result
      const result = parseCSV(text, broker || null)
      setParsed(result)
    }
    reader.readAsText(file)
  }

  const handleConfirmUpload = async () => {
    if (!parsed || !parsed.rows.length || !supabase) return
    setUploading(true)

    // Dedup: skip rows with order_ids that already exist
    let rows = parsed.rows.map(r => ({ ...r, account_id: csvAccountId || null }))
    const orderIds = rows.map(r => r.order_id).filter(Boolean)
    if (orderIds.length) {
      const { data: existing } = await supabase
        .from('transactions')
        .select('order_id')
        .in('order_id', orderIds)
      const existingIds = new Set((existing || []).map(r => r.order_id))
      rows = rows.filter(r => !r.order_id || !existingIds.has(r.order_id))
    }

    const skipped = parsed.rows.length - rows.length
    if (!rows.length) {
      setParsed({ ...parsed, errors: [`All ${skipped} rows already exist (duplicate order_ids)`] })
      setUploading(false)
      return
    }

    const { data } = await supabase.from('transactions').insert(rows).select('*, accounts(name)')
    if (data) {
      setTxns([...data, ...txns])
      const msg = skipped > 0 ? `Uploaded ${rows.length} (skipped ${skipped} duplicates)` : `Uploaded ${rows.length} transactions`
      setParsed({ ...parsed, rows: [], errors: [msg] })
      fileRef.current.value = ''
    }
    setUploading(false)
  }

  if (!supabase) return <p className="text-gray-500 text-center mt-10">Connect Supabase to add transactions</p>
  if (loading) return <p className="text-gray-500 text-center mt-10">Loading...</p>

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold">Transactions</h2>
        <button onClick={() => setShowForm(!showForm)} className="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-sm">+ Add</button>
      </div>

      <div className="bg-gray-900 rounded-xl p-4">
        <p className="text-sm text-gray-400 mb-2">Upload trade history (CSV)</p>
        <div className="flex gap-2 mb-3">
          <select value={broker} onChange={(e) => setBroker(e.target.value)} className="bg-gray-800 rounded px-3 py-1.5 text-sm flex-1">
            {BROKERS.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
          </select>
          <select value={csvAccountId} onChange={(e) => setCsvAccountId(e.target.value)} className="bg-gray-800 rounded px-3 py-1.5 text-sm flex-1">
            <option value="">Select account</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".csv"
          onChange={handleFileSelect}
          className="text-sm text-gray-400 file:mr-3 file:bg-blue-600 file:text-white file:border-0 file:rounded file:px-3 file:py-1"
        />

        {parsed && (
          <div className="mt-3 space-y-2">
            <p className="text-xs text-gray-500">Detected format: <span className="text-gray-300">{parsed.format}</span></p>

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
                <div className="max-h-40 overflow-y-auto space-y-1 bg-gray-800 rounded p-2">
                  {parsed.rows.slice(0, 10).map((r, i) => (
                    <div key={i} className="text-xs flex gap-3 text-gray-300">
                      <span className="w-20 text-gray-500">{r.date}</span>
                      <span className="w-8 text-gray-500">{r.type.toUpperCase()}</span>
                      <span className="w-20 font-medium">{r.symbol}</span>
                      <span className="w-12 text-right">{r.qty}</span>
                      <span className="w-16 text-right">@{Number(r.price).toLocaleString()}</span>
                    </div>
                  ))}
                  {parsed.rows.length > 10 && (
                    <p className="text-xs text-gray-600">...and {parsed.rows.length - 10} more</p>
                  )}
                </div>

                <button
                  onClick={handleConfirmUpload}
                  disabled={uploading}
                  className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm w-full"
                >
                  {uploading ? 'Uploading...' : `Upload ${parsed.rows.length} transactions`}
                </button>
              </>
            )}

            {parsed.errors.length > 0 && (
              <div className="text-xs text-red-400 max-h-20 overflow-y-auto">
                {parsed.errors.map((e, i) => <p key={i}>{e}</p>)}
              </div>
            )}
          </div>
        )}
      </div>

      {showForm && (
        <form onSubmit={handleAdd} className="bg-gray-900 rounded-xl p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <input type="date" className="bg-gray-800 rounded px-3 py-2 text-sm" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            <select className="bg-gray-800 rounded px-3 py-2 text-sm" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              <option value="buy">Buy</option>
              <option value="sell">Sell</option>
            </select>
          </div>
          <input placeholder="Symbol (e.g. RELIANCE)" className="w-full bg-gray-800 rounded px-3 py-2 text-sm" value={form.symbol} onChange={(e) => setForm({ ...form, symbol: e.target.value.toUpperCase() })} />
          <div className="grid grid-cols-2 gap-3">
            <input type="number" placeholder="Qty" className="bg-gray-800 rounded px-3 py-2 text-sm" value={form.qty} onChange={(e) => setForm({ ...form, qty: e.target.value })} />
            <input type="number" placeholder="Price" className="bg-gray-800 rounded px-3 py-2 text-sm" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
          </div>
          <select className="w-full bg-gray-800 rounded px-3 py-2 text-sm" value={form.account_id} onChange={(e) => setForm({ ...form, account_id: e.target.value })}>
            <option value="">No account</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm">Save</button>
        </form>
      )}

      <div className="flex gap-2 mb-2">
        <select value={filterAccountId} onChange={(e) => setFilterAccountId(e.target.value)} className="bg-gray-800 rounded px-3 py-1.5 text-sm flex-1">
          <option value="">All accounts</option>
          {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <p className="text-sm text-gray-500 self-center">{txns.length} total</p>
      </div>

      <div className="space-y-2">
        {(filterAccountId ? txns.filter(t => t.account_id === Number(filterAccountId)) : txns).map((t) => (
          <div key={t.id} className="bg-gray-900 rounded-xl p-4">
            <div className="flex justify-between items-center">
              <div>
                <p className="font-semibold">{t.symbol}</p>
                <p className="text-xs text-gray-500">{t.type.toUpperCase()} {t.qty} @ ₹{Number(t.price).toLocaleString()} &middot; {t.date}</p>
                {t.accounts?.name && <p className="text-xs text-gray-600">{t.accounts.name}</p>}
              </div>
              <p className="font-medium">₹{(Number(t.qty) * Number(t.price)).toLocaleString()}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
