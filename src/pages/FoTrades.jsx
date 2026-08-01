import { useState, useEffect, useMemo, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { parseFoCsv } from '../lib/foCsvParser'
import { parseContractNotePdf } from '../lib/contractNoteParser'
import { calculateFoPnl, calculateFoSummary, parseFoOptionSymbol } from '../lib/foPnlCalc'
import { formatIndian } from '../lib/format'
import { fetchFoPrices } from '../lib/foPriceFeed'

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
  const [foLivePrices, setFoLivePrices] = useState({})
  const [liveLoading, setLiveLoading] = useState(false)

  // Contract note PDF
  const pdfRef = useRef()
  const [pdfAccountId, setPdfAccountId] = useState('')
  const [pdfParsed, setPdfParsed] = useState(null)
  const [pdfParsing, setPdfParsing] = useState(false)
  const [pdfStatus, setPdfStatus] = useState(null)
  const [pdfInserting, setPdfInserting] = useState(false)

  // Filters
  const [filterAccount, setFilterAccount] = useState('')
  const [filterMonth, setFilterMonth] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')
  
  // Table sorting and filtering
  const [sortBy, setSortBy] = useState('realizedPnl')
  const [sortAsc, setSortAsc] = useState(false)
  const [activeFilterCol, setActiveFilterCol] = useState(null)
  const [filterText, setFilterText] = useState('')
  const [columnFilters, setColumnFilters] = useState({})

  useEffect(() => {
    if (!supabase) return
    Promise.all([
      supabase.from('fo_transactions').select('*').order('date', { ascending: false }),
      supabase.from('accounts').select('id, name'),
    ]).then(([txnRes, acctRes]) => {
      if (txnRes.data) { setFoTxns(txnRes.data); computePnl(txnRes.data) }
      if (acctRes.data) setAccounts(acctRes.data)
      setLoading(false)
    })
  }, [])

  function computePnl(txns) {
    setTimeout(() => {
      const result = calculateFoPnl(txns)
      setAllPnl(result)
      setAllSummary(calculateFoSummary(result))
      setPnlData(result)
      setSummary(calculateFoSummary(result))
    }, 50)
  }

  // Fetch live option prices for open positions
  useEffect(() => {
    const openSymbols = allPnl.filter(r => r.netQty !== 0).map(r => r.symbol)
    if (!openSymbols.length) return
    const doFetch = () => {
      setLiveLoading(true)
      fetchFoPrices(openSymbols).then(prices => {
        setFoLivePrices(prices)
        setLiveLoading(false)
      })
    }
    doFetch()
    const interval = setInterval(doFetch, 60000)
    return () => clearInterval(interval)
  }, [allPnl])

  // Extract distinct months for filter (from expiry dates, not trade dates)
  const months = useMemo(() => {
    const m = new Set()
    for (const t of foTxns) {
      if (t.expiry_date) m.add(t.expiry_date.substring(0, 7))
    }
    return [...m].sort().reverse()
  }, [foTxns])

  // Apply filters
  const filteredTxns = useMemo(() => {
    let txns = foTxns
    if (filterAccount) txns = txns.filter(t => Number(t.account_id) === Number(filterAccount))
    if (filterMonth) txns = txns.filter(t => t.expiry_date && t.expiry_date.startsWith(filterMonth))
    return txns
  }, [foTxns, filterAccount, filterMonth])

  // Chunked PnL calculation to avoid blocking UI
  useEffect(() => {
    if (!foTxns.length) return
    
    // Calculate in chunks to allow UI to render between calculations
    let result = calculateFoPnl(filteredTxns)
    setPnlData(result)
    
    // Use setTimeout to defer summary calculation
    setTimeout(() => {
      setSummary(calculateFoSummary(result))
    }, 0)
  }, [filteredTxns])

  // Helper to calculate avg buy/sell prices from lot records
  function calculateBuySellPrices(record) {
    let totalBuyQty = 0, totalBuyValue = 0, totalSellQty = 0, totalSellValue = 0
    for (const lot of record.lotRecords) {
      if (lot.type === 'long') {
        totalBuyQty += lot.openQty
        totalBuyValue += lot.openQty * lot.openPrice
        for (const close of lot.closes) {
          totalSellQty += close.qty
          totalSellValue += close.qty * close.price
        }
      } else if (lot.type === 'short') {
        totalSellQty += lot.openQty
        totalSellValue += lot.openQty * lot.openPrice
        for (const close of lot.closes) {
          totalBuyQty += close.qty
          totalBuyValue += close.qty * close.price
        }
      }
    }
    return {
      avgBuyPrice: totalBuyQty > 0 ? Math.round(totalBuyValue / totalBuyQty) : 0,
      avgSellPrice: totalSellQty > 0 ? Math.round(totalSellValue / totalSellQty) : 0
    }
  }

  // Apply status filter and column filters, then sort
  const displayData = useMemo(() => {
    let data = pnlData.map(r => ({
      ...r,
      ...calculateBuySellPrices(r),
      ltp: foLivePrices[r.symbol] ?? null,
    }))
    // Compute unrealized P&L for open positions
    data = data.map(r => {
      if (r.netQty === 0 || r.ltp == null) return { ...r, unrealizedPnl: null }
      // netQty > 0 = long: profit when LTP > avg buy price
      // netQty < 0 = short: profit when LTP < avg sell price
      const openPrice = r.netQty > 0 ? r.avgBuyPrice : r.avgSellPrice
      const unrealizedPnl = r.netQty > 0
        ? (r.ltp - openPrice) * Math.abs(r.netQty)
        : (openPrice - r.ltp) * Math.abs(r.netQty)
      return { ...r, unrealizedPnl: Math.round(unrealizedPnl * 100) / 100 }
    })
    
    if (filterStatus === 'open') data = data.filter(r => r.netQty !== 0)
    else if (filterStatus === 'closed') data = data.filter(r => r.netQty === 0)
    
    if (columnFilters.symbol) {
      data = data.filter(r => r.symbol.toUpperCase().includes(columnFilters.symbol.toUpperCase()))
    }
    if (columnFilters.underlying) {
      data = data.filter(r => {
        const parsed = parseFoOptionSymbol(r.symbol)
        return parsed?.underlying?.toUpperCase().includes(columnFilters.underlying.toUpperCase())
      })
    }
    if (columnFilters.pnl) {
      data = data.filter(r => {
        const pnlStr = r.realizedPnl >= 0 ? `+${r.realizedPnl}` : `${r.realizedPnl}`
        return pnlStr.includes(columnFilters.pnl)
      })
    }
    
    data.sort((a, b) => {
      let aVal, bVal
      switch(sortBy) {
        case 'symbol': aVal = a.symbol; bVal = b.symbol; break
        case 'qty': aVal = Math.abs(a.netQty); bVal = Math.abs(b.netQty); break
        case 'buyPrice': aVal = a.avgBuyPrice; bVal = b.avgBuyPrice; break
        case 'sellPrice': aVal = a.avgSellPrice; bVal = b.avgSellPrice; break
        case 'pnl': aVal = a.realizedPnl; bVal = b.realizedPnl; break
        case 'unrealized': aVal = a.unrealizedPnl ?? -Infinity; bVal = b.unrealizedPnl ?? -Infinity; break
        case 'status': aVal = a.netQty !== 0 ? 1 : 0; bVal = b.netQty !== 0 ? 1 : 0; break
        default: aVal = a.realizedPnl; bVal = b.realizedPnl
      }
      if (typeof aVal === 'string') {
        return sortAsc ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal)
      }
      return sortAsc ? aVal - bVal : bVal - aVal
    })
    
    return data
  }, [pnlData, filterStatus, sortBy, sortAsc, columnFilters, foLivePrices])

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

      // Dedup by trade_id first (if available)
      const tradeIds = rows.map(r => r.trade_id).filter(Boolean)
      let skipped = 0
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
        const originalLength = rows.length
        rows = rows.filter(r => !r.trade_id || !existingIds.has(r.trade_id))
        skipped = originalLength - rows.length
      }

      // Dedup by fingerprint (date + symbol + type + qty + price) for records without trade_id
      const withoutTradeId = rows.filter(r => !r.trade_id)
      if (withoutTradeId.length) {
        const fingerprints = new Set()
        let q = supabase.from('fo_transactions').select('date, symbol, type, qty, price')
        if (acct) q = q.eq('account_id', acct); else q = q.is('account_id', null)
        const { data: existing } = await q
        
        if (existing) {
          existing.forEach(r => {
            const fp = `${r.date}|${r.symbol}|${r.type}|${r.qty}|${r.price}`
            fingerprints.add(fp)
          })
        }

        const originalLength = rows.length
        rows = rows.filter(r => {
          if (r.trade_id) return true
          const fp = `${r.date}|${r.symbol}|${r.type}|${r.qty}|${r.price}`
          return !fingerprints.has(fp)
        })
        skipped += originalLength - rows.length
      }

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

  const handlePdfSelect = async (e) => {
    const file = pdfRef.current?.files?.[0]
    if (!file) return
    setPdfStatus(null)
    setPdfParsed(null)
    setPdfParsing('Reading PDF...')
    try {
      const buf = await file.arrayBuffer()
      setPdfParsing('Parsing pages...')
      const result = await parseContractNotePdf(buf, (current, total) => {
        setPdfParsing(`Parsing page ${current}/${total}...`)
      })
      setPdfParsed(result)
      setPdfParsing(false)
    } catch (err) {
      setPdfStatus({ type: 'error', msg: `PDF parse failed: ${err.message}` })
      setPdfParsing(false)
    }
  }

  const handleInsertSynthetic = async () => {
    if (!supabase) {
      setPdfStatus({ type: 'error', msg: 'Supabase not initialized' })
      return
    }
    if (!pdfParsed || !pdfParsed.length) {
      setPdfStatus({ type: 'error', msg: 'No PDF records found. Please parse a PDF first.' })
      return
    }
    setPdfInserting(true)
    setPdfStatus({ type: 'info', msg: 'Checking duplicates...' })
    try {
      let rows = pdfParsed.map(r => {
        const { is_synthetic, ...rest } = r
        return {
          ...rest,
          account_id: pdfAccountId || null,
          source_file: 'contract_note.pdf',
        }
      })
      const acct = pdfAccountId || null

      // Dedup by trade_id (synthetic IDs are deterministic)
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

      const skipped = pdfParsed.length - rows.length
      if (!rows.length) {
        setPdfStatus({ type: 'warn', msg: 'All synthetic entries already exist' })
        setPdfInserting(false)
        return
      }

      setPdfStatus({ type: 'info', msg: `Inserting ${rows.length} synthetic closes...` })
      const batchSize = 500
      let inserted = []
      for (let i = 0; i < rows.length; i += batchSize) {
        const batch = rows.slice(i, i + batchSize)
        const { data, error } = await supabase.from('fo_transactions').insert(batch).select()
        if (error) throw new Error(error.message)
        if (data) inserted.push(...data)
      }

      const allTxns = [...inserted, ...foTxns]
      setFoTxns(allTxns)
      computePnl(allTxns)
      
      const lines = [`✓ Inserted ${inserted.length} synthetic expiry closes`]
      if (skipped > 0) lines.push(`↻ Skipped ${skipped} existing`)
      setPdfStatus({ type: 'success', msg: lines.join('\n') })
      setPdfParsed(null)
      pdfRef.current.value = ''
    } catch (err) {
      setPdfStatus({ type: 'error', msg: `Insert failed: ${err.message}` })
    }
    setPdfInserting(false)
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

      <div className="rounded-xl bg-gray-900/60 border border-gray-800/50 p-4">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Upload Contract Note PDF (Zerodha)</p>
        <div className="flex gap-2 mb-3">
          <select value={pdfAccountId} onChange={(e) => setPdfAccountId(e.target.value)}
            className="bg-gray-800/80 text-white border border-gray-700/50 rounded-lg px-3 py-2 text-sm flex-1">
            <option value="">Select account</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
        <input ref={pdfRef} type="file" accept=".pdf" onChange={handlePdfSelect}
          className="text-sm text-gray-400 file:mr-3 file:bg-purple-600 file:hover:bg-purple-500 file:text-white file:border-0 file:rounded-lg file:px-3 file:py-2 file:text-sm file:font-medium" />
        {pdfParsing && <p className="text-xs text-yellow-400 mt-3">Parsing PDF ({pdfParsing})...</p>}
        {pdfStatus && (
          <div className={`mt-3 text-sm whitespace-pre-line ${pdfStatus.type === 'success' ? 'text-green-400' : pdfStatus.type === 'error' ? 'text-red-400' : 'text-yellow-400'}`}>{pdfStatus.msg}</div>
        )}
        {pdfParsed && (
          <div className="mt-3 space-y-2">
            <p className="text-xs text-gray-500">Found {pdfParsed.length} synthetic expiry entries</p>
            {pdfParsed.length > 0 && (
              <>
                <div className="max-h-40 overflow-y-auto space-y-1 rounded-xl bg-gray-800/50 p-2">
                  {pdfParsed.slice(0, 10).map((r, i) => (
                    <div key={i} className="text-xs flex gap-3 text-gray-300">
                      <span className="w-20 text-gray-500">{r.date}</span>
                      <span className="w-8 text-gray-500">{r.type.toUpperCase()}</span>
                      <span className="w-28 font-semibold text-white truncate">{r.symbol}</span>
                      <span className="w-12 text-right">{formatIndian(r.qty)}</span>
                      <span className="w-16 text-right">@{formatIndian(r.price)}</span>
                      <span className="w-20 text-gray-500">exp {r.expiry_date}</span>
                    </div>
                  ))}
                  {pdfParsed.length > 10 && <p className="text-xs text-gray-600">...and {pdfParsed.length - 10} more</p>}
                </div>
                <button onClick={handleInsertSynthetic} disabled={pdfInserting}
                  className="bg-purple-600 hover:bg-purple-500 text-white px-4 py-2 rounded-lg text-sm font-medium w-full">
                  {pdfInserting ? 'Inserting...' : `Insert ${pdfParsed.length} synthetic closes`}
                </button>
              </>
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
        <div className="rounded-xl bg-gray-900/60 border border-gray-800/50 p-4 space-y-3">
          {/* Row 1: P&L + qty */}
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
          {/* Row 2: Premium breakdown */}
          <div className="grid grid-cols-3 gap-3 pt-3 border-t border-gray-800/60">
            <div>
              <p className="text-[10px] text-gray-500">Net Open Premium</p>
              <p className={`text-base sm:text-lg font-bold ${summary.totalOpenPremium >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {summary.totalOpenPremium >= 0 ? '+' : ''}₹{formatIndian(summary.totalOpenPremium)}
              </p>
              <p className="text-[9px] text-gray-600 mt-0.5">{summary.totalOpenPremium >= 0 ? 'Net seller' : 'Net buyer'}</p>
            </div>
            <div>
              <p className="text-[10px] text-gray-500">Collected (Short)</p>
              <p className="text-base sm:text-lg font-bold text-emerald-400">₹{formatIndian(summary.totalPremiumCollected)}</p>
            </div>
            <div>
              <p className="text-[10px] text-gray-500">Paid (Long)</p>
              <p className="text-base sm:text-lg font-bold text-red-400">₹{formatIndian(summary.totalPremiumPaid)}</p>
            </div>
          </div>
          {/* Row 3: Live unrealized P&L (if prices available) */}
          {Object.keys(foLivePrices).length > 0 && (() => {
            const totalUnrealized = displayData.reduce((s, r) => s + (r.unrealizedPnl ?? 0), 0)
            return (
              <div className="pt-3 border-t border-gray-800/60 flex items-center gap-2">
                <div>
                  <p className="text-[10px] text-gray-500 flex items-center gap-1">
                    Unrealized P&L (Live)
                    {liveLoading && <span className="inline-block w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" />}
                  </p>
                  <p className={`text-base sm:text-lg font-bold ${totalUnrealized >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {totalUnrealized >= 0 ? '+' : ''}₹{formatIndian(Math.round(totalUnrealized))}
                  </p>
                </div>
              </div>
            )
          })()}
        </div>
      )}

      {displayData.length > 0 && (
       <div className="text-xs text-gray-500 mb-2">
         Showing {displayData.length} symbol{displayData.length !== 1 ? 's' : ''}
       </div>
      )}

      {/* Simple Table View */}
      <div className="rounded-xl bg-gray-900/60 border border-gray-800/50 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-800/50 text-gray-300 border-b border-gray-700">
              {/* Symbol */}
              <th 
                onClick={() => { setSortBy('symbol'); setSortAsc(!sortAsc) }}
                className="text-left py-3 px-4 cursor-pointer hover:bg-gray-700/50 transition"
              >
                <div className="flex items-center gap-1">
                  <span>Symbol {sortBy === 'symbol' && (sortAsc ? '▲' : '▼')}</span>
                </div>
                {activeFilterCol === 'symbol' && (
                  <input
                    type="text"
                    placeholder="Filter..."
                    value={columnFilters.symbol || ''}
                    onChange={(e) => setColumnFilters({...columnFilters, symbol: e.target.value})}
                    onClick={(e) => e.stopPropagation()}
                    className="w-full mt-1 px-2 py-1 text-xs bg-gray-700 text-white rounded border border-gray-600"
                    autoFocus
                  />
                )}
              </th>
              
              {/* Underlying */}
              <th 
                onClick={() => { setSortBy('underlying'); setSortAsc(!sortAsc) }}
                className="text-left py-3 px-4 cursor-pointer hover:bg-gray-700/50 transition"
              >
                <div className="flex items-center gap-1">
                  <span>Underlying</span>
                </div>
                {activeFilterCol === 'underlying' && (
                  <input
                    type="text"
                    placeholder="Filter..."
                    value={columnFilters.underlying || ''}
                    onChange={(e) => setColumnFilters({...columnFilters, underlying: e.target.value})}
                    onClick={(e) => e.stopPropagation()}
                    className="w-full mt-1 px-2 py-1 text-xs bg-gray-700 text-white rounded border border-gray-600"
                    autoFocus
                  />
                )}
              </th>
              
              {/* Expiry */}
              <th className="text-center py-3 px-4">Expiry</th>
              
              {/* Strike */}
              <th className="text-right py-3 px-4">Strike</th>
              
              {/* Type */}
              <th className="text-center py-3 px-4">Type</th>
              
              {/* Open Qty */}
              <th 
                onClick={() => { setSortBy('qty'); setSortAsc(!sortAsc) }}
                className="text-right py-3 px-4 cursor-pointer hover:bg-gray-700/50 transition"
              >
                <span>Open Qty {sortBy === 'qty' && (sortAsc ? '▲' : '▼')}</span>
              </th>
              
              {/* Buy Price */}
              <th 
                onClick={() => { setSortBy('buyPrice'); setSortAsc(!sortAsc) }}
                className="text-right py-3 px-4 cursor-pointer hover:bg-gray-700/50 transition"
              >
                <span>Buy Price {sortBy === 'buyPrice' && (sortAsc ? '▲' : '▼')}</span>
              </th>
              
              {/* Sell Price */}
              <th 
                onClick={() => { setSortBy('sellPrice'); setSortAsc(!sortAsc) }}
                className="text-right py-3 px-4 cursor-pointer hover:bg-gray-700/50 transition"
              >
                <span>Sell Price {sortBy === 'sellPrice' && (sortAsc ? '▲' : '▼')}</span>
              </th>
              
              {/* P&L */}
              <th 
                onClick={() => { setSortBy('pnl'); setSortAsc(!sortAsc) }}
                className="text-right py-3 px-4 cursor-pointer hover:bg-gray-700/50 transition"
              >
                <div className="flex items-center gap-1 justify-end">
                  <span>Realized P&L {sortBy === 'pnl' && (sortAsc ? '▲' : '▼')}</span>
                </div>
              </th>
              
              {/* LTP */}
              <th className="text-right py-3 px-4">LTP</th>

              {/* Unrealized P&L */}
              <th
                onClick={() => { setSortBy('unrealized'); setSortAsc(!sortAsc) }}
                className="text-right py-3 px-4 cursor-pointer hover:bg-gray-700/50 transition"
              >
                <span>Unreal. P&L {sortBy === 'unrealized' && (sortAsc ? '▲' : '▼')}</span>
              </th>
              
              {/* Open Premium */}
              <th className="text-right py-3 px-4">Open Premium</th>
              
              {/* Status */}
              <th 
                onClick={() => { setSortBy('status'); setSortAsc(!sortAsc) }}
                className="text-right py-3 px-4 cursor-pointer hover:bg-gray-700/50 transition"
              >
                <span>Status {sortBy === 'status' && (sortAsc ? '▲' : '▼')}</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-700/50">
            {displayData.map((r) => {
              const parsed = parseFoOptionSymbol(r.symbol)
              const isOpen = r.netQty !== 0
               
              return (
                <tr key={r.symbol} className="hover:bg-gray-800/30 transition">
                  <td className="py-2 px-4 font-mono text-white">{r.symbol}</td>
                  <td className="py-2 px-4 text-gray-400">{parsed?.underlying || '--'}</td>
                  <td className="py-2 px-4 text-center text-gray-400">
                    {parsed?.year && parsed?.month ? `${parsed.month}-${parsed.year}` : '--'}
                  </td>
                  <td className="py-2 px-4 text-right text-gray-400">{parsed?.strike || '--'}</td>
                  <td className="py-2 px-4 text-center">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                      parsed?.type === 'CE' ? 'bg-blue-900/40 text-blue-300' : 'bg-red-900/40 text-red-300'
                    }`}>
                      {parsed?.type || '--'}
                    </span>
                  </td>
                  <td className={`py-2 px-4 text-right font-medium ${
                    r.netQty > 0 ? 'text-green-400' : r.netQty < 0 ? 'text-red-400' : 'text-gray-400'
                  }`}>
                    {r.netQty !== 0 ? formatIndian(Math.abs(r.netQty)) : '--'}
                  </td>
                  <td className="py-2 px-4 text-right text-gray-400">
                    {r.avgBuyPrice > 0 ? `₹${formatIndian(r.avgBuyPrice)}` : '--'}
                  </td>
                  <td className="py-2 px-4 text-right text-gray-400">
                    {r.avgSellPrice > 0 ? `₹${formatIndian(r.avgSellPrice)}` : '--'}
                  </td>
                  <td className={`py-2 px-4 text-right font-semibold ${
                    r.realizedPnl >= 0 ? 'text-emerald-400' : 'text-red-400'
                  }`}>
                    {r.realizedPnl >= 0 ? '+' : ''}₹{formatIndian(r.realizedPnl)}
                  </td>
                  {/* LTP */}
                  <td className="py-2 px-4 text-right text-white">
                    {isOpen && r.ltp != null
                      ? `₹${formatIndian(r.ltp)}`
                      : <span className="text-gray-600">—</span>}
                  </td>
                  {/* Unrealized P&L */}
                  <td className={`py-2 px-4 text-right font-medium ${
                    r.unrealizedPnl == null ? 'text-gray-600'
                    : r.unrealizedPnl >= 0 ? 'text-emerald-400' : 'text-red-400'
                  }`}>
                    {isOpen && r.unrealizedPnl != null
                      ? `${r.unrealizedPnl >= 0 ? '+' : ''}₹${formatIndian(Math.round(r.unrealizedPnl))}`
                      : <span className="text-gray-600">—</span>}
                  </td>
                  {/* Open Premium */}
                  <td className={`py-2 px-4 text-right text-sm ${
                    !isOpen ? 'text-gray-600'
                    : r.openPremium >= 0 ? 'text-emerald-400' : 'text-red-400'
                  }`}>
                    {isOpen
                      ? `${r.openPremium >= 0 ? '+' : ''}₹${formatIndian(r.openPremium)}`
                      : '—'}
                  </td>
                  <td className="py-2 px-4 text-center">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                      isOpen ? 'bg-yellow-900/40 text-yellow-300' : 'bg-green-900/40 text-green-300'
                    }`}>
                      {isOpen ? 'OPEN' : 'CLOSED'}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        
        {displayData.length === 0 && (
          <div className="text-center py-10 text-gray-500 text-sm">
            {foTxns.length === 0 
              ? 'No F&O trades found. Upload a CSV to get started.'
              : 'No trades match the current filters.'}
          </div>
        )}
      </div>
    </div>
  )
}
