import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { DashboardIcon, EmployeesIcon, BonusesIcon, SettingsIcon, MenuIcon, XMarkIcon, UserIcon, LogoutIcon } from './Icons'

const navItems = [
  { path: '/', label: 'Dashboard', icon: DashboardIcon },
  { path: '/employees', label: 'Employés', icon: EmployeesIcon },
  { path: '/bonuses', label: 'Primes', icon: BonusesIcon },
  { path: '/settings/primemax', label: 'Plafonds', icon: SettingsIcon },
]

export default function Layout({ children }) {
  const { user, logout } = useAuth()
  const { pathname } = useLocation()
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top navbar */}
      <header className="sticky top-0 z-40 bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-16">
            {/* Left: logo + desktop nav */}
            <div className="flex items-center gap-8">
              <Link to="/" className="flex items-center gap-2.5 shrink-0">
                <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white font-bold text-sm">B</div>
                <span className="font-semibold text-gray-900 hidden sm:block">BPM Primes</span>
              </Link>
              <nav className="hidden md:flex items-center gap-1">
                {navItems.map((item) => {
                  const active = pathname === item.path || (item.path !== '/' && pathname.startsWith(item.path))
                  const Icon = item.icon
                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                        active ? 'bg-blue-50 text-blue-700' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      {item.label}
                    </Link>
                  )
                })}
              </nav>
            </div>

            {/* Right: user menu */}
            <div className="flex items-center gap-3">
              <div className="hidden sm:flex items-center gap-3 text-sm">
                <div className="text-right">
                  <p className="font-medium text-gray-900">{user?.name || 'User'}</p>
                  <p className="text-xs text-gray-400">{user?.email}</p>
                </div>
                <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-semibold text-sm">
                  {user?.name?.charAt(0)?.toUpperCase() || '?'}
                </div>
              </div>
              <button onClick={logout} className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                <LogoutIcon className="w-4 h-4" />
                Quitter
              </button>
              {/* Mobile menu button */}
              <button className="md:hidden p-2 rounded-lg hover:bg-gray-100" onClick={() => setMobileOpen(!mobileOpen)}>
                {mobileOpen ? <XMarkIcon className="w-5 h-5" /> : <MenuIcon className="w-5 h-5" />}
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Mobile nav overlay */}
      {mobileOpen && (
        <>
          <div className="fixed inset-0 bg-black/20 z-30 md:hidden" onClick={() => setMobileOpen(false)} />
          <div className="fixed top-16 left-0 right-0 z-30 bg-white border-b border-gray-200 shadow-lg md:hidden animate-slideUp">
            <nav className="p-4 space-y-1">
              {navItems.map((item) => {
                const active = pathname === item.path || (item.path !== '/' && pathname.startsWith(item.path))
                const Icon = item.icon
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={() => setMobileOpen(false)}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                      active ? 'bg-blue-50 text-blue-700' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                    {item.label}
                  </Link>
                )
              })}
              <hr className="my-2 border-gray-100" />
              <button onClick={logout} className="flex items-center gap-3 px-3 py-2.5 w-full text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                <LogoutIcon className="w-5 h-5" />
                Déconnexion
              </button>
            </nav>
          </div>
        </>
      )}

      {/* Main content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {children}
      </main>
    </div>
  )
}
