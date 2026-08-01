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
      <div className="absolute inset-0 -z-10 h-full w-full bg-gray-950 bg-[linear-gradient(to_right,#18181b_1px,transparent_1px),linear-gradient(to_bottom,#18181b_1px,transparent_1px)] bg-[size:32px_32px]"></div>
      <header className="sticky top-0 z-20 bg-gray-950/80 backdrop-blur-lg border-b border-gray-800/50">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <h1 className="text-xl font-semibold tracking-tight text-white">Family Wealth Tracker</h1>
          </div>
        </div>
      </header>
      <main className="max-w-5xl mx-auto p-4 sm:p-6 lg:p-8 pb-36">{children}</main>
      <nav className="fixed bottom-0 left-0 right-0 z-20 bg-gray-950/90 backdrop-blur-lg border-t border-gray-800/50 overflow-x-auto">
        <div className="flex justify-around min-w-max max-w-lg mx-auto">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `flex flex-col items-center py-2.5 px-4 text-xs font-medium transition-colors ${
                  isActive ? 'text-primary-400' : 'text-gray-400 hover:text-gray-200'
                }`
              }
            >
              <span className="text-xl mb-0.5">{item.icon}</span>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}
