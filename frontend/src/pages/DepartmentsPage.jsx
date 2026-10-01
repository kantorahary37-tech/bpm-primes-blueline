import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { getDepartments, createDepartment, renameDepartment, deleteDepartment } from '../services/api'
import Modal from '../components/Modal'
import { useConfirm } from '../components/ConfirmModal'
import { apiErrorToast } from '../utils/toastHelpers'
import toast from '../utils/toast'
import {
  BuildingIcon, PlusIcon, EditIcon, TrashIcon, SearchIcon,
  UsersIcon, ExclamationIcon, XMarkIcon,
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
  const [formError, setFormError] = useState('')
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
  }

  const openEdit = (dept) => {
    setEditing(dept)
    setFormName(dept.name)
    setFormError('')
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
        await createDepartment(formName.trim())
        toast.success(`Département « ${formName.trim()} » créé`)
      } else {
        const previous = editing.name
        await renameDepartment(editing.id, formName.trim())
        toast.success(`« ${previous} » renommé en « ${formName.trim()} »`)
      }
      setEditing(null)
      await load()
    } catch (err) {
      apiErrorToast(err, isNew ? 'Création impossible' : 'Renommage impossible')
    } finally {
      setSaving(false)
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

                <div className="mt-3 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${count ? 'bg-emerald-500' : 'bg-gray-300'}`}
                    style={{ width: count ? '100%' : '0%' }}
                  />
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
        title={isNew ? 'Nouveau département' : 'Renommer le département'}
        size="sm"
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

      {confirmElement}
    </div>
  )
}