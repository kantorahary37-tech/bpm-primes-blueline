import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import {
  getDepartments, createDepartment, renameDepartment, deleteDepartment,
  getManagerCandidates, assignDepartmentManager, clearDepartmentManager,
} from '../services/api'
import Modal from '../components/Modal'
import { useConfirm } from '../components/ConfirmModal'
import { MANAGED_BONUS_TYPES, BONUS_TYPE_LABELS } from '../constants/bonusTypes'
import { apiErrorToast } from '../utils/toastHelpers'
import toast from '../utils/toast'
import {
  BuildingIcon, PlusIcon, EditIcon, TrashIcon, SearchIcon,
  UsersIcon, ExclamationIcon, XMarkIcon, UserIcon,
} from '../components/Icons'

const MAX_NAME_LENGTH = 50

function normalize(value) {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
}

/** Initiales pour l'avatar du département (max 3 lettres). */
function initialsOf(name) {
  return name
    .split(/[\s-]+/)
    .filter(Boolean)
    .slice(0, 3)
    .map((w) => w[0])
    .join('')
    .toUpperCase() || '??'
}

/** Teinte stable dérivée du nom : chaque département garde la même couleur. */
const AVATAR_TONES = [
  'bg-blue-50 text-blue-600',
  'bg-emerald-50 text-emerald-600',
  'bg-amber-50 text-amber-600',
  'bg-purple-50 text-purple-600',
  'bg-rose-50 text-rose-600',
  'bg-cyan-50 text-cyan-600',
]

function toneFor(name) {
  let hash = 0
  for (let i = 0; i < name.length; i += 1) {
    hash = (hash * 31 + name.charCodeAt(i)) % 100000
  }
  return AVATAR_TONES[hash % AVATAR_TONES.length]
}

