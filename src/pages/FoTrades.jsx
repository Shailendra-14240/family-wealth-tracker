import { useState, useEffect, useMemo, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { parseFoCsv } from '../lib/foCsvParser'
import { calculateFoPnl, calculateFoSummary, parseFoOptionSymbol } from '../lib/foPnlCalc'
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
  const [allPnl, setAllPnl] = useState([])
  const [allSummary, setAllSummary] = useState(null)

  // Filters
  const [filterAccount, setFilterAccount] = useState('')
  const [filterMonth, setFilterMonth] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')

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
    setAllPnl(result)
    setAllSummary(calculateFoSummary(result))
    setPnlData(result)
    setSummary(calculateFoSummary(result))
  }

  // Extract distinct months for filter
  const months = useMemo(() => {
    const m = new Set()
    for (const t of foTxns) {
      m.add(t.date.substring(0, 7))
    }
    return [...m].sort().reverse()
  }, [foTxns])

  // Apply filters
  const filteredTxns = useMemo(() => {
    let txns = foTxns
    if (filterAccount) txns = txns.filter(t => Number(t.account_id) === Number(filterAccount))
    if (filterMonth) txns = txns.filter(t => t.date && t.date.startsWith(filterMonth))
    return txns
  }, [foTxns, filterAccount, filterMonth])

  // Recompute PnL when filtered transactions change
  useEffect(() => {
    if (!foTxns.length) return
    const result = calculateFoPnl(filteredTxns)
    setPnlData(result)
    setSummary(calculateFoSummary(result))
  }, [filteredTxns])

  // Apply status filter to results
  const displayData = useMemo(() => {
    let data = pnlData
    if (filterStatus === 'open') data = data.filter(r => r.netQty !== 0)
    else if (filterStatus === 'closed') data = data.filter(r => r.netQty === 0)
    return data.sort((a, b) => Math.abs(b.realizedPnl) - Math.abs(a.realizedPnl))
  }, [pnlData, filterStatus])

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
        <input ref={fileRef} type="file" accept=".csv" onChange={handleFileSelect}
          className="text-sm text-gray-400 file:mr-3 file:bg-blue-600 file:hover:bg-blue-500 file:text-white file:border-0 file:rounded-lg file:px-3 file:py-2 file:text-sm file:font-medium" />
        {parsing && <p className="text-xs text-yellow-400 mt-3">Parsing CSV...</p>}
        {parsed && (
          <div className="mt-3 space-y-2">
            {currentFile && <p className="text-xs text-gray-500">File: <span className="text-gray-300">{currentFile}</span></p>}
            <p className="text-xs text-gray-500">{parsed.rows.length} valid rows, {parsed.errors.length} errors</p>
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
              <div className={`text-sm whitespace-pre-line ${uploadStatus.type === 'success' ? 'text-green-400' : uploadStatus.type === 'error' ? 'text-red-400' : 'text-yellow-400'}`}>{uploadStatus.msg}</div>
            )}
          </div>
        )}
      </div>

      <div className="rounded-xl bg-gray-900/60 border border-gray-800/50 p-3">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <select value={filterAccount} onChange={e => setFilterAccount(e.target.value)}
            className="bg-gray-800/80 text-white border border-gray-700/50 rounded-lg px-2 py-1.5 text-xs">
            <option value="">All Accounts</option>
            {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <select value={filterMonth} onChange={e => setFilterMonth(e.target.value)}
            className="bg-gray-800/80 text-white border border-gray-700/50 rounded-lg px-2 py-1.5 text-xs">
            <option value="">All Months</option>
            {months.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
            className="bg-gray-800/80 text-white border border-gray-700/50 rounded-lg px-2 py-1.5 text-xs">
            <option value="all">All Positions</option>
            <option value="open">Open</option>
            <option value="closed">Closed</option>
          </select>
          <div className="text-[10px] text-gray-500 flex items-center justify-end">
            {filteredTxns.length} trades
          </div>
        </div>
      </div>

      {summary && (
        <div className="rounded-xl bg-gray-900/60 border border-gray-800/50 p-4">
          <div className="grid grid-cols-4 gap-3">
            <div>
              <p className="text-[10px] text-gray-500">Realized P&L</p>
              <p className={`text-base sm:text-lg font-bold ${summary.totalRealizedPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {summary.totalRealizedPnl >= 0 ? '+' : ''}₹{formatIndian(summary.totalRealizedPnl)}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-gray-500">Open Long</p>
              <p className="text-base sm:text-lg font-bold text-white">{summary.openLongQty}</p>
            </div>
            <div>
              <p className="text-[10px] text-gray-500">Open Short</p>
              <p className="text-base sm:text-lg font-bold text-yellow-400">{summary.openShortQty}</p>
            </div>
            <div>
              <p className="text-[10px] text-gray-500">Symbols</p>
              <p className="text-base sm:text-lg font-bold text-white">{displayData.length}</p>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {displayData.map(r => {
          const totalPnl = r.lotRecords.reduce((s, lot) => s + lot.closes.reduce((s2, c) => s2 + c.pnl, 0), 0)
          const parsed = parseFoOptionSymbol(r.symbol)
          return (
            <div key={r.symbol} className="rounded-xl bg-gray-900/60 border border-gray-800/50 overflow-hidden">
              <div className="flex justify-between items-center p-3 bg-gray-800/30 cursor-pointer">
                <div>
                  <p className="font-semibold text-sm text-white">{r.symbol}</p>
                  {parsed && (
                    <p className="text-[10px] text-gray-500">
                      {parsed.underlying} {parsed.month} {parsed.year} Strike {parsed.strike} {parsed.type}
                    </p>
                  )}
                </div>
                <div className="text-right">
                  <p className={`font-bold text-sm ${r.realizedPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {r.realizedPnl >= 0 ? '+' : ''}₹{formatIndian(r.realizedPnl)}
                  </p>
                  {r.netQty !== 0 && (
                    <p className="text-[10px] text-yellow-400">
                      Open {r.netQty > 0 ? 'Long' : 'Short'} {formatIndian(Math.abs(r.netQty))}
                    </p>
                  )}
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-gray-300">
                  <thead>
                    <tr className="text-gray-500 uppercase tracking-wider border-t border-gray-800/50">
                      <th className="text-left py-1.5 px-3">Leg</th>
                      <th className="text-left py-1.5 px-2">Date</th>
                      <th className="text-right py-1.5 px-2">Type</th>
                      <th className="text-right py-1.5 px-2">Qty</th>
                      <th className="text-right py-1.5 px-2">Price</th>
                      <th className="text-right py-1.5 px-2">Value</th>
                      <th className="text-right py-1.5 px-3">P&L</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.lotRecords.filter(lot => lot.openQty > 0).map((lot, li) => (
                      <>
                        <tr key={`open-${li}`} className="border-t border-gray-800/30">
                          <td className="py-1.5 px-3 text-gray-500">{lot.type === 'short' ? 'Short' : 'Long'}</td>
                          <td className="py-1.5 px-2 text-gray-400">{lot.openDate}</td>
                          <td className="text-right py-1.5 px-2">{lot.type === 'short' ? 'Sell' : 'Buy'}</td>
                          <td className="text-right py-1.5 px-2">{formatIndian(lot.openQty)}</td>
                          <td className="text-right py-1.5 px-2">{formatIndian(lot.openPrice)}</td>
                          <td className="text-right py-1.5 px-2">{formatIndian(Math.round(lot.openQty * lot.openPrice))}</td>
                          <td className="text-right py-1.5 px-3 text-gray-600">--</td>
                        </tr>
                        {lot.closes.map((c, ci) => (
                          <tr key={`close-${li}-${ci}`} className="border-t border-gray-800/20">
                            <td className="py-1.5 px-3 text-gray-600">{lot.type === 'short' ? 'Cover' : 'Exit'}</td>
                            <td className="py-1.5 px-2 text-gray-400">{c.date}</td>
                            <td className="text-right py-1.5 px-2">{lot.type === 'short' ? 'Buy' : 'Sell'}</td>
                            <td className="text-right py-1.5 px-2">{formatIndian(c.qty)}</td>
                            <td className="text-right py-1.5 px-2">{formatIndian(c.price)}</td>
                            <td className="text-right py-1.5 px-2">{formatIndian(Math.round(c.qty * c.price))}</td>
                            <td className={`text-right py-1.5 px-3 font-medium ${c.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                              {c.pnl >= 0 ? '+' : ''}{formatIndian(c.pnl)}
                            </td>
                          </tr>
                        ))}
                        {lot.remainingQty !== 0 && (
                          <tr key={`rem-${li}`} className="border-t border-gray-800/20">
                            <td className="py-1.5 px-3 text-gray-600">--</td>
                            <td className="py-1.5 px-2 text-gray-500" colSpan={2}>Open</td>
                            <td className="text-right py-1.5 px-2">{formatIndian(Math.abs(lot.remainingQty))}</td>
                            <td className="text-right py-1.5 px-2">{formatIndian(lot.openPrice)}</td>
                            <td className="text-right py-1.5 px-2">{formatIndian(Math.round(Math.abs(lot.remainingQty) * lot.openPrice))}</td>
                            <td className="text-right py-1.5 px-3 text-gray-600">--</td>
                          </tr>
                        )}
                      </>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="text-gray-300 font-medium border-t border-gray-700/50">
                      <td className="py-1.5 px-3" colSpan={6}>Total P&L</td>
                      <td className={`text-right py-1.5 px-3 font-semibold ${r.realizedPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {r.realizedPnl >= 0 ? '+' : ''}₹{formatIndian(r.realizedPnl)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )
        })}
        {displayData.length === 0 && (
          <p className="text-gray-500 text-center py-10 text-sm">
            {foTxns.length === 0 ? 'No F&O trades found. Upload a CSV to get started.' : 'No trades match the current filters.'}
          </p>
        )}
      </div>
    </div>
  )
}
