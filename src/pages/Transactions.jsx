import { useState, useRef } from 'react'

const DEMO_TRANSACTIONS = [
  { id: 1, date: '2026-06-20', type: 'buy', symbol: 'RELIANCE', qty: 25, price: 2850, account: 'Zerodha (Mine)' },
  { id: 2, date: '2026-06-18', type: 'buy', symbol: 'TCS', qty: 10, price: 3850, account: 'Zerodha (Mine)' },
  { id: 3, date: '2026-06-15', type: 'buy', symbol: 'HDFCBANK', qty: 50, price: 1620, account: 'Zerodha (Dad)' },
]

export default function Transactions() {
  const [txns, setTxns] = useState(DEMO_TRANSACTIONS)
  const [showForm, setShowForm] = useState(false)
  const fileRef = useRef()
  const [form, setForm] = useState({
    date: new Date().toISOString().split('T')[0],
    type: 'buy',
    symbol: '',
    qty: '',
    price: '',
    account: '',
  })

  const handleAdd = (e) => {
    e.preventDefault()
    if (!form.symbol || !form.qty || !form.price) return
    setTxns([...txns, { ...form, id: Date.now(), qty: Number(form.qty), price: Number(form.price) }])
    setForm({ ...form, symbol: '', qty: '', price: '', account: '' })
    setShowForm(false)
  }

  const handleCsvUpload = (e) => {
    const file = fileRef.current?.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (evt) => {
      const text = evt.target.result
      const lines = text.split('\n').filter(Boolean)
      const parsed = lines.slice(1).map((line, i) => {
        const cols = line.split(',')
        return {
          id: Date.now() + i,
          date: cols[0]?.trim(),
          type: cols[1]?.trim().toLowerCase(),
          symbol: cols[2]?.trim(),
          qty: Number(cols[3]),
          price: Number(cols[4]),
          account: cols[5]?.trim(),
        }
      })
      setTxns((prev) => [...prev, ...parsed])
    }
    reader.readAsText(file)
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold">Transactions</h2>
        <button onClick={() => setShowForm(!showForm)} className="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-sm">+ Add</button>
      </div>

      <div className="bg-gray-900 rounded-xl p-4">
        <p className="text-sm text-gray-400 mb-2">Upload trade history (CSV)</p>
        <p className="text-xs text-gray-600 mb-2">Format: date,type,symbol,qty,price,account</p>
        <input ref={fileRef} type="file" accept=".csv" onChange={handleCsvUpload} className="text-sm text-gray-400 file:mr-3 file:bg-blue-600 file:text-white file:border-0 file:rounded file:px-3 file:py-1" />
      </div>

      {showForm && (
        <form onSubmit={handleAdd} className="bg-gray-900 rounded-xl p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <input type="date" className="bg-gray-800 rounded px-3 py-2 text-sm" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            <select className="bg-gray-800 rounded px-3 py-2 text-sm" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              <option value="buy">Buy</option>
              <option value="sell">Sell</option>
            </select>
          </div>
          <input placeholder="Symbol (e.g. RELIANCE)" className="w-full bg-gray-800 rounded px-3 py-2 text-sm" value={form.symbol} onChange={(e) => setForm({ ...form, symbol: e.target.value.toUpperCase() })} />
          <div className="grid grid-cols-2 gap-3">
            <input type="number" placeholder="Qty" className="bg-gray-800 rounded px-3 py-2 text-sm" value={form.qty} onChange={(e) => setForm({ ...form, qty: e.target.value })} />
            <input type="number" placeholder="Price" className="bg-gray-800 rounded px-3 py-2 text-sm" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
          </div>
          <input placeholder="Account name" className="w-full bg-gray-800 rounded px-3 py-2 text-sm" value={form.account} onChange={(e) => setForm({ ...form, account: e.target.value })} />
          <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm">Save</button>
        </form>
      )}

      <div className="space-y-2">
        {txns.map((t) => (
          <div key={t.id} className="bg-gray-900 rounded-xl p-4">
            <div className="flex justify-between items-center">
              <div>
                <p className="font-semibold">{t.symbol}</p>
                <p className="text-xs text-gray-500">{t.type.toUpperCase()} {t.qty} @ ₹{t.price} &middot; {t.date}</p>
                {t.account && <p className="text-xs text-gray-600">{t.account}</p>}
              </div>
              <p className="font-medium">₹{(t.qty * t.price).toLocaleString()}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