export default function DepartmentsPage() {
  const { confirm, confirmElement } = useConfirm()
  const [departments, setDepartments] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState(null)
  const [formName, setFormName] = useState('')
  const [formBonusTypes, setFormBonusTypes] = useState([])
  const [formError, setFormError] = useState('')
  // Modale « Directeur du département »
  const [managerFor, setManagerFor] = useState(null)
  const [candidates, setCandidates] = useState([])
  const [candidatesLoading, setCandidatesLoading] = useState(false)
  const [selectedUserId, setSelectedUserId] = useState('')
  const [savingManager, setSavingManager] = useState(false)
  const nameRef = useRef(null)

  const load = useCallback(async () => {
    try {
      const data = await getDepartments()
      setDepartments(Array.isArray(data) ? data : [])
    } catch (err) {
      apiErrorToast(err, 'Erreur lors du chargement des départements')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = useMemo(() => {
    const q = normalize(search)
    if (!q) return departments
    return departments.filter((d) => normalize(d.name).includes(q))
  }, [departments, search])

  const totalEmployees = useMemo(
    () => departments.reduce((sum, d) => sum + (d.employee_count || 0), 0),
    [departments],
  )
  const emptyDepartments = useMemo(
    () => departments.filter((d) => !d.employee_count).length,
    [departments],
  )

  /** Contrôle côté client : le backend revalide (source de vérité). */
  function validateName(value, currentId = null) {
    const name = (value || '').trim()
    if (!name) return 'Le nom du département est obligatoire.'
    if (name.length > MAX_NAME_LENGTH) {
      return `Le nom ne doit pas dépasser ${MAX_NAME_LENGTH} caractères.`
    }
    const clash = departments.find(
      (d) => d.id !== currentId && normalize(d.name) === normalize(name),
    )
    if (clash) return `Le département « ${clash.name} » existe déjà.`
    return ''
  }

  const openCreate = () => {
    setEditing('new')
    setFormName('')
    setFormError('')
    // Un nouveau département part sur les trois types gérés
    setFormBonusTypes(MANAGED_BONUS_TYPES)
  }

  const openEdit = (dept) => {
    setEditing(dept)
    setFormName(dept.name)
    setFormError('')
    setFormBonusTypes(dept.bonus_types || [])
  }

  const toggleBonusType = (type) => {
    setFormBonusTypes(prev =>
      prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type],
    )
  }

  const closeModal = () => {
    if (saving) return
    setEditing(null)
    setFormError('')
  }

  async function handleSubmit(e) {
    e?.preventDefault()
    if (saving) return

    const isNew = editing === 'new'
    const error = validateName(formName, isNew ? null : editing.id)
    if (error) {
      setFormError(error)
      return
    }

    setSaving(true)
    try {
      if (isNew) {
        await createDepartment(formName.trim(), formBonusTypes)
        toast.success(`Département « ${formName.trim()} » créé`)
      } else {
        const previous = editing.name
        const renamed = previous !== formName.trim()
        const typesChanged =
          JSON.stringify([...(editing.bonus_types || [])].sort()) !==
          JSON.stringify([...formBonusTypes].sort())
        await renameDepartment(editing.id, formName.trim(), formBonusTypes)
        if (renamed && typesChanged) {
          toast.success(`« ${previous} » renommé en « ${formName.trim()} » · types de primes mis à jour`)
        } else if (renamed) {
          toast.success(`« ${previous} » renommé en « ${formName.trim()} »`)
        } else if (typesChanged) {
          toast.success(`Types de primes mis à jour pour « ${formName.trim()} »`)
        } else {
          toast.success('Aucune modification')
        }
      }
      setEditing(null)
      await load()
    } catch (err) {
      apiErrorToast(err, isNew ? 'Création impossible' : 'Modification impossible')
    } finally {
      setSaving(false)
    }
  }

  const openManager = async (dept) => {
    setManagerFor(dept)
    setSelectedUserId(dept.director?.id ? String(dept.director.id) : '')
    setCandidatesLoading(true)
    setCandidates([])
    try {
      const data = await getManagerCandidates(dept.id)
      setCandidates(Array.isArray(data) ? data : [])
    } catch (err) {
      apiErrorToast(err, 'Impossible de charger les utilisateurs du département')
    } finally {
      setCandidatesLoading(false)
    }
  }

  const closeManager = () => {
    if (savingManager) return
    setManagerFor(null)
    setCandidates([])
    setSelectedUserId('')
  }

  async function handleSaveManager(e) {
    e?.preventDefault()
    if (savingManager || !managerFor) return
    if (!selectedUserId) {
      toast.error('Sélectionnez un utilisateur.')
      return
    }
    setSavingManager(true)
    try {
      await assignDepartmentManager(managerFor.id, Number(selectedUserId))
      const chosen = candidates.find((c) => String(c.id) === String(selectedUserId))
      toast.success(`« ${chosen?.name || 'Directeur'} » est désormais directeur de « ${managerFor.name} »`)
      setManagerFor(null)
      await load()
    } catch (err) {
      apiErrorToast(err, 'Affectation impossible')
    } finally {
      setSavingManager(false)
    }
  }

  async function handleClearManager() {
    if (savingManager || !managerFor) return
    const ok = await confirm({
      title: 'Retirer le directeur ?',
      message: `« ${managerFor.director?.name || 'Le directeur actuel'} » ne sera plus directeur de « ${managerFor.name} ».`,
      details: [
        'Les primes en attente de validation Directeur resteront sans validateur désigné.',
        'La notification de ces primes ne sera plus envoyée.',
      ],
      confirmText: 'Retirer',
      tone: 'warning',
    })
    if (!ok) return

    setSavingManager(true)
    try {
      await clearDepartmentManager(managerFor.id)
      toast.success(`Directeur de « ${managerFor.name} » retiré`)
      setManagerFor(null)
      await load()
    } catch (err) {
      apiErrorToast(err, 'Retrait impossible')
    } finally {
      setSavingManager(false)
    }
  }

  async function handleDelete(dept) {
    if (dept.employee_count) {
      toast.error(
        `« ${dept.name} » contient encore ${dept.employee_count} employé(s). Transférez-les avant de le supprimer.`,
        { duration: 6000 },
      )
      return
    }

    const ok = await confirm({
      title: 'Supprimer ce département ?',
      message: `« ${dept.name} » sera définitivement supprimé.`,
      details: ['Cette action est irréversible.'],
      confirmText: 'Supprimer',
      tone: 'danger',
    })
    if (!ok) return

    try {
      await deleteDepartment(dept.id)
      toast.success(`Département « ${dept.name} » supprimé`)
      await load()
    } catch (err) {
      apiErrorToast(err, 'Suppression impossible')
    }
  }

  const isNew = editing === 'new'

  return (
    <div className="page-container space-y-4">
      {/* En-tête */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-50 rounded-xl">
            <BuildingIcon className="w-6 h-6 text-blue-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Départements</h1>
            <p className="text-xs text-gray-400">
              {departments.length} département{departments.length > 1 ? 's' : ''} ·{' '}
              {totalEmployees} employé{totalEmployees > 1 ? 's' : ''}
            </p>
          </div>
        </div>
        <button onClick={openCreate} className="btn btn-sm gap-1 border-0 bg-blue-600 text-white hover:bg-blue-700">
          <PlusIcon className="w-4 h-4" /> Nouveau département
        </button>
      </div>

      {/* Statistiques */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex items-center gap-3">
          <div className="p-2 bg-blue-50 rounded-lg"><BuildingIcon className="w-5 h-5 text-blue-600" /></div>
          <div>
            <p className="text-xs text-gray-400 font-medium">Départements</p>
            <p className="text-lg font-bold text-gray-900">{departments.length}</p>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex items-center gap-3">
          <div className="p-2 bg-emerald-50 rounded-lg"><UsersIcon className="w-5 h-5 text-emerald-600" /></div>
          <div>
            <p className="text-xs text-gray-400 font-medium">Employés rattachés</p>
            <p className="text-lg font-bold text-gray-900">{totalEmployees}</p>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex items-center gap-3">
          <div className="p-2 bg-amber-50 rounded-lg"><ExclamationIcon className="w-5 h-5 text-amber-600" /></div>
          <div>
            <p className="text-xs text-gray-400 font-medium">Sans employé</p>
            <p className="text-lg font-bold text-gray-900">{emptyDepartments}</p>
          </div>
        </div>
      </div>

      {/* Recherche */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-3">
        <div className="relative">
          <SearchIcon className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Rechercher un département..."
            className="input input-bordered input-sm w-full pl-9 pr-8 bg-gray-50 focus:bg-white"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded-full hover:bg-gray-200 text-gray-400 hover:text-gray-600"
              title="Effacer"
            >
              <XMarkIcon className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Liste */}
      {loading ? (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8 flex justify-center">
          <span className="loading loading-spinner loading-lg text-blue-600"></span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-10 text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-gray-100 mb-3">
            <BuildingIcon className="w-6 h-6 text-gray-400" />
          </div>
          <p className="text-sm font-medium text-gray-700">
            {search ? 'Aucun département ne correspond à votre recherche' : 'Aucun département'}
          </p>
          <p className="text-xs text-gray-400 mt-1">
            {search ? 'Essayez un autre terme.' : 'Créez le premier département pour commencer.'}
          </p>
          {!search && (
            <button onClick={openCreate} className="btn btn-sm mt-4 gap-1 border-0 bg-blue-600 text-white hover:bg-blue-700">
              <PlusIcon className="w-4 h-4" /> Nouveau département
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {filtered.map((dept) => {
            const count = dept.employee_count || 0
            return (
              <div
                key={dept.id}
                className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold shrink-0 ${toneFor(dept.name)}`}>
                      {initialsOf(dept.name)}
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-sm text-gray-900 truncate" title={dept.name}>
                        {dept.name}
                      </p>
                      <p className="text-xs text-gray-400">
                        {count} employé{count > 1 ? 's' : ''}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-0.5 shrink-0">
                    <button
                      onClick={() => openManager(dept)}
                      className="btn btn-ghost btn-xs text-gray-400 hover:text-purple-600"
                      title={dept.director ? `Directeur : ${dept.director.name}` : 'Définir le directeur'}
                    >
                      <UserIcon className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => openEdit(dept)}
                      className="btn btn-ghost btn-xs text-gray-400 hover:text-blue-600"
                      title="Renommer"
                    >
                      <EditIcon className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(dept)}
                      className="btn btn-ghost btn-xs text-gray-400 hover:text-red-600 disabled:opacity-40"
                      title={count ? 'Département non vide : transférez d’abord les employés' : 'Supprimer'}
                      disabled={count > 0}
                    >
                      <TrashIcon className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="mt-3 pt-3 border-t border-gray-100 flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
                    <UserIcon className="w-3.5 h-3.5" />
                  </div>
                  {dept.director ? (
                    <div className="min-w-0">
                      <p className="text-[11px] text-gray-400 leading-none">Directeur</p>
                      <p className="text-xs font-medium text-gray-800 truncate" title={dept.director.email}>
                        {dept.director.name}
                      </p>
                    </div>
                  ) : (
                    <button
                      onClick={() => openManager(dept)}
                      className="text-[11px] text-gray-400 hover:text-blue-600 transition-colors text-left"
                    >
                      + Définir un directeur
                    </button>
                  )}
                </div>

                {/* Types de primes autorisés (assignation gestion des primes) */}
                <div className="mt-2 pt-2 border-t border-gray-100 flex flex-wrap items-center gap-1">
                  <span className="text-[11px] text-gray-400">Primes :</span>
                  {MANAGED_BONUS_TYPES.map((type) => {
                    const allowed = (dept.bonus_types || []).includes(type)
                    return allowed ? (
                      <span
                        key={type}
                        className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-blue-700 border border-blue-100"
                      >
                        {BONUS_TYPE_LABELS[type] || type}
                      </span>
                    ) : null
                  })}
                  {(dept.bonus_types || []).length === 0 && (
                    <span className="text-[10px] italic text-gray-300">aucun type géré</span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Modale création / renommage */}
      <Modal
        open={!!editing}
        onClose={closeModal}
        title={isNew ? 'Nouveau département' : 'Modifier le département'}
        size="md"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label py-1">
              <span className="label-text text-xs font-medium">Nom du département</span>
            </label>
            <input
              ref={nameRef}
              type="text"
              autoFocus
              maxLength={MAX_NAME_LENGTH}
              className={`input input-bordered input-sm w-full bg-gray-50 focus:bg-white ${formError ? 'input-error' : ''}`}
              placeholder="Ex. Direction Commerciale"
              value={formName}
              onChange={(e) => { setFormName(e.target.value); if (formError) setFormError('') }}
            />
            <div className="flex items-center justify-between mt-1">
              <span className={`text-[11px] ${formError ? 'text-red-500' : 'text-gray-400'}`}>
                {formError || `${formName.trim().length}/${MAX_NAME_LENGTH} caractères`}
              </span>
            </div>
          </div>

          {!isNew && (
            <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-[11px] text-blue-700 space-y-1">
              <p className="font-semibold">Le renommage met à jour automatiquement :</p>
              <ul className="space-y-0.5 list-disc list-inside">
                <li>les employés rattachés</li>
                <li>les utilisateurs du département</li>
                <li>les plafonds de primes</li>
              </ul>
            </div>
          )}

          {/* Assignation gestion des primes : quels types de primes ce département
              peut porter. Remplace l'ancienne liste figée dans le code. */}
          <div className="border-t border-gray-100 pt-4">
            <label className="label py-1">
              <span className="label-text text-xs font-semibold">Assignation gestion des primes</span>
            </label>
            <p className="text-[11px] text-gray-400 mb-2">
              Types de primes que les employés de ce département peuvent recevoir. Un type
              décoché n'est plus proposé à la création d'une prime et le serveur le refuse.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {MANAGED_BONUS_TYPES.map((type) => {
                const checked = formBonusTypes.includes(type)
                return (
                  <label
                    key={type}
                    className={`flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer transition-colors min-w-0 ${
                      checked
                        ? 'bg-blue-50 border-blue-300'
                        : 'bg-gray-50 border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="checkbox checkbox-sm shrink-0"
                      checked={checked}
                      onChange={() => toggleBonusType(type)}
                    />
                    <span className="text-xs font-medium text-gray-700 truncate" title={BONUS_TYPE_LABELS[type] || type}>
                      {BONUS_TYPE_LABELS[type] || type}
                    </span>
                  </label>
                )
              })}
            </div>
            {formBonusTypes.length === 0 && (
              <p className="text-[11px] text-amber-600 bg-amber-50 border border-amber-100 rounded-lg p-2 mt-2">
                Aucun type coché : aucune prime ne pourra être créée pour ce département
                (hors types non gérés, qui restent disponibles).
              </p>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
            <button type="button" onClick={closeModal} className="btn btn-sm btn-ghost" disabled={saving}>
              Annuler
            </button>
            <button
              type="submit"
              className={`btn btn-sm border-0 text-white ${isNew ? 'bg-blue-600 hover:bg-blue-700' : 'bg-emerald-600 hover:bg-emerald-700'}`}
              disabled={saving}
            >
              {saving && <span className="loading loading-spinner loading-xs"></span>}
              {isNew ? 'Créer' : 'Enregistrer'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modale : directeur du département */}
      <Modal
        open={!!managerFor}
        onClose={closeManager}
        title={managerFor ? `Directeur de « ${managerFor.name} »` : 'Directeur'}
        size="sm"
      >
        {managerFor && (
          <form onSubmit={handleSaveManager} className="space-y-4">
            <p className="text-xs text-gray-500 leading-relaxed">
              Le directeur valide les primes de son département à l'étape « Validation
              Directeur » et reçoit les notifications de rappel correspondantes.
            </p>

            {managerFor.director && (
              <div className="flex items-center justify-between gap-2 bg-purple-50 border border-purple-100 rounded-lg p-3">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-8 h-8 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center text-xs font-semibold shrink-0">
                    {managerFor.director.name?.charAt(0)?.toUpperCase() || '?'}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-purple-900 truncate">
                      {managerFor.director.name}
                    </p>
                    <p className="text-[11px] text-purple-600 truncate">{managerFor.director.email}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleClearManager}
                  disabled={savingManager}
                  className="btn btn-ghost btn-xs text-purple-700 hover:bg-purple-100 shrink-0"
                >
                  Retirer
                </button>
              </div>
            )}

            <div>
              <label className="label py-1">
                <span className="label-text text-xs font-medium">
                  {managerFor.director ? 'Remplacer par' : 'Utilisateur'}
                </span>
              </label>
              {candidatesLoading ? (
                <div className="flex items-center gap-2 py-2 text-xs text-gray-400">
                  <span className="loading loading-spinner loading-xs"></span> Chargement...
                </div>
              ) : candidates.length === 0 ? (
                <div className="bg-amber-50 border border-amber-100 rounded-lg p-3 text-[11px] text-amber-700 space-y-1">
                  <p className="font-semibold">Aucun utilisateur dans ce département.</p>
                  <p>
                    Affectez d'abord des utilisateurs à « {managerFor.name} » depuis
                    l'écran Utilisateurs : le directeur doit appartenir au département.
                  </p>
                </div>
              ) : (
                <select
                  className="select select-bordered select-sm w-full bg-gray-50 focus:bg-white"
                  value={selectedUserId}
                  onChange={(e) => setSelectedUserId(e.target.value)}
                >
                  <option value="">— Sélectionner —</option>
                  {candidates.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                      {u.poste ? ` — ${u.poste}` : ''}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {candidates.length > 1 && managerFor.director && (
              <p className="text-[11px] text-amber-600 bg-amber-50 border border-amber-100 rounded-lg p-2">
                Le rôle « Directeur » sera retiré de {managerFor.director.name} : un
                département ne peut avoir qu'un seul directeur.
              </p>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
              <button type="button" onClick={closeManager} className="btn btn-sm btn-ghost" disabled={savingManager}>
                Annuler
              </button>
              <button
                type="submit"
                className="btn btn-sm border-0 text-white bg-purple-600 hover:bg-purple-700"
                disabled={savingManager || candidatesLoading || candidates.length === 0}
              >
                {savingManager && <span className="loading loading-spinner loading-xs"></span>}
                Affecter
              </button>
            </div>
          </form>
        )}
      </Modal>

      {confirmElement}
    </div>
  )
}