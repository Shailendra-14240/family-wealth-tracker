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

function nextLine(text, from) {
  const nl = text.indexOf('\n', from)
  return nl !== -1 ? nl + 1 : text.length
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

    // Build continuous page text (always space between same-line items)
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

    // Find 111111 synthetic expiry entries
    // Only match at line start to avoid double-matching the TradeNo 111111
    const lineRegex = /^(?:111111\s+\d{2}:\d{2}:\d{2}\s+111111\s+\d{2}:\d{2}:\d{2}\s+)(.+)$/gm
    let m
    while ((m = lineRegex.exec(text)) !== null) {
      const fullLine = m[0]
      const rest = m[1]

      // Find B/S indicator in the rest
      const bsMatch = rest.match(/\s([BS])\s+([A-Z]{2,5})\s+(\d+)\s+([\d.]+)\s+([\d.]+)\s+/)
      if (!bsMatch) continue

      // Symbol is everything before B/S, first token
      const beforeBS = rest.slice(0, bsMatch.index).trim()
      const symbol = beforeBS.split(/[\s\/]+/)[0].toUpperCase()

      if (!symbol || symbol.includes('-AF') || symbol.includes('-EQ') || symbol.includes('-A')) continue

      const bs = bsMatch[1]
      const qty = parseInt(bsMatch[3], 10)
      const netRate = parseFloat(bsMatch[5])

      if (!qty || qty <= 0) continue

      syntheticTxns.push({
        symbol: symbol.toUpperCase(),
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
        is_synthetic: true,
      })
    }
  }

  return syntheticTxns
}
