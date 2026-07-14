export function calculateFoPnl(transactions) {
  if (!transactions.length) return []

  // Separate by symbol and process chronologically
  const bySymbol = {}
  for (const t of transactions) {
    if (!bySymbol[t.symbol]) bySymbol[t.symbol] = []
    bySymbol[t.symbol].push({
      type: t.type,
      date: t.date,
      qty: Number(t.qty),
      price: Number(t.price),
      _id: t.id,
    })
  }

  // Sort each symbol's transactions by date
  for (const sym of Object.keys(bySymbol)) {
    bySymbol[sym].sort((a, b) => {
      const da = new Date(a.date), db = new Date(b.date)
      if (da - db !== 0) return da - db
      return a.type === 'buy' ? -1 : 1 // buys before sells on same date
    })
  }

  const results = {}

  for (const [symbol, txns] of Object.entries(bySymbol)) {
    const lots = [] // { qty: +/-N, price: N }
    let realizedPnl = 0
    const lotRecords = []

    for (const evt of txns) {
      if (evt.type === 'buy') {
        let remaining = evt.qty

        // Match against short lots first (negative qty)
        while (remaining > 0 && lots.length > 0) {
          const lot = lots[0]
          if (lot.qty >= 0) break // no more short lots
          const shortQty = Math.abs(lot.qty)
          const matched = Math.min(remaining, shortQty)
          // Short: sold at lot.price, buying back at evt.price
          realizedPnl += matched * (lot.price - evt.price)
          lot.qty += matched
          remaining -= matched
          if (lot.qty === 0) {
            lots.shift()
            lotRecords.shift()
          }
        }

        // Remaining becomes a long lot
        if (remaining > 0) {
          lots.push({ qty: remaining, price: evt.price })
          lotRecords.push({
            type: 'long',
            openDate: evt.date,
            openQty: remaining,
            openPrice: evt.price,
            remainingQty: remaining,
            closes: [],
          })
        }
      } else if (evt.type === 'sell') {
        let remaining = evt.qty

        // Match against long lots first (positive qty)
        while (remaining > 0 && lots.length > 0) {
          const lot = lots[0]
          if (lot.qty <= 0) break // no more long lots
          const longQty = lot.qty
          const matched = Math.min(remaining, longQty)
          // Long: bought at lot.price, selling at evt.price
          realizedPnl += matched * (evt.price - lot.price)
          lot.qty -= matched
          remaining -= matched

          // Update lot record
          if (lotRecords.length > 0) {
            lotRecords[0].remainingQty -= matched
            lotRecords[0].closes.push({ date: evt.date, qty: matched, price: evt.price, pnl: matched * (evt.price - lot.price) })
          }

          if (lot.qty === 0) {
            lots.shift()
            lotRecords.shift()
          }
        }

        // Remaining becomes a short lot
        if (remaining > 0) {
          lots.push({ qty: -remaining, price: evt.price })
          lotRecords.push({
            type: 'short',
            openDate: evt.date,
            openQty: remaining,
            openPrice: evt.price,
            remainingQty: -remaining,
            closes: [],
          })
        }
      }
    }

    const netQty = lots.reduce((s, l) => s + l.qty, 0)
    if (netQty !== 0 || realizedPnl !== 0) {
      results[symbol] = {
        symbol,
        netQty,
        realizedPnl: Math.round(realizedPnl * 100) / 100,
        openLots: lots.map((l, i) => ({
          type: l.qty > 0 ? 'long' : 'short',
          qty: l.qty,
          price: l.price,
          openDate: lotRecords[i]?.openDate || '',
        })),
        lotRecords: lotRecords.filter(r => r.closes.length > 0 || r.remainingQty !== 0),
      }
    }
  }

  return Object.values(results)
}

export function calculateFoSummary(results) {
  const totalInvested = 0 // Options don't have cost of carry in the same sense
  const totalRealizedPnl = results.reduce((s, r) => s + r.realizedPnl, 0)
  const shortQty = results.reduce((s, r) => s + Math.max(0, -r.netQty), 0)
  const longQty = results.reduce((s, r) => s + Math.max(0, r.netQty), 0)
  return {
    totalRealizedPnl: Math.round(totalRealizedPnl * 100) / 100,
    totalInvested: Math.round(totalInvested * 100) / 100,
    openShortQty: shortQty,
    openLongQty: longQty,
  }
}

export function parseFoOptionSymbol(symbol) {
  // e.g. ABCAPITAL26JAN400CE, IDFCFIRSTB26JUNFUT, TMPV26FEB400CE
  const match = symbol.match(/^([A-Z]+)(\d{2})([A-Z]{3})(\d+(?:\.\d+)?)(CE|PE|FUT)$/i)
  if (!match) return null
  return {
    underlying: match[1],
    year: '20' + match[2],
    month: match[3].toUpperCase(),
    strike: parseFloat(match[4]),
    type: match[5].toUpperCase(), // CE, PE, or FUT
  }
}
