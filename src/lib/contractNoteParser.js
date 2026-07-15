import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
GlobalWorkerOptions.workerSrc = workerUrl

function parsePdfDate(val) {
  const parts = val.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (!parts) return null
  let a = parseInt(parts[1], 10), b = parseInt(parts[2], 10), y = parts[3]
  if (a > 12) return `${y}-${String(b).padStart(2, '0')}-${String(a).padStart(2, '0')}`
  if (b > 12) return `${y}-${String(a).padStart(2, '0')}-${String(b).padStart(2, '0')}`
  return `${y}-${String(a).padStart(2, '0')}-${String(b).padStart(2, '0')}`
}

function extractLines(textContent) {
  const items = textContent.items
  const threshold = 4
  const sorted = [...items].sort((a, b) => {
    const yd = b.transform[5] - a.transform[5]
    if (Math.abs(yd) > threshold) return yd
    return a.transform[4] - b.transform[4]
  })
  const lines = []
  let cur = []
  let curY = null
  for (const item of sorted) {
    const y = Math.round(item.transform[5])
    if (curY === null) curY = y
    if (Math.abs(y - curY) > threshold) {
      lines.push(cur.map(i => i.str).join(''))
      cur = [item]
      curY = y
    } else {
      cur.push(item)
    }
  }
  if (cur.length) lines.push(cur.map(i => i.str).join(''))
  return lines
}

export async function parseContractNotePdf(arrayBuffer) {
  const pdf = await getDocument({ data: arrayBuffer }).promise
  const syntheticTxns = []
  let currentTradeDate = null

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const textContent = await page.getTextContent()
    const lines = extractLines(textContent)

    for (let li = 0; li < lines.length; li++) {
      const line = lines[li]

      // Track trade date from header pages
      const td = line.match(/Trade Date:\s*(\d{2}\/\d{2}\/\d{4})/)
      if (td) currentTradeDate = parsePdfDate(td[1])

      // Look for derivatives data rows in Annexure A
      // Pattern: space-separated with OrderNo at start and B/S near the end
      // Synthetic entries have OrderNo = 111111, price = 0.00
      if (line.startsWith('111111') && /\d{2}:\d{2}:\d{2}/.test(line)) {
        const parts = line.trim().split(/\s+/)
        if (parts.length < 12) continue

        // parts[0]=orderNo, [1]=orderTime, [2]=tradeNo, [3]=tradeTime
        // The contract description can include spaces (like "30 March 2026" on next line)
        // Find B/S position - it's either part[7] (with expiry day) or part[6] (without)
        let bsIdx = -1
        let symbol = ''
        for (let j = 4; j < parts.length; j++) {
          if (parts[j] === 'B' || parts[j] === 'S') {
            // Check if previous parts contain the symbol
            const descParts = parts.slice(4, j)
            symbol = descParts[0].replace(/\/.*$/, '').trim()
            if (!symbol) symbol = descParts[0]
            // Also check for -AF suffix (skip those)
            if (symbol.includes('-AF') || symbol.includes('-EQ')) { bsIdx = -2; break }
            bsIdx = j
            break
          }
        }
        if (bsIdx < 0) continue

        const bs = parts[bsIdx]
        const qty = parseInt(parts[bsIdx + 2], 10)
        const netRate = parseFloat(parts[bsIdx + 4])
        const netTotalRaw = parts[bsIdx + 5]

        if (!symbol || !qty || qty <= 0) continue

        // Determine expiry date:
        // Check next line for month/year pattern ("March 2026")
        let expiryDate = currentTradeDate
        if (li + 1 < lines.length) {
          const nextLine = lines[li + 1].trim()
          const monthMatch = nextLine.match(/(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})/i)
          if (monthMatch) {
            const monthMap = { january: '01', february: '02', march: '03', april: '04', may: '05', june: '06', july: '07', august: '08', september: '09', october: '10', november: '11', december: '12' }
            const mon = monthMap[monthMatch[1].toLowerCase()]
            const yr = monthMatch[2]
            // Extract expiry day from the desc
            const dayMatch = symbol.match(/(\d{2})(CE|PE|FUT)$/i) || symbol.match(/\/\s*(\d+)/)
            if (!dayMatch) continue
            const day = dayMatch[1].length === 2 ? dayMatch[1] : dayMatch[1].padStart(2, '0')
            expiryDate = `${yr}-${mon}-${day}`
          }
        }

        syntheticTxns.push({
          symbol: symbol.toUpperCase(),
          type: bs === 'B' ? 'buy' : 'sell',
          qty,
          price: netRate || 0,
          date: currentTradeDate,
          expiry_date: expiryDate || currentTradeDate,
          trade_id: `SYNTH-${symbol}-${currentTradeDate}`,
          order_id: null,
          order_execution_time: null,
          exchange: 'NSE',
          isin: null,
          is_synthetic: true,
        })
      }
    }
  }

  return syntheticTxns
}
