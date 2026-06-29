import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const ACCOUNT_TYPES = ['demat', 'savings', 'loan', 'mutual_fund', 'crypto', 'other']

export default function Accounts() {
  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', type: 'savings', balance: '' })

  useEffect(() => {
    if (!supabase) return
    supabase.from('accounts').select('*').order('created_at').then(({ data }) => {
      if (data) setAccounts(data)
      setLoading(false)
    })
  }, [])

  const handleAdd = async (e) => {
    e.preventDefault()
    if (!form.name || form.balance === '' || !supabase) return
    const { data } = await supabase.from('accounts').insert({
      name: form.name,
      type: form.type,
      balance: Number(form.balance),
    }).select().single()
    if (data) {
      setAccounts([...accounts, data])
      setForm({ name: '', type: 'savings', balance: '' })
      setShowForm(false)
    }
  }

  if (!supabase) return <p className="text-gray-500 text-center mt-10">Connect Supabase to manage accounts</p>
  if (loading) return <p className="text-gray-500 text-center mt-10">Loading...</p>

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold">Accounts</h2>
        <button onClick={() => setShowForm(!showForm)} className="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-sm">+ Add</button>
      </div>

      {showForm && (
        <form onSubmit={handleAdd} className="bg-gray-900 rounded-xl p-4 space-y-3">
          <input placeholder="Account name" className="w-full bg-gray-800 rounded px-3 py-2 text-sm" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <select className="w-full bg-gray-800 rounded px-3 py-2 text-sm" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
            {ACCOUNT_TYPES.map((t) => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
          </select>
          <input type="number" placeholder="Balance (negative for loans)" className="w-full bg-gray-800 rounded px-3 py-2 text-sm" value={form.balance} onChange={(e) => setForm({ ...form, balance: e.target.value })} />
          <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm">Save</button>
        </form>
      )}

      <div className="space-y-2">
        {accounts.map((acct) => (
          <div key={acct.id} className="bg-gray-900 rounded-xl p-4 flex justify-between items-center">
            <div>
              <p className="font-medium">{acct.name}</p>
              <p className="text-xs text-gray-500 capitalize">{acct.type.replace('_', ' ')}</p>
            </div>
            <p className={`font-semibold ${acct.balance >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              ₹{Number(acct.balance).toLocaleString()}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}
