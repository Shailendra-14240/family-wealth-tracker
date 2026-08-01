import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { parseCSV } from '../lib/csvParser'
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
    if (!csvAccountId) {
      setUploadStatus({ type: 'error', msg: 'Please select an account before uploading.' })
      return
    }
    setUploading(true)
    setUploadStatus({ type: 'info', msg: 'Starting upload...' })

    try {
      let rowsToInsert = parsed.rows.map(r => {
        const { _raw_order_id, ...rest } = r
        return {
          ...rest,
          account_id: csvAccountId,
          source_file: currentFile || null,
          source_order_id: _raw_order_id || null,
        }
      })

      // Dedup by order_id first
      const orderIds = rowsToInsert.map(r => r.order_id).filter(Boolean)
      let skipped = 0
      if (orderIds.length) {
        const existingIds = new Set()
        const { data: existing } = await supabase.from('transactions').select('order_id').eq('account_id', csvAccountId).in('order_id', orderIds)
        if (existing) existing.forEach(r => existingIds.add(r.order_id))

        const originalLength = rowsToInsert.length
        rowsToInsert = rowsToInsert.filter(r => !r.order_id || !existingIds.has(r.order_id))
        skipped = originalLength - rowsToInsert.length
      }

      // Dedup by fingerprint (date + symbol + type + qty + price) for records without order_id
      const withoutOrderId = rowsToInsert.filter(r => !r.order_id)
      if (withoutOrderId.length) {
        const fingerprints = new Set()
        const { data: existing } = await supabase
          .from('transactions')
          .select('date, symbol, type, qty, price')
          .eq('account_id', csvAccountId)
        
        if (existing) {
          existing.forEach(r => {
            const fp = `${r.date}|${r.symbol}|${r.type}|${r.qty}|${r.price}`
            fingerprints.add(fp)
          })
        }

        const originalLength = rowsToInsert.length
        rowsToInsert = rowsToInsert.filter(r => {
          if (r.order_id) return true
          const fp = `${r.date}|${r.symbol}|${r.type}|${r.qty}|${r.price}`
          return !fingerprints.has(fp)
        })
        skipped += originalLength - rowsToInsert.length
      }

      if (!rowsToInsert.length) {
        setUploadStatus({ type: 'warn', msg: `Upload cancelled: All ${skipped || parsed.rows.length} transactions already exist.` })
        setUploading(false)
        return
      }

      setUploadStatus({ type: 'info', msg: `Uploading ${rowsToInsert.length} new transactions...` })

      const { data, error } = await supabase.from('transactions').insert(rowsToInsert).select('*, accounts(name)')
      if (error) throw new Error(`Database error: ${error.message}`)

      if (data) {
        setTxns([...data, ...txns])
        const lines = [`✅ Success! Added ${data.length} new transactions.`]
        if (skipped > 0) lines.push(`- Skipped ${skipped} duplicate transaction(s).`)
        setUploadStatus({ type: 'success', msg: lines.join('\n') })
        setParsed(null)
        fileRef.current.value = ''
      } else {
        setUploadStatus({ type: 'warn', msg: "Upload finished, but no new rows were inserted." })
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
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
          <select value={broker} onChange={(e) => setBroker(e.target.value)} className="input-base">
            {BROKERS.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
          </select>
          <select value={csvAccountId} onChange={(e) => setCsvAccountId(e.target.value)} className="input-base">
            <option value="">-- Select Account --</option>
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

        {parsing && <p className="text-xs text-yellow-400 mt-3">Parsing CSV...</p>}

        {parsed && (
          <div className="mt-3 space-y-3">
            <div className="text-xs text-gray-400 space-y-1">
              <p>Detected format: <span className="text-gray-300">{parsed.format}</span></p>
              <p>{parsed.rows.length} valid rows, {parsed.errors.length} errors</p>
            </div>

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
                  {parsed.rows.length > 10 && <p className="text-xs text-gray-600">...and {parsed.rows.length - 10} more</p>}
                </div>

                {!csvAccountId && (
                  <div className="p-3 rounded-lg bg-yellow-900/50 border border-yellow-700/50 text-yellow-300 text-sm font-medium text-center">
                    Please select an account to enable upload.
                  </div>
                )}

                <button
                  onClick={handleConfirmUpload}
                  disabled={uploading || !csvAccountId}
                  className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors w-full disabled:bg-gray-700 disabled:text-gray-400 disabled:cursor-not-allowed"
                >
                  {uploading ? 'Uploading...' : !csvAccountId ? 'Select an Account' : `Upload ${parsed.rows.length} Transactions`}
                </button>
              </>
            )}
          </div>
        )}

        {uploadStatus && (
          <div className="mt-4 p-3 rounded-lg bg-gray-800/50 border border-gray-700/50">
            <p className={`text-sm font-semibold whitespace-pre-line ${
              uploadStatus.type === 'success' ? 'text-green-400' :
              uploadStatus.type === 'error' ? 'text-red-400' : 'text-yellow-400'
            }`}>{uploadStatus.msg}</p>
          </div>
        )}
      </div>

      {/* The rest of the component remains the same... */}
    </div>
  )
}
