// FIFO P&L calculation engine with corporate actions support

function applyActionsToLots(lots, action) {
  const { action: type, ratio_from, ratio_to, date } = action
  const factor = ratio_to / ratio_from

  if (type === 'bonus') {
    for (const lot of lots) lot.qty *= (1 + factor)
  } else if (type === 'split') {
    for (const lot of lots) {
      lot.qty *= factor
      lot.price /= factor
    }
  }
  // merger is handled at the symbol level (rename)
}

export function calculateHoldings(transactions, corporateActions = []) {
  if (!transactions.length) return []

  // 1. Build a working copy
  const allTxns = transactions.map(t => ({ ...t }))

  // 2. Apply mergers: rename symbol before processing
  const mergers = corporateActions.filter(a => a.action === 'merger')
  for (const m of mergers) {
    const mergeDate = new Date(m.date).getTime()
    for (const t of allTxns) {
      if (t.symbol === m.symbol && new Date(t.date).getTime() < mergeDate) {
        t.symbol = m.new_symbol
      }
    }
  }

  // 3. Group by symbol
  const symbols = [...new Set(allTxns.map(t => t.symbol))]
  const holdings = []

  for (const symbol of symbols) {
    const txns = allTxns
      .filter(t => t.symbol === symbol)
      .sort((a, b) => new Date(a.date) - new Date(b.date))

    const actions = corporateActions
      .filter(a => a.symbol === symbol)
      .sort((a, b) => new Date(a.date) - new Date(b.date))

    const buyLots = []
    let realizedPnl = 0

    let actionIdx = 0
    for (const t of txns) {
      const tDate = new Date(t.date).getTime()

      // Apply any pending corporate actions before this transaction
      while (actionIdx < actions.length && new Date(actions[actionIdx].date).getTime() <= tDate) {
        applyActionsToLots(buyLots, actions[actionIdx])
        actionIdx++
      }

      const qty = Number(t.qty)
      const price = Number(t.price)

      if (t.type === 'buy') {
        buyLots.push({ qty, price })
      } else if (t.type === 'sell') {
        let remaining = qty
        while (remaining > 0 && buyLots.length > 0) {
          const lot = buyLots[0]
          const matched = Math.min(remaining, lot.qty)
          realizedPnl += matched * (price - lot.price)
          lot.qty -= matched
          remaining -= matched
          if (lot.qty === 0) buyLots.shift()
        }
      }
    }

    // Apply any remaining corporate actions after all transactions
    while (actionIdx < actions.length) {
      applyActionsToLots(buyLots, actions[actionIdx])
      actionIdx++
    }

    const currentQty = buyLots.reduce((s, l) => s + l.qty, 0)
    const avgCost = currentQty > 0
      ? buyLots.reduce((s, l) => s + l.qty * l.price, 0) / currentQty
      : 0
    const invested = currentQty * avgCost

    holdings.push({
      symbol,
      qty: Math.round(currentQty),
      avgCost: Math.round(avgCost * 100) / 100,
      invested: Math.round(invested * 100) / 100,
      realizedPnl: Math.round(realizedPnl * 100) / 100,
    })
  }

  return holdings.filter(h => h.qty > 0)
}

export function calculateSummary(holdings) {
  const totalInvested = holdings.reduce((s, h) => s + h.invested, 0)
  const totalRealizedPnl = holdings.reduce((s, h) => s + h.realizedPnl, 0)
  return {
    totalInvested: Math.round(totalInvested * 100) / 100,
    totalRealizedPnl: Math.round(totalRealizedPnl * 100) / 100,
  }
}
