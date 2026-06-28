const DEMO_HOLDINGS = [
  { symbol: 'RELIANCE', qty: 25, avgPrice: 2850, ltp: 3020, account: 'Zerodha (Mine)' },
  { symbol: 'TCS', qty: 10, avgPrice: 3850, ltp: 4100, account: 'Zerodha (Mine)' },
  { symbol: 'HDFCBANK', qty: 50, avgPrice: 1620, ltp: 1750, account: 'Zerodha (Dad)' },
  { symbol: 'INFY', qty: 30, avgPrice: 1480, ltp: 1590, account: 'Zerodha (Dad)' },
  { symbol: 'ITC', qty: 100, avgPrice: 425, ltp: 480, account: 'Zerodha (Mine)' },
]

export default function Holdings() {
  const totalPnl = DEMO_HOLDINGS.reduce((s, h) => s + (h.ltp - h.avgPrice) * h.qty, 0)

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold">Holdings</h2>
        <p className={`font-semibold ${totalPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
          P&L: ₹{totalPnl.toLocaleString()}
        </p>
      </div>

      <div className="space-y-2">
        {DEMO_HOLDINGS.map((h, i) => {
          const pnl = (h.ltp - h.avgPrice) * h.qty
          return (
            <div key={i} className="bg-gray-900 rounded-xl p-4">
              <div className="flex justify-between items-start">
                <div>
                  <p className="font-semibold">{h.symbol}</p>
                  <p className="text-xs text-gray-500">{h.qty} shares @ ₹{h.avgPrice}</p>
                  <p className="text-xs text-gray-600">{h.account}</p>
                </div>
                <div className="text-right">
                  <p className="font-medium">₹{(h.ltp * h.qty).toLocaleString()}</p>
                  <p className={`text-sm ${pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {pnl >= 0 ? '+' : ''}₹{pnl.toLocaleString()}
                  </p>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
