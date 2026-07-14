import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { parseFoCsv } from '../lib/foCsvParser'
import { calculateFoPnl, calculateFoSummary } from '../lib/foPnlCalc'
import { formatIndian } from '../lib/format'

export default function FoTrades() {
  const [foTxns, setFoTxns] = useState([])
  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(true)
  const fileRef = useRef()
  const [currentFile, setCurrentFile] = useState('')
  const [csvAccountId, setCsvAccountId] = useState('')
  const [parsed, setParsed] = useState(null)
  const [parsing, setParsing] = useState(false)
  const [uploadStatus, setUploadStatus] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [pnlData, setPnlData] = useState([])
  const [summary, setSummary] = useState(null)

  useEffect(() => {
    if (!supabase) return
    Promise.all([
      supabase.from('fo_transactions').select('*').order('date', { ascending: false }).limit(1000000),
      supabase.from('accounts').select('id, name'),
    ]).then(([txnRes, acctRes]) => {
      if (txnRes.data) { setFoTxns(txnRes.data); computePnl(txnRes.data) }
      if (acctRes.data) setAccounts(acctRes.data)
      setLoading(false)
    })
  }, [])

  function computePnl(txns) {
    const result = calculateFoPnl(txns)
    setPnlData(result)
    setSummary(calculateFoSummary(result))
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
        const result = parseFoCsv(text)
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
      let rows = parsed.rows.map(r => ({
        ...r,
        account_id: csvAccountId || null,
        source_file: currentFile || null,
      }))
      const acct = csvAccountId || null

      // Dedup by trade_id within same account
      const tradeIds = rows.map(r => r.trade_id).filter(Boolean)
      if (tradeIds.length) {
        const chunkSize = 500
        const existingIds = new Set()
        for (let i = 0; i < tradeIds.length; i += chunkSize) {
          const chunk = tradeIds.slice(i, i + chunkSize)
          let q = supabase.from('fo_transactions').select('trade_id').in('trade_id', chunk)
          if (acct) q = q.eq('account_id', acct); else q = q.is('account_id', null)
          const { data: existing } = await q
          if (existing) existing.forEach(r => existingIds.add(r.trade_id))
        }
        rows = rows.filter(r => !r.trade_id || !existingIds.has(r.trade_id))
      }

      const skipped = parsed.rows.length - rows.length
      if (!rows.length) {
        setUploadStatus({ type: 'warn', msg: `All ${skipped} rows already exist` })
        setUploading(false)
        return
      }

      setUploadStatus({ type: 'info', msg: `Uploading ${rows.length} F&O trades...` })

      const batchSize = 500
      let inserted = []
      for (let i = 0; i < rows.length; i += batchSize) {
        const batch = rows.slice(i, i + batchSize)
        const { data, error } = await supabase.from('fo_transactions').insert(batch).select()
        if (error) throw new Error(error.message)
        if (data) inserted.push(...data)
      }

      if (inserted.length) {
        const allTxns = [...inserted, ...foTxns]
        setFoTxns(allTxns)
        computePnl(allTxns)
        const lines = [`✓ Added ${inserted.length} F&O trades`]
        if (skipped > 0) lines.push(`↻ Skipped ${skipped} duplicate${skipped > 1 ? 's' : ''}`)
        setUploadStatus({ type: 'success', msg: lines.join('\n') })
        setParsed(null)
        fileRef.current.value = ''
      }
    } catch (err) {
      setUploadStatus({ type: 'error', msg: `Upload failed: ${err.message}` })
    }
    setUploading(false)
  }

  if (!supabase) return <p className="text-gray-500 text-center mt-10">Connect Supabase</p>
  if (loading) return <p className="text-gray-500 text-center mt-10">Loading...</p>

  return (
    <div className="space-y-4">
      <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wider">F&O Trades</h2>

      <div className="rounded-xl bg-gray-900/60 border border-gray-800/50 p-4">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Upload F&O CSV (Zerodha Kite)</p>
        <div className="flex gap-2 mb-3">
          <select value={csvAccountId} onChange={(e) => setCsvAccountId(e.target.value)}
            className="bg-gray-800/80 text-white border border-gray-700/50 rounded-lg px-3 py-2 text-sm flex-1">
            <option value="">Select account</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".csv"
          onChange={handleFileSelect}
          className="text-sm text-gray-400 file:mr-3 file:bg-blue-600 file:hover:bg-blue-500 file:text-white file:border-0 file:rounded-lg file:px-3 file:py-2 file:text-sm file:font-medium"
        />

        {parsing && <p className="text-xs text-yellow-400 mt-3">Parsing CSV...</p>}

        {parsed && (
          <div className="mt-3 space-y-2">
            {currentFile && <p className="text-xs text-gray-500">File: <span className="text-gray-300">{currentFile}</span></p>}
            <p className="text-xs text-gray-500">
              {parsed.rows.length} valid rows, {parsed.errors.length} errors
            </p>

            {parsed.rows.length > 0 && (
              <>
                <div className="max-h-40 overflow-y-auto space-y-1 rounded-xl bg-gray-800/50 p-2">
                  {parsed.rows.slice(0, 10).map((r, i) => (
                    <div key={i} className="text-xs flex gap-3 text-gray-300">
                      <span className="w-20 text-gray-500">{r.date}</span>
                      <span className="w-8 text-gray-500">{r.type.toUpperCase()}</span>
                      <span className="w-28 font-semibold text-white truncate">{r.symbol}</span>
                      <span className="w-12 text-right">{formatIndian(r.qty)}</span>
                      <span className="w-16 text-right">@{formatIndian(r.price)}</span>
                      <span className="w-20 text-gray-500">exp {r.expiry_date}</span>
                    </div>
                  ))}
                  {parsed.rows.length > 10 && <p className="text-xs text-gray-600">...and {parsed.rows.length - 10} more</p>}
                </div>

                <button onClick={handleConfirmUpload} disabled={uploading}
                  className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium w-full">
                  {uploading ? 'Uploading...' : `Upload ${parsed.rows.length} trades`}
                </button>
              </>
            )}

            {parsed.errors.length > 0 && (
              <div className="text-xs max-h-20 overflow-y-auto space-y-1">
                {parsed.errors.map((e, i) => <p key={i} className="text-yellow-400">{e}</p>)}
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

      {summary && (
        <div className="rounded-xl bg-gray-900/60 border border-gray-800/50 p-4">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">F&O Summary</p>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <p className="text-[10px] text-gray-500">Realized P&L</p>
              <p className={`text-lg font-bold ${summary.totalRealizedPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {summary.totalRealizedPnl >= 0 ? '+' : ''}₹{formatIndian(summary.totalRealizedPnl)}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-gray-500">Open Long</p>
              <p className="text-lg font-bold text-white">{formatIndian(summary.openLongQty)} lots</p>
            </div>
            <div>
              <p className="text-[10px] text-gray-500">Open Short</p>
              <p className="text-lg font-bold text-yellow-400">{formatIndian(summary.openShortQty)} lots</p>
            </div>
          </div>
        </div>
      )}

      {pnlData.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">
            {foTxns.length} F&O trades across {pnlData.length} symbols
          </p>
          {pnlData.filter(r => r.realizedPnl !== 0).sort((a, b) => Math.abs(b.realizedPnl) - Math.abs(a.realizedPnl)).slice(0, 30).map(r => (
            <div key={r.symbol} className="rounded-xl bg-gray-900/60 border border-gray-800/50 p-3">
              <div className="flex justify-between items-center">
                <p className="font-semibold text-sm text-white">{r.symbol}</p>
                <span className={`font-semibold text-sm ${r.realizedPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {r.realizedPnl >= 0 ? '+' : ''}₹{formatIndian(r.realizedPnl)}
                </span>
              </div>
              {r.netQty !== 0 && (
                <p className="text-[10px] text-gray-500 mt-0.5">
                  Open: {r.netQty > 0 ? 'Long' : 'Short'} {formatIndian(Math.abs(r.netQty))} @ ₹{formatIndian(r.openLots[0]?.price || 0)}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {pnlData.length === 0 && !loading && (
        <p className="text-gray-500 text-center py-10 text-sm">No F&O trades found. Upload a CSV to get started.</p>
      )}
    </div>
  )
}
