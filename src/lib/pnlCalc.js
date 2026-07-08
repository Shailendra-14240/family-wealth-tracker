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
        const factor = Number(m.ratio_to) / Number(m.ratio_from)
        t.qty *= factor
        t.price /= factor
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
      for (const lot of symLots) {
        lot.qty *= (1 + factor)
        lot.price /= (1 + factor)
      }
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
        const factor = Number(m.ratio_to) / Number(m.ratio_from)
        t.qty *= factor
        t.price /= factor
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
      for (const lot of symLots) {
        lot.qty *= (1 + factor)
        lot.price /= (1 + factor)
      }
      for (const r of symRecords) {
        r.originalQty = (r.originalQty || r.buyQty) * (1 + factor)
        r.buyQty *= (1 + factor)
        r.buyPrice /= (1 + factor)
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
      const ratioFrom = Number(children[0].ratio_from)
      const retainedRatio = Number(children[0].retained_ratio != null ? children[0].retained_ratio : ratioFrom)
      const hasCostShare = children.some(c => c.cost_share != null)
      const oldLots = lots[symbol] || []
      const oldRecords = lotRecords[symbol] || []

      for (let i = 0; i < oldLots.length; i++) {
        const lot = oldLots[i]
        const oldQty = lot.qty
        const oldTotalCost = oldQty * lot.price

        // Calculate each child's qty independently
        let totalWeight = retainedRatio
        const childQtys = {}
        const childWeights = {}
        for (const child of children) {
          const cqty = oldQty * Number(child.ratio_to) / ratioFrom
          childQtys[child.new_symbol] = cqty
          const w = hasCostShare ? Number(child.cost_share) : Number(child.ratio_to)
          childWeights[child.new_symbol] = w
          totalWeight += w
        }
        const retainedQty = oldQty * retainedRatio / ratioFrom
        const costPerWeight = totalWeight > 0 ? oldTotalCost / totalWeight : 0

        // Update retained lot
        lot.qty = retainedQty
        lot.price = retainedQty > 0 ? costPerWeight * retainedRatio / retainedQty : 0

        const rec = oldRecords[i]
        if (rec) {
          rec.buyQty = retainedQty
          rec.buyPrice = retainedQty > 0 ? costPerWeight * retainedRatio / retainedQty : 0
        }

        // Create child lots
        for (const child of children) {
          const cqty = childQtys[child.new_symbol]
          if (cqty > 0) {
            const cprice = costPerWeight * childWeights[child.new_symbol] / cqty
            if (!lots[child.new_symbol]) {
              lots[child.new_symbol] = []
              lotRecords[child.new_symbol] = []
            }
            lots[child.new_symbol].push({ qty: cqty, price: cprice, buyDate: lot.buyDate })
            lotRecords[child.new_symbol].push({
              buyDate: lot.buyDate,
              buyQty: cqty,
              buyPrice: cprice,
              originalQty: cqty,
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

export function consolidateLotRecords(pnlData) {
  return pnlData.map(group => {
    const groups = {}
    for (const lot of group.lots) {
      const key = lot.buyDate
      if (!groups[key]) groups[key] = { buyDate: lot.buyDate, buyQty: 0, buyValue: 0, sells: {}, remainingQty: 0, originalQty: 0 }
      const g = groups[key]
      g.buyQty += lot.buyQty
      g.buyValue += lot.buyQty * lot.buyPrice
      g.originalQty += lot.originalQty
      g.remainingQty += lot.remainingQty
      for (const s of lot.sells) {
        const sk = s.date
        if (!g.sells[sk]) g.sells[sk] = { date: s.date, qty: 0, value: 0, pnl: 0 }
        g.sells[sk].qty += s.qty
        g.sells[sk].value += s.qty * s.price
        g.sells[sk].pnl += s.pnl
      }
    }
    return {
      symbol: group.symbol,
      lots: Object.values(groups).map(g => ({
        buyDate: g.buyDate,
        buyQty: g.buyQty,
        buyPrice: g.buyQty > 0 ? g.buyValue / g.buyQty : 0,
        originalQty: g.originalQty,
        remainingQty: g.remainingQty,
        sells: Object.values(g.sells).map(s => ({
          date: s.date,
          qty: s.qty,
          price: s.qty > 0 ? s.value / s.qty : 0,
          pnl: s.pnl,
        })).sort((a, b) => a.date.localeCompare(b.date)),
        sellTotalPnl: Object.values(g.sells).reduce((s, s2) => s + s2.pnl, 0),
      })).sort((a, b) => a.buyDate.localeCompare(b.buyDate)),
    }
  })
}

function buildEvents(allTxns, corporateActions, demergerMap) {
  const events = []
  for (const t of allTxns) {
    events.push({ type: t.type, date: t.date, symbol: t.symbol, qty: Number(t.qty), price: Number(t.price), _idx: t.id || 0 })
  }
  const processed = new Set()
  for (const a of (corporateActions || [])) {
    if (a.action === 'merger') continue
    if (a.action === 'demerger') {
      const key = `${a.date}|${a.symbol}`
      if (demergerMap[key] && !processed.has(key)) {
        events.push({ type: 'demerger', date: a.date, symbol: a.symbol, children: demergerMap[key].children, _idx: null })
        processed.add(key)
      }
      continue
    }
    events.push({ type: a.action, date: a.date, symbol: a.symbol, ratio_from: Number(a.ratio_from), ratio_to: Number(a.ratio_to), _idx: null })
  }
  events.sort((a, b) => {
    const da = new Date(a.date), db = new Date(b.date)
    if (da - db !== 0) return da - db
    // Same date: buys first, then corporate actions, then sells
    // (FIFO needs buys before sells so sells always have lots to match)
    const order = { buy: 0, bonus: 1, split: 2, demerger: 3, sell: 4 }
    return (order[a.type] ?? 5) - (order[b.type] ?? 5)
  })
  return events
}

function processDemerger(lots, symbol, children) {
  const oldLots = lots[symbol] || []
  const ratioFrom = Number(children[0].ratio_from)
  const retainedRatio = Number(children[0].retained_ratio != null ? children[0].retained_ratio : ratioFrom)
  const hasCostShare = children.some(c => c.cost_share != null)
  const newLotsToAdd = {}
  for (const child of children) newLotsToAdd[child.new_symbol] = []

  for (const lot of oldLots) {
    const oldQty = lot.qty
    const oldTotalCost = oldQty * lot.price

    let totalWeight = retainedRatio
    const childQtys = {}
    const childWeights = {}
    for (const child of children) {
      const cqty = oldQty * Number(child.ratio_to) / ratioFrom
      childQtys[child.new_symbol] = cqty
      const w = hasCostShare ? Number(child.cost_share) : Number(child.ratio_to)
      childWeights[child.new_symbol] = w
      totalWeight += w
    }
    const retainedQty = oldQty * retainedRatio / ratioFrom
    const costPerWeight = totalWeight > 0 ? oldTotalCost / totalWeight : 0

    lot.qty = retainedQty
    lot.price = retainedQty > 0 ? costPerWeight * retainedRatio / retainedQty : 0

    for (const child of children) {
      const cqty = childQtys[child.new_symbol]
      if (cqty > 0) {
        newLotsToAdd[child.new_symbol].push({ qty: cqty, price: costPerWeight * childWeights[child.new_symbol] / cqty })
      }
    }
  }
  for (const [sym, childLots] of Object.entries(newLotsToAdd)) {
    if (!lots[sym]) lots[sym] = []
    lots[sym].push(...childLots)
  }
}
