import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
GlobalWorkerOptions.workerSrc = workerUrl

function parsePdfDate(s) {
  const m = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (!m) return null
  let a = parseInt(m[1], 10), b = parseInt(m[2], 10), y = m[3]
  if (a > 12) return `${y}-${String(b).padStart(2, '0')}-${String(a).padStart(2, '0')}`
  if (b > 12) return `${y}-${String(a).padStart(2, '0')}-${String(b).padStart(2, '0')}`
  return `${y}-${String(a).padStart(2, '0')}-${String(b).padStart(2, '0')}`
}

export async function parseContractNotePdf(arrayBuffer) {
  const pdf = await getDocument({ data: arrayBuffer }).promise
  const syntheticTxns = []
  let currentTradeDate = null

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const tc = await page.getTextContent()

    // Sort items top→bottom, left→right
    const items = [...tc.items].sort((a, b) => {
      const yd = b.transform[5] - a.transform[5]
      if (Math.abs(yd) > 4) return yd
      return a.transform[4] - b.transform[4]
    })

    // Build page text: space between same-row items, newline between rows
    let lastY = null
    let text = ''
    for (const item of items) {
      const y = Math.round(item.transform[5])
      if (lastY !== null && Math.abs(y - lastY) > 4) { text += '\n' }
      else if (lastY !== null) { text += ' ' }
      text += item.str
      lastY = y
    }

    // Track trade date
    const td = text.match(/Trade Date:\s*(\d{2}\/\d{2}\/\d{4})/)
    if (td) currentTradeDate = parsePdfDate(td[1])

    // Find 111111 synthetic entries — use indexOf + context scan (not line-dependent)
    // Pattern: 11111 hh:mm:ss 11111 hh:mm:ss then within ~300 chars find BS EXCH QTY
    let pos = 0
    while (true) {
      pos = text.indexOf('111111', pos)
      if (pos === -1) break

      // Check this is a synthetic entry (followed by time pattern + another 111111 + time)
      const ctx = text.slice(pos, pos + 300)
      const headerMatch = ctx.match(/^111111\s+\d{2}:\d{2}:\d{2}\s+111111\s+\d{2}:\d{2}:\d{2}\s+/)
      if (!headerMatch) { pos += 6; continue }

      const rest = ctx.slice(headerMatch[0].length)

      // In rest, find B/S followed by exchange, qty, brokerage, netRate, netTotal
      // The /expiryDay between symbol and B/S is optional
      const bsMatch = rest.match(/\s([BS])\s+([A-Z]{2,5})\s+(\d+)\s+([\d.]+)\s+([\d.]+)\s/)
      if (!bsMatch) { pos += 6; continue }

      // Symbol = everything before B/S match, strip leading/trailing / numbers etc
      const beforeBS = rest.slice(0, bsMatch.index).trim()
        .replace(/^[\s\/]+|[\s\/]+$/g, '')
      const symbol = beforeBS.split(/[\s\/]+/)[0].toUpperCase()

      // Filter out AF/EQ entries
      if (!symbol || /-[AFEQ]/.test(symbol)) { pos += 6; continue }

      const bs = bsMatch[1]
      const qty = parseInt(bsMatch[3], 10)
      const netRate = parseFloat(bsMatch[5])

      if (!qty || qty <= 0) { pos += 6; continue }

      syntheticTxns.push({
        symbol,
        type: bs === 'B' ? 'buy' : 'sell',
        qty,
        price: netRate || 0,
        date: currentTradeDate,
        expiry_date: currentTradeDate,
        trade_id: `SYNTH-${symbol}-${currentTradeDate || 'unknown'}`,
        order_id: null,
        order_execution_time: null,
        exchange: 'NSE',
        isin: null,
      })

      pos += 6
    }
  }

  return syntheticTxns
}
