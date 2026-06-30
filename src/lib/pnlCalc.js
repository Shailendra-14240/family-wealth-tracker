// FIFO P&L calculation engine with corporate actions (bonus, split, merger, demerger)

export function calculateHoldings(transactions, corporateActions = []) {
  if (!transactions.length) return []
  const allTxns = [...transactions]
  const mergers = (corporateActions || []).filter(a => a.action === 'merger')
  for (const m of mergers) {
    const mergeDate = new Date(m.date).getTime()
    for (const t of allTxns) {
      if (t.symbol === m.symbol && new Date(t.date).getTime() < mergeDate) {
        t.symbol = m.new_symbol
      }
    }
  }

  const demergerMap = {}
  for (const a of (corporateActions || [])) {
    if (a.action === 'demerger') {
      const key = `${a.date}|${a.symbol}`
      if (!demergerMap[key]) demergerMap[key] = { date: a.date, symbol: a.symbol, children: [] }
      demergerMap[key].children.push(a)
    }
  }
  const demergerEvents = Object.values(demergerMap)

  const demergerTargetSymbols = new Set()
  for (const evt of demergerEvents) {
    for (const child of evt.children) {
      demergerTargetSymbols.add(child.new_symbol)
    }
  }

  const allSymbols = [...new Set([...allTxns.map(t => t.symbol), ...demergerTargetSymbols])]
  const lots = {}
  for (const sym of allSymbols) lots[sym] = []
  let realizedPnl = {}

  const events = buildEvents(allTxns, corporateActions, demergerMap)

  for (const evt of events) {
    const { type, symbol } = evt
    const symLots = lots[symbol] || []

    if (type === 'bonus') {
      const factor = evt.ratio_to / evt.ratio_from
      for (const lot of symLots) lot.qty *= (1 + factor)
    } else if (type === 'split') {
      const factor = evt.ratio_to / evt.ratio_from
      for (const lot of symLots) {
        lot.qty *= factor
        lot.price /= factor
      }
    } else if (type === 'demerger') {
      processDemerger(lots, symbol, evt.children)
    } else if (type === 'buy') {
      symLots.push({ qty: evt.qty, price: evt.price })
    } else if (type === 'sell') {
      let remaining = evt.qty
      if (!realizedPnl[symbol]) realizedPnl[symbol] = 0
      while (remaining > 0 && symLots.length > 0) {
        const lot = symLots[0]
        const matched = Math.min(remaining, lot.qty)
        realizedPnl[symbol] += matched * (evt.price - lot.price)
        lot.qty -= matched
        remaining -= matched
        if (lot.qty === 0) symLots.shift()
      }
    }
  }

  const holdings = []
  for (const symbol of allSymbols) {
    const symLots = lots[symbol] || []
    const currentQty = symLots.reduce((s, l) => s + l.qty, 0)
    if (currentQty <= 0 && !(realizedPnl[symbol])) continue
    const avgCost = currentQty > 0
      ? symLots.reduce((s, l) => s + l.qty * l.price, 0) / currentQty
      : 0
    const invested = currentQty * avgCost
    holdings.push({
      symbol,
      qty: Math.round(currentQty),
      avgCost: Math.round(avgCost * 100) / 100,
      invested: Math.round(invested * 100) / 100,
      realizedPnl: Math.round((realizedPnl[symbol] || 0) * 100) / 100,
    })
  }

  return holdings
}

export function calculateSummary(holdings) {
  const totalInvested = holdings.reduce((s, h) => s + h.invested, 0)
  const totalRealizedPnl = holdings.reduce((s, h) => s + h.realizedPnl, 0)
  return {
    totalInvested: Math.round(totalInvested * 100) / 100,
    totalRealizedPnl: Math.round(totalRealizedPnl * 100) / 100,
  }
}

