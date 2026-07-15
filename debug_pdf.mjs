import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist'
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const path = require('path')
GlobalWorkerOptions.workerSrc = path.resolve('node_modules/pdfjs-dist/build/pdf.worker.min.mjs')

import { readFileSync } from 'fs'

const buf = readFileSync('C:\\Users\\shail\\Downloads\\vicky\\FO\\WSM730_2025-03-31_2026-03-30.pdf').buffer
const pdf = await getDocument({ data: buf }).promise
console.log('Pages:', pdf.numPages)

const targets = {
  71: ['BAJFINANCE', '111111'],
  72: ['Trade Date'],
  151: ['111111'],
  152: ['Trade Date'],
  222: ['APOLLOHOSP26MAR7650', '111111'],
  // Also check a few more pages
  35: ['ABCAPITAL', '111111'],
  66: ['111111'],
}

for (const [pi, keywords] of Object.entries(targets)) {
  const page = await pdf.getPage(parseInt(pi))
  const tc = await page.getTextContent()
  
  const items = [...tc.items].sort((a, b) => {
    const yd = b.transform[5] - a.transform[5]
    if (Math.abs(yd) > 4) return yd
    return a.transform[4] - b.transform[4]
  })

  const yMap = new Map()
  for (const item of items) {
    const y = Math.round(item.transform[5])
    if (!yMap.has(y)) yMap.set(y, [])
    yMap.get(y).push(item)
  }
  
  console.log(`\n===== PAGE ${pi} (${items.length} items, ${yMap.size} Y-rows) =====`)

  let lastY = null
  let text = ''
  for (const item of items) {
    const y = Math.round(item.transform[5])
    if (lastY !== null && Math.abs(y - lastY) > 4) { text += '\n' }
    else if (lastY !== null) { text += ' ' }
    text += item.str
    lastY = y
  }

  // Check for trade date
  const td = text.match(/Trade Date:\s*(\d{2}\/\d{2}\/\d{4})/)
  if (td) console.log('Trade Date:', td[1])

  // Print lines with relevant keywords
  const lines = text.split('\n').filter(l => l.trim())
  for (const line of lines) {
    if (keywords.some(k => line.includes(k))) {
      console.log('  >>', line.slice(0, 250))
    }
  }
  
  // Run the regex
  const lineRegex = /^(?:111111\s+\d{2}:\d{2}:\d{2}\s+111111\s+\d{2}:\d{2}:\d{2}\s+)(.+)$/gm
  let m, count = 0
  while ((m = lineRegex.exec(text)) !== null) {
    count++
    const rest = m[1]
    const bsMatch = rest.match(/\s([BS])\s+([A-Z]{2,5})\s+(\d+)\s+([\d.]+)\s+([\d.]+)\s+/)
    if (!bsMatch) {
      console.log('  *** NO BSMATCH for:', rest.slice(0, 120))
      continue
    }
    const beforeBS = rest.slice(0, bsMatch.index).trim()
    const symbol = beforeBS.split(/[\s\/]+/)[0].toUpperCase()
    const filtered = symbol.includes('-AF') || symbol.includes('-EQ') || symbol.includes('-A')
    console.log(`  FOUND#${count}:`, symbol, bsMatch[1], bsMatch[3], `@${bsMatch[5]}`, filtered ? 'FILTERED' : 'OK')
  }
  console.log(`  Total regex matches: ${count}`)
}
