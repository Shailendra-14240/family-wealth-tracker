// FIFO P&L calculation engine
// Takes transactions sorted by date, returns holdings with cost basis and P&L

export function calculateHoldings(transactions) {
  const symbols = [...new Set(transactions.map(t => t.symbol))]
  const holdings = []

  for (const symbol of symbols) {
    const txns = transactions
      .filter(t => t.symbol === symbol)
      .sort((a, b) => new Date(a.date) - new Date(b.date))

    const buyLots = []          // [{ qty, price }]
    let realizedPnl = 0
    let totalBuyValue = 0
    let totalBuyQty = 0

    for (const t of txns) {
      const qty = Number(t.qty)
      const price = Number(t.price)

      if (t.type === 'buy') {
        buyLots.push({ qty, price })
        totalBuyValue += qty * price
        totalBuyQty += qty
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
        // matched qty from sell reduces total buy qty
        const matchedQty = qty - remaining
        totalBuyQty -= matchedQty
        // reduce totalBuyValue proportionally
        const avgCost = totalBuyQty > 0 ? totalBuyValue / (totalBuyQty + matchedQty) : 0
        totalBuyValue -= matchedQty * avgCost
      }
    }

    const currentQty = buyLots.reduce((s, l) => s + l.qty, 0)
    const avgCost = currentQty > 0
      ? buyLots.reduce((s, l) => s + l.qty * l.price, 0) / currentQty
      : 0
    const invested = currentQty * avgCost

    holdings.push({
      symbol,
      qty: currentQty,
      avgCost: Math.round(avgCost * 100) / 100,
      invested: Math.round(invested * 100) / 100,
      realizedPnl: Math.round(realizedPnl * 100) / 100,
    })
  }

  return holdings.filter(h => h.qty > 0)
}

// For the dashboard: total summary
export function calculateSummary(holdings) {
  const totalInvested = holdings.reduce((s, h) => s + h.invested, 0)
  const totalRealizedPnl = holdings.reduce((s, h) => s + h.realizedPnl, 0)
  return {
    totalInvested: Math.round(totalInvested * 100) / 100,
    totalRealizedPnl: Math.round(totalRealizedPnl * 100) / 100,
  }
}
