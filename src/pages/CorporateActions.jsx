import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const ACTION_TYPES = [
  { id: 'bonus', label: 'Bonus', desc: 'e.g. 1:1 = get 1 free share per share held' },
  { id: 'split', label: 'Split', desc: 'e.g. 10:1 = 1 share becomes 10' },
  { id: 'merger', label: 'Merger', desc: 'e.g. IDFC → IDFCFIRSTB at 1:1' },
  {
    id: 'demerger',
    label: 'Demerger',
    desc: 'One stock splits into multiple. Add one entry per child with same date & symbol. Cost basis splits proportionally.',
  },
]

export default function CorporateActions() {
  const [actions, setActions] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({
    date: new Date().toISOString().split('T')[0],
    action: 'bonus',
    symbol: '',
    new_symbol: '',
    ratio_from: '1',
    ratio_to: '1',
    retained_ratio: '',
    cost_share: '',
    notes: '',
  })

  useEffect(() => {
    if (!supabase) return
    supabase.from('corporate_actions').select('*').order('date', { ascending: false }).then(({ data }) => {
      if (data) setActions(data)
      setLoading(false)
    })
  }, [])

  const handleAdd = async (e) => {
    e.preventDefault()
    if (!form.symbol || !supabase) return
    const payload = {
      date: form.date,
      action: form.action,
      symbol: form.symbol.toUpperCase().replace(/#/g, '').replace(/\d+$/, ''),
      ratio_from: Number(form.ratio_from),
      ratio_to: Number(form.ratio_to),
      notes: form.notes || null,
    }
    if (form.action === 'merger' || form.action === 'demerger') {
      if (!form.new_symbol) return
      payload.new_symbol = form.new_symbol.toUpperCase().replace(/#/g, '').replace(/\d+$/, '')
    }
    if (form.action === 'demerger' && form.retained_ratio !== '') {
      payload.retained_ratio = Number(form.retained_ratio)
    }
    if (form.action === 'demerger' && form.cost_share !== '') {
      payload.cost_share = Number(form.cost_share)
    }
    const { data } = await supabase.from('corporate_actions').insert(payload).select().single()
    if (data) {
      setActions([data, ...actions])
      setForm({ date: new Date().toISOString().split('T')[0], action: 'bonus', symbol: '', new_symbol: '', ratio_from: '1', ratio_to: '1', retained_ratio: '', cost_share: '', notes: '' })
      setShowForm(false)
    }
  }

  const handleDelete = async (id) => {
    await supabase.from('corporate_actions').delete().eq('id', id)
    setActions(actions.filter(a => a.id !== id))
  }

  if (!supabase) return <p className="text-gray-500 text-center mt-10">Connect Supabase</p>
  if (loading) return <p className="text-gray-500 text-center mt-10">Loading...</p>

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold text-white">Corporate Actions</h2>
        <button onClick={() => setShowForm(!showForm)} className="bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded-lg text-sm font-medium transition-colors">+ Add</button>
      </div>

      {showForm && (
        <form onSubmit={handleAdd} className="rounded-xl bg-gray-900/60 border border-gray-800/50 p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Date</label>
              <input type="date" className="w-full bg-gray-800/80 text-white border border-gray-700/50 rounded-lg px-3 py-2 text-sm mt-1" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Type</label>
              <select className="w-full bg-gray-800/80 text-white border border-gray-700/50 rounded-lg px-3 py-2 text-sm mt-1" value={form.action} onChange={e => setForm({ ...form, action: e.target.value })}>
                {ACTION_TYPES.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
              </select>
            </div>
          </div>

          {ACTION_TYPES.find(a => a.id === form.action)?.desc && (
            <p className="text-xs text-gray-500">{ACTION_TYPES.find(a => a.id === form.action).desc}</p>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Symbol</label>
              <input placeholder="RELIANCE" className="w-full bg-gray-800/80 text-white border border-gray-700/50 rounded-lg px-3 py-2 text-sm placeholder:text-gray-600" value={form.symbol} onChange={e => setForm({ ...form, symbol: e.target.value.toUpperCase() })} />
            </div>
            {(form.action === 'merger' || form.action === 'demerger') && (
              <div>
                <label className="text-xs text-gray-500 mb-1 block">New Symbol</label>
                <input placeholder={form.action === 'merger' ? 'IDFCFIRSTB' : 'TMPV'} className="w-full bg-gray-800/80 text-white border border-gray-700/50 rounded-lg px-3 py-2 text-sm placeholder:text-gray-600" value={form.new_symbol} onChange={e => setForm({ ...form, new_symbol: e.target.value.toUpperCase() })} />
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Ratio From</label>
              <input type="number" step="0.0001" className="w-full bg-gray-800/80 text-white border border-gray-700/50 rounded-lg px-3 py-2 text-sm" value={form.ratio_from} onChange={e => setForm({ ...form, ratio_from: e.target.value })} />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Ratio To</label>
              <input type="number" step="0.0001" className="w-full bg-gray-800/80 text-white border border-gray-700/50 rounded-lg px-3 py-2 text-sm" value={form.ratio_to} onChange={e => setForm({ ...form, ratio_to: e.target.value })} />
            </div>
          </div>

          {form.action === 'demerger' && (
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Retained Ratio <span className="text-gray-600">(parent shares kept per {form.ratio_from} old shares; 0 if company ceases)</span></label>
              <input type="number" step="0.0001" className="w-full bg-gray-800/80 text-white border border-gray-700/50 rounded-lg px-3 py-2 text-sm placeholder:text-gray-600" value={form.retained_ratio} onChange={e => setForm({ ...form, retained_ratio: e.target.value })} placeholder="0" />
            </div>
          )}

          {form.action === 'demerger' && (
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Cost Share <span className="text-gray-600">(cost weight; omit for equal split)</span></label>
              <input type="number" step="0.0001" className="w-full bg-gray-800/80 text-white border border-gray-700/50 rounded-lg px-3 py-2 text-sm placeholder:text-gray-600" value={form.cost_share} onChange={e => setForm({ ...form, cost_share: e.target.value })} placeholder="e.g. 0.69" />
            </div>
          )}

          <label className="text-xs text-gray-500 mb-1 block">Notes</label>
          <input placeholder="Notes (optional)" className="w-full bg-gray-800/80 text-white border border-gray-700/50 rounded-lg px-3 py-2 text-sm placeholder:text-gray-600" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
          <button type="submit" className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">Save</button>
        </form>
      )}

      <div className="space-y-2">
        {actions.map((a) => (
          <div key={a.id} className="rounded-xl bg-gray-900/60 border border-gray-800/50 p-4">
            <div className="flex justify-between items-start">
              <div>
                <p className="font-semibold capitalize text-white">{a.action}</p>
                <p className="text-xs text-gray-400">
                  {a.symbol}{a.new_symbol ? ` → ${a.new_symbol}` : ''} &middot; {a.ratio_from}:{a.ratio_to} &middot; {a.date}
                </p>
                {a.notes && <p className="text-xs text-gray-500">{a.notes}</p>}
              </div>
              <button onClick={() => handleDelete(a.id)} className="text-red-400 text-xs">Delete</button>
            </div>
          </div>
        ))}
        {actions.length === 0 && <p className="text-gray-500 text-center py-10">No corporate actions added yet.</p>}
      </div>
    </div>
  )
}
