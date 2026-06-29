import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'

export default function Transactions() {
  const [txns, setTxns] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const fileRef = useRef()
  const [form, setForm] = useState({
    date: new Date().toISOString().split('T')[0],
    type: 'buy',
    symbol: '',
    qty: '',
    price: '',
    account_id: '',
  })
  const [accounts, setAccounts] = useState([])

  useEffect(() => {
    if (!supabase) return
    Promise.all([
      supabase.from('transactions').select('*, accounts(name)').order('date', { ascending: false }),
      supabase.from('accounts').select('id, name'),
    ]).then(([txnRes, acctRes]) => {
      if (txnRes.data) setTxns(txnRes.data)
      if (acctRes.data) setAccounts(acctRes.data)
      setLoading(false)
    })
  }, [])

  const handleAdd = async (e) => {
    e.preventDefault()
    if (!form.symbol || !form.qty || !form.price || !supabase) return
    const { data } = await supabase.from('transactions').insert({
      date: form.date,
      type: form.type,
      symbol: form.symbol,
      qty: Number(form.qty),
      price: Number(form.price),
      account_id: form.account_id || null,
    }).select('*, accounts(name)').single()
    if (data) {
      setTxns([data, ...txns])
      setForm({ ...form, symbol: '', qty: '', price: '', account_id: '' })
      setShowForm(false)
    }
  }

  const handleCsvUpload = async (e) => {
    const file = fileRef.current?.files?.[0]
    if (!file || !supabase) return
    const reader = new FileReader()
    reader.onload = async (evt) => {
      const lines = evt.target.result.split('\n').filter(Boolean)
      const rows = lines.slice(1).map((line) => {
        const cols = line.split(',')
        return {
          date: cols[0]?.trim() || new Date().toISOString().split('T')[0],
          type: cols[1]?.trim().toLowerCase() === 'sell' ? 'sell' : 'buy',
          symbol: cols[2]?.trim(),
          qty: Number(cols[3]),
          price: Number(cols[4]),
        }
      }).filter(r => r.symbol)
      const { data } = await supabase.from('transactions').insert(rows).select('*, accounts(name)')
      if (data) setTxns([...data, ...txns])
    }
    reader.readAsText(file)
  }

  if (!supabase) return <p className="text-gray-500 text-center mt-10">Connect Supabase to add transactions</p>
  if (loading) return <p className="text-gray-500 text-center mt-10">Loading...</p>

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold">Transactions</h2>
        <button onClick={() => setShowForm(!showForm)} className="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-sm">+ Add</button>
      </div>

      <div className="bg-gray-900 rounded-xl p-4">
        <p className="text-sm text-gray-400 mb-2">Upload trade history (CSV)</p>
        <p className="text-xs text-gray-600 mb-2">Format: date,type,symbol,qty,price</p>
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
          <select className="w-full bg-gray-800 rounded px-3 py-2 text-sm" value={form.account_id} onChange={(e) => setForm({ ...form, account_id: e.target.value })}>
            <option value="">No account</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm">Save</button>
        </form>
      )}

      <div className="space-y-2">
        {txns.map((t) => (
          <div key={t.id} className="bg-gray-900 rounded-xl p-4">
            <div className="flex justify-between items-center">
              <div>
                <p className="font-semibold">{t.symbol}</p>
                <p className="text-xs text-gray-500">{t.type.toUpperCase()} {t.qty} @ ₹{Number(t.price).toLocaleString()} &middot; {t.date}</p>
                {t.accounts?.name && <p className="text-xs text-gray-600">{t.accounts.name}</p>}
              </div>
              <p className="font-medium">₹{(Number(t.qty) * Number(t.price)).toLocaleString()}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
