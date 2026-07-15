import { useState, useEffect, useCallback, useMemo } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { getAdminUsers, adminUpdateUser, adminDeleteUser, adminResetPassword, adminCreateUser, adminLdapSync, adminLdapSearch, getUsers } from '../services/api'
import Modal from '../components/Modal'
import { EditIcon, TrashIcon, SearchIcon, PlusIcon, UsersIcon, ChevronLeftIcon } from '../components/Icons'

const PAGE_SIZE = 15

export default function UsersPage() {
  const { user: currentUser } = useAuth()
  const [users, setUsers] = useState([])
  const [departments, setDepartments] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [roleFilter, setRoleFilter] = useState('')
  const [deptFilter, setDeptFilter] = useState('')
  const [editUser, setEditUser] = useState(null)
  const [showCreate, setShowCreate] = useState(false)
  const [showDelete, setShowDelete] = useState(null)
  const [toast, setToast] = useState(null)
  const [syncing, setSyncing] = useState(false)
  const [ldapSearch, setLdapSearch] = useState('')
  const [ldapResults, setLdapResults] = useState([])
  const [ldapLoading, setLdapLoading] = useState(false)
  const [showLdap, setShowLdap] = useState(false)
  const [view, setView] = useState('table')

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), type === 'error' ? 5000 : 3000)
  }

  const loadUsers = useCallback(async () => {
    try {
      const data = await getAdminUsers()
      setUsers(data)
    } catch {
      showToast('Erreur lors du chargement', 'error')
    } finally {
      setLoading(false)
    }
  }, [])

  const loadDepartments = useCallback(async () => {
    try {
      const data = await getUsers()
      const depts = [...new Set(data.map(u => u.department).filter(Boolean))].sort()
      setDepartments(depts)
    } catch {}
  }, [])

  useEffect(() => { loadUsers(); loadDepartments() }, [loadUsers, loadDepartments])

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return users.filter(u => {
      if (q && !u.name?.toLowerCase().includes(q) && !u.email?.toLowerCase().includes(q) && !u.department?.toLowerCase().includes(q) && !u.poste?.toLowerCase().includes(q)) return false
      if (roleFilter) {
        if (roleFilter === 'admin' && !u.is_admin) return false
        if (roleFilter === 'dg' && !u.is_dg) return false
        if (roleFilter === 'drh' && !u.is_drh) return false
        if (roleFilter === 'directeur' && !u.is_directeur) return false
        if (roleFilter === 'n1' && !u.is_validator_n1) return false
        if (roleFilter === 'collab' && (u.is_admin || u.is_dg || u.is_drh || u.is_directeur || u.is_validator_n1)) return false
      }
      if (deptFilter && u.department !== deptFilter) return false
      return true
    })
  }, [users, search, roleFilter, deptFilter])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const paginated = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE
    return filtered.slice(start, start + PAGE_SIZE)
  }, [filtered, safePage])

  useEffect(() => { setPage(1) }, [search, roleFilter, deptFilter])

  const handleUpdate = async (userId, data) => {
    try {
      await adminUpdateUser(userId, data)
      await loadUsers()
      setEditUser(null)
      showToast('Utilisateur mis à jour')
    } catch (e) {
      showToast(e.response?.data?.detail || 'Erreur', 'error')
    }
  }

  const handleDelete = async (userId) => {
    try {
      await adminDeleteUser(userId)
      await loadUsers()
      setShowDelete(null)
      showToast('Utilisateur supprimé')
    } catch (e) {
      showToast(e.response?.data?.detail || 'Erreur', 'error')
    }
  }

  const handleResetPassword = async (userId) => {
    try {
      await adminResetPassword(userId)
      showToast('Mot de passe réinitialisé à testprime')
    } catch (e) {
      showToast(e.response?.data?.detail || 'Erreur', 'error')
    }
  }

  const handleLdapSearch = async () => {
    if (ldapSearch.length < 2) return
    setLdapLoading(true)
    try {
      const results = await adminLdapSearch(ldapSearch)
      setLdapResults(results)
    } catch {
      showToast('Erreur recherche LDAP', 'error')
    } finally {
      setLdapLoading(false)
    }
  }

  const handleCreateFromLdap = async (entry) => {
    try {
      await adminCreateUser({
        email: entry.email,
        name: entry.name,
        poste: entry.title,
        department: entry.department,
      })
      await loadUsers()
      setLdapResults(prev => prev.filter(r => r.email !== entry.email))
      showToast(`${entry.name} créé avec succès`)
    } catch (e) {
      const msg = e.response?.data?.detail || 'Erreur lors de la création'
      showToast(msg, 'error')
    }
  }

  const handleLdapSync = async () => {
    setSyncing(true)
    try {
      const result = await adminLdapSync()
      if (result.success) {
        await loadUsers()
        showToast('Synchronisation LDAP terminée avec succès')
      } else {
        showToast('Erreur lors de la synchronisation LDAP', 'error')
      }
    } catch {
      showToast('Erreur de connexion lors de la synchronisation', 'error')
    } finally {
      setSyncing(false)
    }
  }

  const roleBadges = (u) => {
    const badges = []
    if (u.is_admin) badges.push(<span key="admin" className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-700 border border-red-200">Admin</span>)
    if (u.is_dg) badges.push(<span key="dg" className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-700 border border-amber-200">DG</span>)
    if (u.is_drh) badges.push(<span key="drh" className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-700 border border-emerald-200">DRH</span>)
    if (u.is_directeur) badges.push(<span key="dir" className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-700 border border-purple-200">Directeur</span>)
    if (u.is_validator_n1) badges.push(<span key="n1" className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-700 border border-blue-200">N+1</span>)
    if (!badges.length) badges.push(<span key="collab" className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-500 border border-gray-200">Collaborateur</span>)
    return badges
  }

  const roleCounts = useMemo(() => ({
    all: users.length,
    admin: users.filter(u => u.is_admin).length,
    dg: users.filter(u => u.is_dg).length,
    drh: users.filter(u => u.is_drh).length,
    directeur: users.filter(u => u.is_directeur).length,
    n1: users.filter(u => u.is_validator_n1).length,
    collab: users.filter(u => !u.is_admin && !u.is_dg && !u.is_drh && !u.is_directeur && !u.is_validator_n1).length,
  }), [users])

  if (loading) return <div className="flex justify-center p-8"><span className="loading loading-spinner loading-lg"></span></div>

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-5">
      {toast && (
        <div className="toast toast-end toast-top z-50">
          <div className={`alert ${toast.type === 'error' ? 'alert-error' : 'alert-success'} shadow-lg`}>
            {toast.type === 'error' ? (
              <svg xmlns="http://www.w3.org/2000/svg" className="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" className="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            )}
            <span className="font-medium">{toast.msg}</span>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-50 rounded-xl">
            <UsersIcon className="w-6 h-6 text-blue-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Utilisateurs</h1>
            <p className="text-xs text-gray-400">{users.length} utilisateur{users.length > 1 ? 's' : ''} dans le système</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowLdap(true)} className="btn btn-outline btn-sm gap-1 border-blue-200 text-blue-600 hover:bg-blue-50">
            <PlusIcon className="w-4 h-4" /> Ajouter
          </button>
          <button onClick={handleLdapSync} className={`btn btn-outline btn-sm gap-1 ${syncing ? 'loading' : ''}`} disabled={syncing}>
            {syncing ? <span className="loading loading-spinner loading-sm"></span> : null}
            Sync LDAP
          </button>
        </div>
      </div>

      {/* Search + Filters */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-3">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1 relative">
            <SearchIcon className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Rechercher un nom, email, département..."
              className="input input-bordered input-sm w-full pl-9 pr-8 bg-gray-50 focus:bg-white"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded-full hover:bg-gray-200 text-gray-400 hover:text-gray-600">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            )}
          </div>
          <select
            className="select select-bordered select-sm bg-gray-50 focus:bg-white w-full sm:w-40"
            value={deptFilter}
            onChange={e => setDeptFilter(e.target.value)}
          >
            <option value="">Tous services</option>
            {departments.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
      </div>

      {/* Role filter tabs */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
        {[
          { key: '', label: 'Tous', count: roleCounts.all },
          { key: 'admin', label: 'Admin', count: roleCounts.admin, color: 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100' },
          { key: 'dg', label: 'DG', count: roleCounts.dg, color: 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100' },
          { key: 'drh', label: 'DRH', count: roleCounts.drh, color: 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100' },
          { key: 'directeur', label: 'Directeur', count: roleCounts.directeur, color: 'bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100' },
          { key: 'n1', label: 'Valid. N+1', count: roleCounts.n1, color: 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100' },
          { key: 'collab', label: 'Collab.', count: roleCounts.collab, color: 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100' },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setRoleFilter(tab.key === roleFilter ? '' : tab.key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap border transition-all
              ${roleFilter === tab.key
                ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                : tab.color || 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'}`}
          >
            {tab.label}
            <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold
              ${roleFilter === tab.key ? 'bg-white/20 text-white' : 'bg-white text-gray-500'}`}>
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {/* Results count + pagination info */}
      <div className="flex items-center justify-between text-xs text-gray-500">
        <span>
          {filtered.length === users.length
            ? `${users.length} utilisateur${users.length > 1 ? 's' : ''}`
            : `${filtered.length} résultat${filtered.length > 1 ? 's' : ''} sur ${users.length}`
          }
        </span>
        {totalPages > 1 && (
          <span>Page {safePage} / {totalPages}</span>
        )}
      </div>

      {/* Users table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="table table-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-xs font-semibold text-gray-600">Utilisateur</th>
                <th className="text-xs font-semibold text-gray-600 hidden md:table-cell">Service</th>
                <th className="text-xs font-semibold text-gray-600 hidden lg:table-cell">Poste</th>
                <th className="text-xs font-semibold text-gray-600">Rôles</th>
                <th className="text-xs font-semibold text-gray-600 text-right w-24">Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginated.map(u => (
                <tr key={u.id} className="hover:bg-gray-50/50 border-b border-gray-100 last:border-0 transition-colors">
                  <td>
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0
                        ${u.is_admin ? 'bg-red-500' : u.is_dg ? 'bg-amber-500' : u.is_drh ? 'bg-emerald-500' : u.is_directeur ? 'bg-purple-500' : 'bg-blue-500'}`}>
                        {u.name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || '??'}
                      </div>
                      <div className="min-w-0">
                        <div className="font-medium text-sm text-gray-900 truncate">{u.name}</div>
                        <div className="text-xs text-gray-400 truncate">{u.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="hidden md:table-cell">
                    <span className="text-xs text-gray-600 bg-gray-100 px-2 py-0.5 rounded-full">{u.department || '—'}</span>
                  </td>
                  <td className="hidden lg:table-cell">
                    <span className="text-xs text-gray-500">{u.poste || '—'}</span>
                  </td>
                  <td>
                    <div className="flex flex-wrap gap-1">{roleBadges(u)}</div>
                  </td>
                  <td>
                    <div className="flex justify-end gap-0.5">
                      <button onClick={() => setEditUser(u)} className="btn btn-ghost btn-xs text-gray-500 hover:text-blue-600" title="Modifier">
                        <EditIcon className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => handleResetPassword(u.id)} className="btn btn-ghost btn-xs text-gray-500 hover:text-amber-600" title="Réinitialiser le mot de passe">
                        <LockIcon className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => setShowDelete(u)} className="btn btn-ghost btn-xs text-gray-500 hover:text-red-600" title="Supprimer">
                        <TrashIcon className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {paginated.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-center py-12">
                    <div className="flex flex-col items-center gap-2 text-gray-400">
                      <SearchIcon className="w-8 h-8 opacity-30" />
                      <span className="text-sm">Aucun utilisateur trouvé</span>
                      {(search || roleFilter || deptFilter) && (
                        <button onClick={() => { setSearch(''); setRoleFilter(''); setDeptFilter('') }} className="text-xs text-blue-500 hover:underline">
                          Effacer les filtres
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50/50">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={safePage <= 1}
              className="btn btn-ghost btn-xs gap-1 text-gray-600 disabled:opacity-30"
            >
              <ChevronLeftIcon className="w-4 h-4 rotate-180" /> Précédent
            </button>
            <div className="flex gap-1">
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter(p => p === 1 || p === totalPages || Math.abs(p - safePage) <= 2)
                .reduce((acc, p, i, arr) => {
                  if (i > 0 && p - arr[i - 1] > 1) acc.push('...')
                  acc.push(p)
                  return acc
                }, [])
                .map((p, i) => p === '...' ? (
                  <span key={`dots-${i}`} className="px-2 py-1 text-xs text-gray-400">…</span>
                ) : (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    className={`w-8 h-8 rounded-lg text-xs font-medium transition-all
                      ${p === safePage
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'text-gray-600 hover:bg-gray-200'}`}
                  >
                    {p}
                  </button>
                ))}
            </div>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={safePage >= totalPages}
              className="btn btn-ghost btn-xs gap-1 text-gray-600 disabled:opacity-30"
            >
              Suivant <ChevronLeftIcon className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Edit User Modal */}
      <EditUserModal user={editUser} onClose={() => setEditUser(null)} onSave={handleUpdate} departments={departments} />

      {/* Delete Confirmation Modal */}
      <Modal open={!!showDelete} onClose={() => setShowDelete(null)} title="Supprimer l'utilisateur" size="sm">
        {showDelete && (
          <div>
            <p className="mb-4 text-sm text-gray-600">
              Voulez-vous vraiment supprimer <strong className="text-gray-900">{showDelete.name}</strong> ?
              <br /><span className="text-xs text-gray-400">{showDelete.email}</span>
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowDelete(null)} className="btn btn-ghost btn-sm">Annuler</button>
              <button onClick={() => handleDelete(showDelete.id)} className="btn btn-error btn-sm">Supprimer</button>
            </div>
          </div>
        )}
      </Modal>

      {/* LDAP Search Modal */}
      <Modal open={showLdap} onClose={() => { setShowLdap(false); setLdapResults([]); setLdapSearch('') }} title="Ajouter depuis LDAP" size="lg">
        <div className="space-y-4">
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <SearchIcon className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Rechercher dans l'annuaire (nom ou email)..."
                className="input input-bordered input-sm w-full pl-9"
                value={ldapSearch}
                onChange={(e) => setLdapSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleLdapSearch()}
                autoFocus
              />
            </div>
            <button onClick={handleLdapSearch} className={`btn btn-primary btn-sm ${ldapLoading ? 'loading' : ''}`} disabled={ldapLoading || ldapSearch.length < 2}>
              {ldapLoading ? <span className="loading loading-spinner loading-sm"></span> : <SearchIcon className="w-4 h-4" />}
            </button>
          </div>
          {ldapResults.length > 0 && (
            <div className="overflow-x-auto max-h-96 overflow-y-auto rounded-lg border border-gray-200">
              <table className="table table-sm">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="text-xs">Nom</th>
                    <th className="text-xs">Email</th>
                    <th className="text-xs hidden sm:table-cell">Poste</th>
                    <th className="text-xs hidden sm:table-cell">Département</th>
                    <th className="text-xs"></th>
                  </tr>
                </thead>
                <tbody>
                  {ldapResults.map((entry, i) => {
                    const exists = users.some(u => u.email === entry.email)
                    return (
                      <tr key={i} className={`hover ${exists ? 'bg-green-50' : ''}`}>
                        <td className="text-sm font-medium">{entry.name}</td>
                        <td className="text-xs text-gray-500">{entry.email}</td>
                        <td className="text-xs hidden sm:table-cell">{entry.title}</td>
                        <td className="text-xs hidden sm:table-cell">
                          <span className="bg-gray-100 px-2 py-0.5 rounded-full">{entry.department}</span>
                        </td>
                        <td>
                          {exists ? (
                            <span className="badge badge-success badge-sm">Ajouté</span>
                          ) : (
                            <button onClick={() => handleCreateFromLdap(entry)} className="btn btn-primary btn-xs">
                              Ajouter
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
          {ldapSearch.length >= 2 && ldapResults.length === 0 && !ldapLoading && (
            <div className="text-center py-8 text-gray-400">
              <SearchIcon className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Aucun résultat trouvé</p>
            </div>
          )}
          {ldapSearch.length < 2 && ldapResults.length === 0 && (
            <div className="text-center py-8 text-gray-400">
              <UsersIcon className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Tapez au moins 2 caractères pour rechercher</p>
            </div>
          )}
        </div>
      </Modal>
    </div>
  )
}

function LockIcon(props) {
  return (
    <svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
    </svg>
  )
}

function EditUserModal({ user, onClose, onSave, departments }) {
  const [form, setForm] = useState({
    name: '',
    email: '',
    poste: '',
    department: '',
    is_validator_n1: false,
    is_directeur: false,
    is_drh: false,
    is_dg: false,
    is_admin: false,
  })

  useEffect(() => {
    if (user) {
      setForm({
        name: user.name || '',
        email: user.email || '',
        poste: user.poste || '',
        department: user.department || '',
        is_validator_n1: user.is_validator_n1 || false,
        is_directeur: user.is_directeur || false,
        is_drh: user.is_drh || false,
        is_dg: user.is_dg || false,
        is_admin: user.is_admin || false,
      })
    }
  }, [user])

  const handleSubmit = (e) => {
    e.preventDefault()
    onSave(user.id, {
      name: form.name,
      poste: form.poste,
      department: form.department,
      is_validator_n1: form.is_validator_n1,
      is_directeur: form.is_directeur,
      is_drh: form.is_drh,
      is_dg: form.is_dg,
      is_admin: form.is_admin,
    })
  }

  return (
    <Modal open={!!user} onClose={onClose} title="Modifier l'utilisateur" size="lg">
      {user && (
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* User info header */}
          <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0
              ${form.is_admin ? 'bg-red-500' : form.is_dg ? 'bg-amber-500' : form.is_drh ? 'bg-emerald-500' : 'bg-blue-500'}`}>
              {form.name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || '??'}
            </div>
            <div>
              <div className="font-semibold text-sm">{form.name || '—'}</div>
              <div className="text-xs text-gray-400">{form.email}</div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="form-control">
              <label className="label py-1"><span className="label-text text-xs font-medium">Nom complet</span></label>
              <input type="text" className="input input-bordered input-sm" value={form.name} onChange={e => setForm({...form, name: e.target.value})} required />
            </div>
            <div className="form-control">
              <label className="label py-1"><span className="label-text text-xs font-medium">Email</span></label>
              <input type="email" className="input input-bordered input-sm bg-gray-50" value={form.email} disabled />
            </div>
            <div className="form-control">
              <label className="label py-1"><span className="label-text text-xs font-medium">Poste</span></label>
              <input type="text" className="input input-bordered input-sm" value={form.poste} onChange={e => setForm({...form, poste: e.target.value})} />
            </div>
            <div className="form-control">
              <label className="label py-1"><span className="label-text text-xs font-medium">Service</span></label>
              <select className="select select-bordered select-sm" value={form.department} onChange={e => setForm({...form, department: e.target.value})}>
                <option value="">—</option>
                {departments.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="label py-1"><span className="label-text text-xs font-medium">Rôles</span></label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { key: 'is_validator_n1', label: 'Validateur N+1', color: 'border-blue-300 checked:bg-blue-500' },
                { key: 'is_directeur', label: 'Directeur', color: 'border-purple-300 checked:bg-purple-500' },
                { key: 'is_drh', label: 'DRH', color: 'border-emerald-300 checked:bg-emerald-500' },
                { key: 'is_dg', label: 'Directeur Général', color: 'border-amber-300 checked:bg-amber-500' },
                { key: 'is_admin', label: 'Admin', color: 'border-red-300 checked:bg-red-500' },
              ].map(r => (
                <label key={r.key} className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-all
                  ${form[r.key] ? 'bg-gray-50 border-gray-300' : 'border-gray-200 hover:border-gray-300'}`}>
                  <input
                    type="checkbox"
                    className={`checkbox checkbox-xs ${r.color}`}
                    checked={form[r.key]}
                    onChange={e => setForm({...form, [r.key]: e.target.checked})}
                  />
                  <span className="text-xs font-medium">{r.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-gray-100">
            <button type="button" onClick={onClose} className="btn btn-ghost btn-sm">Annuler</button>
            <button type="submit" className="btn btn-primary btn-sm">Enregistrer</button>
          </div>
        </form>
      )}
    </Modal>
  )
}
