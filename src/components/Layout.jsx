import { NavLink } from 'react-router-dom'

const navItems = [
  { to: '/', label: 'Dashboard', icon: '📊' },
  { to: '/holdings', label: 'Holdings', icon: '📈' },
  { to: '/lot-pnl', label: 'Lot P&L', icon: '🔍' },
  { to: '/returns', label: 'Returns', icon: '💰' },
  { to: '/transactions', label: 'Txns', icon: '📋' },
  { to: '/accounts', label: 'Accounts', icon: '🏦' },
  { to: '/corporate-actions', label: 'Actions', icon: '🔄' },
  { to: '/fo-trades', label: 'F&O', icon: '⚡' },
]

export default function Layout({ children }) {
  return (
    <div className="min-h-screen bg-gray-950">
      <header className="sticky top-0 z-20 bg-gray-950/80 backdrop-blur-lg border-b border-gray-800/50 px-4 py-3">
        <h1 className="text-lg font-semibold tracking-tight text-white">Family Wealth Tracker</h1>
      </header>
      <main className="max-w-4xl mx-auto p-4 pb-28">{children}</main>
      <nav className="fixed bottom-0 left-0 right-0 z-20 bg-gray-950/90 backdrop-blur-lg border-t border-gray-800/50 overflow-x-auto">
        <div className="flex justify-around min-w-max max-w-lg mx-auto">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `flex flex-col items-center py-2.5 px-4 text-xs font-medium transition-colors ${
                  isActive ? 'text-blue-400' : 'text-gray-500 hover:text-gray-300'
                }`
              }
            >
              <span className="text-lg mb-0.5">{item.icon}</span>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}
