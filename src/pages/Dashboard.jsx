import { useState } from 'react'
import { supabase } from '../lib/supabase'

const DEMO_ACCOUNTS = [
  { id: 1, name: 'Zerodha (Mine)', type: 'brokerage', balance: 352_000 },
  { id: 2, name: 'Zerodha (Dad)', type: 'brokerage', balance: 218_000 },
  { id: 3, name: 'Savings (HDFC)', type: 'savings', balance: 480_000 },
  { id: 4, name: 'Home Loan', type: 'loan', balance: -1_200_000 },
]

const ASSETS = DEMO_ACCOUNTS.filter((a) => a.balance > 0).reduce((s, a) => s + a.balance, 0)
const LIABILITIES = DEMO_ACCOUNTS.filter((a) => a.balance < 0).reduce((s, a) => s + a.balance, 0)

export default function Dashboard() {
  const [accounts] = useState(DEMO_ACCOUNTS)

  return (
    <div className="space-y-4">
      <div className="bg-gray-900 rounded-xl p-4 text-center">
        <p className="text-sm text-gray-400">Net Worth</p>
        <p className="text-3xl font-bold">₹{(ASSETS + LIABILITIES).toLocaleString()}</p>
        <div className="flex justify-center gap-6 mt-2 text-sm">
          <span className="text-green-400">+₹{ASSETS.toLocaleString()}</span>
          <span className="text-red-400">-₹{Math.abs(LIABILITIES).toLocaleString()}</span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="bg-gray-900 rounded-xl p-3 text-center">
          <p className="text-xs text-gray-400">Accounts</p>
          <p className="text-xl font-bold">{accounts.length}</p>
        </div>
        <div className="bg-gray-900 rounded-xl p-3 text-center">
          <p className="text-xs text-gray-400">Assets</p>
          <p className="text-xl font-bold text-green-400">₹{ASSETS.toLocaleString()}</p>
        </div>
        <div className="bg-gray-900 rounded-xl p-3 text-center">
          <p className="text-xs text-gray-400">Liabilities</p>
          <p className="text-xl font-bold text-red-400">₹{Math.abs(LIABILITIES).toLocaleString()}</p>
        </div>
      </div>

      <div className="bg-gray-900 rounded-xl p-4">
        <p className="text-sm text-gray-400 mb-2">Net Worth Trend</p>
        <div className="h-32 flex items-center justify-center text-gray-600 border border-dashed border-gray-700 rounded-lg">
          Chart will appear after adding transaction history
        </div>
      </div>

      <h2 className="text-lg font-semibold mt-4">Accounts</h2>
      <div className="space-y-2">
        {accounts.map((acct) => (
          <div key={acct.id} className="bg-gray-900 rounded-xl p-4 flex justify-between items-center">
            <div>
              <p className="font-medium">{acct.name}</p>
              <p className="text-xs text-gray-500 capitalize">{acct.type}</p>
            </div>
            <p className={`font-semibold ${acct.balance >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              ₹{acct.balance.toLocaleString()}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}
