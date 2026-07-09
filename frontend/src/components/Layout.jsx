import { useState, useRef, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import NotificationDropdown from './NotificationDropdown'
import { DashboardIcon, EmployeesIcon, BonusesIcon, SettingsIcon, MenuIcon, XMarkIcon, UserIcon, LogoutIcon, LockIcon, ChevronDownIcon, ArchiveIcon } from './Icons'

const navItems = [
  { path: '/', label: 'Dashboard', icon: DashboardIcon },
  { path: '/employees', label: 'Employés', icon: EmployeesIcon },
  { path: '/bonuses', label: 'Primes', icon: BonusesIcon },
  { path: '/settings/primemax', label: 'Plafonds', icon: SettingsIcon },
]

function userRole(user) {
  if (user?.is_dg) return 'DG'
  if (user?.is_drh) return 'DRH'
  if (user?.is_directeur) return 'Directeur'
  if (user?.is_validator_n1) return 'Validateur N+1'
  return 'Collaborateur'
}

function userDept(user) {
  return user?.department || '—'
}

function userColor(user) {
  if (user?.is_dg) return 'bg-amber-100 text-amber-700'
  if (user?.is_drh) return 'bg-emerald-100 text-emerald-700'
  if (user?.is_directeur) return 'bg-purple-100 text-purple-700'
  if (user?.is_validator_n1) return 'bg-orange-100 text-orange-700'
  return 'bg-blue-100 text-blue-700'
}

export default function Layout({ children }) {
  const { user, logout } = useAuth()
  const { pathname } = useLocation()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const menuRef = useRef(null)

  useEffect(() => {
    const handleClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setUserMenuOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

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
                {[...navItems, ...((user?.is_drh || user?.is_dg) ? [{ path: '/archive', label: 'Archive', icon: ArchiveIcon }] : [])].map((item) => {
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
            <div className="flex items-center gap-1">
              <NotificationDropdown />
              <div className="relative" ref={menuRef}>
                <button onClick={() => setUserMenuOpen(!userMenuOpen)}
                  className="hidden sm:flex items-center gap-2 pl-3 pr-2 py-1.5 rounded-lg hover:bg-gray-100 transition-colors">
                  <div className={'w-8 h-8 rounded-full flex items-center justify-center font-semibold text-sm ' + userColor(user)}>
                    {user?.name?.charAt(0)?.toUpperCase() || '?'}
                  </div>
                  <div className="text-left text-sm leading-tight">
                    <p className="font-medium text-gray-900">{user?.name || 'User'}</p>
                    <p className="text-[11px] text-gray-400">{user?.email}</p>
                    <p className="text-[10px] text-gray-400">{userDept(user)} · {userRole(user)}</p>
                  </div>
                  <ChevronDownIcon className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                </button>

                {userMenuOpen && (
                  <div className="absolute right-0 top-full mt-2 w-56 bg-white rounded-xl shadow-lg border border-gray-200 py-1.5 animate-scaleIn">
                    <div className="px-4 py-2.5 border-b border-gray-100">
                      <p className="text-sm font-medium text-gray-900 truncate">{user?.name || 'User'}</p>
                      <p className="text-xs text-gray-400 truncate mt-0.5">{user?.email}</p>
                      <p className="text-[11px] text-gray-400 truncate mt-0.5">{userDept(user)} · {userRole(user)}</p>
                    </div>
                    <button className="flex items-center gap-2.5 w-full px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 transition-colors">
                      <LockIcon className="w-4 h-4 text-gray-400" />
                      Changer mot de passe
                    </button>
                    <hr className="my-1 border-gray-100" />
                    <button onClick={logout} className="flex items-center gap-2.5 w-full px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors">
                      <LogoutIcon className="w-4 h-4" />
                      Déconnexion
                    </button>
                  </div>
                )}
              </div>

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
              <div className="flex items-center gap-3 px-3 py-3 border-b border-gray-100 mb-2">
                <div className={'w-9 h-9 rounded-full flex items-center justify-center font-semibold text-sm ' + userColor(user)}>
                  {user?.name?.charAt(0)?.toUpperCase() || '?'}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{user?.name || 'User'}</p>
                  <p className="text-xs text-gray-400 truncate">{user?.email}</p>
                  <p className="text-[10px] text-gray-400 truncate">{userDept(user)} · {userRole(user)}</p>
                </div>
              </div>
              {[...navItems, ...((user?.is_drh || user?.is_dg) ? [{ path: '/archive', label: 'Archive', icon: ArchiveIcon }] : [])].map((item) => {
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
              <button className="flex items-center gap-3 px-3 py-2.5 w-full text-sm text-gray-600 hover:bg-gray-50 rounded-lg transition-colors">
                <LockIcon className="w-5 h-5 text-gray-400" />
                Changer mot de passe
              </button>
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