export function calculateLotWisePnl(transactions, corporateActions = []) {
  if (!transactions.length) return []
  const allTxns = [...transactions]

  const mergers = (corporateActions || []).filter(a => a.action === 'merger')
  for (const m of mergers) {
    const mergeDate = new Date(m.date).getTime()
    for (const t of allTxns) {
      if (t.symbol === m.symbol && new Date(t.date).getTime() < mergeDate) {
        t.symbol = m.new_symbol
      }
    }
  }

  const demergerMap = {}
  for (const a of (corporateActions || [])) {
    if (a.action === 'demerger') {
      const key = `${a.date}|${a.symbol}`
      if (!demergerMap[key]) demergerMap[key] = { date: a.date, symbol: a.symbol, children: [] }
      demergerMap[key].children.push(a)
    }
  }

  const demergerTargetSymbols = new Set()
  for (const evt of Object.values(demergerMap)) {
    for (const child of evt.children) demergerTargetSymbols.add(child.new_symbol)
  }

  const allSymbols = [...new Set([...allTxns.map(t => t.symbol), ...demergerTargetSymbols])]
  const events = buildEvents(allTxns, corporateActions, demergerMap)

  // Global state across all symbols
  const lots = {}
  const lotRecords = {}
  for (const sym of allSymbols) {
    lots[sym] = []
    lotRecords[sym] = []
  }

  for (const evt of events) {
    const { type, symbol } = evt
    const symLots = lots[symbol] || []
    const symRecords = lotRecords[symbol] || []

    if (type === 'bonus') {
      const factor = evt.ratio_to / evt.ratio_from
      for (const lot of symLots) lot.qty *= (1 + factor)
      for (const r of symRecords) {
        r.originalQty = (r.originalQty || r.buyQty) * (1 + factor)
        r.buyQty *= (1 + factor)
      }
    } else if (type === 'split') {
      const factor = evt.ratio_to / evt.ratio_from
      for (const lot of symLots) {
        lot.qty *= factor
        lot.price /= factor
      }
      for (const r of symRecords) {
        r.originalQty = (r.originalQty || r.buyQty) * factor
        r.buyQty *= factor
        r.buyPrice /= factor
      }
    } else if (type === 'demerger') {
      const children = evt.children
      const retainedRatio = Number(children[0].retained_ratio != null ? children[0].retained_ratio : children[0].ratio_from)
      const totalChildRatio = children.reduce((s, c) => s + Number(c.ratio_to), 0)
      const totalRatio = retainedRatio + totalChildRatio
      const oldLots = lots[symbol] || []
      const oldRecords = lotRecords[symbol] || []

      for (let i = 0; i < oldLots.length; i++) {
        const lot = oldLots[i]
        const oldQty = lot.qty
        lot.qty *= retainedRatio / totalRatio

        const rec = oldRecords[i]
        if (rec) rec.buyQty = rec.buyQty * retainedRatio / totalRatio

        for (const child of children) {
          const childQty = oldQty * Number(child.ratio_to) / totalRatio
          if (childQty > 0) {
            if (!lots[child.new_symbol]) {
              lots[child.new_symbol] = []
              lotRecords[child.new_symbol] = []
            }
            lots[child.new_symbol].push({ qty: childQty, price: lot.price, buyDate: lot.buyDate })
            lotRecords[child.new_symbol].push({
              buyDate: lot.buyDate,
              buyQty: childQty,
              buyPrice: lot.price,
              originalQty: childQty,
              sells: [],
              parentSymbol: symbol,
            })
          }
        }
      }
    } else if (type === 'buy') {
      symLots.push({ qty: evt.qty, price: evt.price, buyDate: evt.date })
      symRecords.push({ buyDate: evt.date, buyQty: evt.qty, buyPrice: evt.price, originalQty: evt.qty, sells: [] })
    } else if (type === 'sell') {
      let remaining = evt.qty
      let idx = 0
      while (remaining > 0 && idx < symLots.length) {
        if (symLots[idx].qty === 0) { idx++; continue }
        const lot = symLots[idx]
        const matched = Math.min(remaining, lot.qty)
        const pnl = matched * (evt.price - lot.price)
        symRecords[idx].sells.push({ date: evt.date, qty: matched, price: evt.price, pnl })
        lot.qty -= matched
        remaining -= matched
      }
      for (let i = 0; i < symLots.length; i++) {
        symRecords[i].remainingQty = symLots[i].qty
      }
    }
  }

  return allSymbols
    .map(symbol => {
      const records = lotRecords[symbol] || []
      if (records.length === 0) return null
      return {
        symbol,
        lots: records.map(r => ({
          buyDate: r.buyDate,
          buyQty: r.buyQty,
          buyPrice: r.buyPrice,
          originalQty: r.originalQty,
          sells: r.sells,
          remainingQty: r.remainingQty != null ? r.remainingQty : r.buyQty,
          sellTotalPnl: r.sells.reduce((s, s2) => s + s2.pnl, 0),
        })),
      }
    })
    .filter(Boolean)
}

// Shared helpers

function buildEvents(allTxns, corporateActions, demergerMap) {
  const events = []
  for (const t of allTxns) {
    events.push({ type: t.type, date: t.date, symbol: t.symbol, qty: Number(t.qty), price: Number(t.price) })
  }
  const processed = new Set()
  for (const a of (corporateActions || [])) {
    if (a.action === 'merger') continue
    if (a.action === 'demerger') {
      const key = `${a.date}|${a.symbol}`
      if (demergerMap[key] && !processed.has(key)) {
        events.push({ type: 'demerger', date: a.date, symbol: a.symbol, children: demergerMap[key].children })
        processed.add(key)
      }
      continue
    }
    events.push({ type: a.action, date: a.date, symbol: a.symbol, ratio_from: Number(a.ratio_from), ratio_to: Number(a.ratio_to) })
  }
  events.sort((a, b) => new Date(a.date) - new Date(b.date))
  return events
}

function processDemerger(lots, symbol, children) {
  const oldLots = lots[symbol] || []
  const retainedRatio = Number(children[0].retained_ratio != null ? children[0].retained_ratio : children[0].ratio_from)
  const totalChildRatio = children.reduce((s, c) => s + Number(c.ratio_to), 0)
  const totalRatio = retainedRatio + totalChildRatio
  const newLotsToAdd = {}
  for (const child of children) newLotsToAdd[child.new_symbol] = []

  for (const lot of oldLots) {
    const oldQty = lot.qty
    lot.qty *= retainedRatio / totalRatio
    for (const child of children) {
      const childQty = oldQty * Number(child.ratio_to) / totalRatio
      if (childQty > 0) {
        newLotsToAdd[child.new_symbol].push({ qty: childQty, price: lot.price })
      }
    }
  }
  for (const [sym, childLots] of Object.entries(newLotsToAdd)) {
    if (!lots[sym]) lots[sym] = []
    lots[sym].push(...childLots)
  }
}
