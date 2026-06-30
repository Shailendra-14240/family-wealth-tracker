import { NavLink } from 'react-router-dom'

const navItems = [
  { to: '/', label: 'Dashboard', icon: '📊' },
  { to: '/accounts', label: 'Accounts', icon: '🏦' },
  { to: '/holdings', label: 'Holdings', icon: '📈' },
  { to: '/transactions', label: 'Transactions', icon: '📋' },
  { to: '/corporate-actions', label: 'Actions', icon: '🔄' },
]

export default function Layout({ children }) {
  return (
    <div className="flex flex-col min-h-screen">
      <header className="bg-gray-900 border-b border-gray-800 px-4 py-3">
        <h1 className="text-lg font-bold">Family Wealth Tracker</h1>
      </header>
      <main className="flex-1 p-4 pb-28">{children}</main>
      <nav className="fixed bottom-0 left-0 right-0 bg-gray-900 border-t border-gray-800 z-10">
        <div className="flex justify-around">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `flex flex-col items-center py-2 px-3 text-xs ${
                  isActive ? 'text-blue-400' : 'text-gray-500'
                }`
              }
            >
              <span className="text-lg">{item.icon}</span>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}
