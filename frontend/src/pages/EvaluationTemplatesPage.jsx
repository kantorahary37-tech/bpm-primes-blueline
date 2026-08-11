import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { getAllEvaluationTemplates, saveEvaluationTemplates, deleteEvaluationTemplate } from '../services/api'
import Modal from '../components/Modal'
import toast from 'react-hot-toast'

export default function EvaluationTemplatesPage() {
  const { user: currentUser } = useAuth()
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedDept, setSelectedDept] = useState(null)
  const [editQuantitative, setEditQuantitative] = useState([])
  const [editQualitative, setEditQualitative] = useState([])
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [newQuanti, setNewQuanti] = useState({ criteria_name: '', coeff: 1 })
  const [newQuali, setNewQuali] = useState({ criteria_name: '', coeff: 1 })
  const [hasChanges, setHasChanges] = useState(false)

  const load = useCallback(async () => {
    try {
      const data = await getAllEvaluationTemplates()
      setTemplates(data)
    } catch {
      toast.error('Erreur lors du chargement')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const selectDept = (dept) => {
    const t = templates.find(t => t.department === dept)
    if (!t) return
    setSelectedDept(dept)
    setEditQuantitative([...t.quantitative])
    setEditQualitative([...t.qualitative])
    setHasChanges(false)
  }

  const handleSave = async () => {
    if (!selectedDept) return
    setSaving(true)
    try {
      await saveEvaluationTemplates({
        department: selectedDept,
        quantitative: editQuantitative.map((c, i) => ({
          criteria_name: c.criteria_name,
          description: c.description || '',
          coeff: c.coeff,
          sort_order: i,
        })),
        qualitative: editQualitative.map((c, i) => ({
          criteria_name: c.criteria_name,
          description: c.description || '',
          coeff: c.coeff,
          sort_order: i,
        })),
      })
      toast.success('Modele sauvegarde !')
      setHasChanges(false)
      await load()
    } catch {
      toast.error('Erreur lors de la sauvegarde')
    } finally {
      setSaving(false)
    }
  }

  const doDelete = async () => {
    if (!confirmDelete) return
    try {
      await deleteEvaluationTemplate(confirmDelete.id)
      if (confirmDelete.section === 'quanti') {
        setEditQuantitative(prev => prev.filter(c => c.id !== confirmDelete.id))
      } else {
        setEditQualitative(prev => prev.filter(c => c.id !== confirmDelete.id))
      }
      setHasChanges(true)
      toast.success('Critere supprime')
    } catch {
      toast.error('Erreur lors de la suppression')
    }
    setConfirmDelete(null)
  }

  const addCriteria = (section) => {
    const input = section === 'quanti' ? newQuanti : newQuali
    if (!input.criteria_name.trim()) return
    const item = { criteria_name: input.criteria_name.trim(), description: '', coeff: input.coeff, sort_order: 0, id: null }
    if (section === 'quanti') {
      setEditQuantitative(prev => [...prev, item])
      setNewQuanti({ criteria_name: '', coeff: 1 })
    } else {
      setEditQualitative(prev => [...prev, item])
      setNewQuali({ criteria_name: '', coeff: 1 })
    }
    setHasChanges(true)
  }

  const updateCriteria = (section, index, field, value) => {
    const setter = section === 'quanti' ? setEditQuantitative : setEditQualitative
    setter(prev => prev.map((c, i) => i === index ? { ...c, [field]: field === 'coeff' ? parseFloat(value) || 0 : value } : c))
    setHasChanges(true)
  }

  const removeCriteria = (section, index) => {
    if (section === 'quanti') {
      setEditQuantitative(prev => prev.filter((_, i) => i !== index))
    } else {
      setEditQualitative(prev => prev.filter((_, i) => i !== index))
    }
    setHasChanges(true)
  }

  const totalCoeff = (list) => list.reduce((s, c) => s + (parseFloat(c.coeff) || 0), 0)

  if (!currentUser?.is_admin && !currentUser?.is_dg && !currentUser?.is_drh) {
    return <div className="page-container"><div className="card-blueline p-8 text-center"><p className="text-base-content/60">Acces reserve aux administrateurs.</p></div></div>
  }

  const renderSection = (title, icon, color, list, setList, section, newInput, setNewInput) => {
    const total = totalCoeff(list)
    return (
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className={`px-5 py-3.5 flex items-center justify-between border-b border-gray-100`}>
          <div className="flex items-center gap-2.5">
            <div className={`w-8 h-8 rounded-lg ${color} flex items-center justify-center text-sm`}>{icon}</div>
            <div>
              <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
              <p className="text-[11px] text-gray-400">{list.length} critere{list.length > 1 ? 's' : ''}</p>
            </div>
          </div>
          <div className="text-right">
            <span className="text-lg font-bold text-gray-900">{total}</span>
            <p className="text-[10px] text-gray-400">/ 10 coeff</p>
          </div>
        </div>

        <div className="divide-y divide-gray-50">
          {list.map((c, i) => (
            <div key={c.id || `new-${section}-${i}`} className="px-5 py-3 flex items-center gap-3 hover:bg-gray-50/50 transition-colors group">
              <span className="w-6 h-6 rounded-full bg-gray-100 text-gray-500 flex items-center justify-center text-[11px] font-medium shrink-0">
                {i + 1}
              </span>
              <div className="flex-1 min-w-0">
                <input type="text" value={c.criteria_name}
                  onChange={(e) => updateCriteria(section, i, 'criteria_name', e.target.value)}
                  className="w-full text-sm font-medium text-gray-900 bg-transparent border-none outline-none focus:ring-0 p-0"
                  placeholder="Nom du critere..." />
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-[10px] text-gray-400 hidden sm:inline">Coeff</span>
                <input type="number" step="0.5" min="0" max="10" value={c.coeff}
                  onChange={(e) => updateCriteria(section, i, 'coeff', e.target.value)}
                  className="w-14 text-center text-sm font-semibold text-gray-900 bg-gray-100 rounded-lg border-none outline-none py-1 focus:ring-2 focus:ring-blue-200" />
              </div>
              <button onClick={() => {
                if (c.id) setConfirmDelete({ section, id: c.id })
                else removeCriteria(section, i)
              }}
                className="w-6 h-6 rounded-md flex items-center justify-center text-gray-300 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all shrink-0">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
        </div>

        <div className="px-5 py-3 bg-gray-50/80 border-t border-gray-100">
          <div className="flex items-center gap-2">
            <input type="text" placeholder="Ajouter un critere..." value={newInput.criteria_name}
              onChange={(e) => setNewInput({ ...newInput, criteria_name: e.target.value })}
              onKeyDown={(e) => e.key === 'Enter' && addCriteria(section)}
              className="flex-1 text-sm bg-white border border-gray-200 rounded-lg px-3 py-1.5 outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-300 transition-all" />
            <input type="number" step="0.5" min="0" max="10" value={newInput.coeff}
              onChange={(e) => setNewInput({ ...newInput, coeff: parseFloat(e.target.value) || 0 })}
              className="w-14 text-center text-sm font-medium bg-white border border-gray-200 rounded-lg py-1.5 outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-300 transition-all" />
            <button onClick={() => addCriteria(section)}
              className="w-8 h-8 rounded-lg bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center transition-colors shrink-0">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="page-container">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Modeles d'evaluation</h1>
          <p className="text-sm text-gray-500 mt-1">Criteres d'evaluation par departement</p>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center p-8"><span className="loading loading-spinner loading-lg"></span></div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1">
            <div className="bg-white rounded-xl border border-gray-200 p-2">
              <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-3 py-2">Departements</h2>
              <div className="space-y-0.5">
                {templates.map(t => (
                  <button key={t.department} onClick={() => selectDept(t.department)}
                    className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-all ${
                      selectedDept === t.department
                        ? 'bg-blue-50 text-blue-700 font-medium shadow-sm'
                        : 'text-gray-600 hover:bg-gray-50'
                    }`}>
                    <div className="flex items-center justify-between">
                      <span className="truncate text-[13px]">{t.department.replace('Direction ', '')}</span>
                      {t.is_default ? (
                        <span className="text-[9px] bg-gray-100 text-gray-400 px-1.5 py-0.5 rounded-full font-medium">defaut</span>
                      ) : (
                        <span className="text-[9px] bg-emerald-50 text-emerald-600 px-1.5 py-0.5 rounded-full font-medium">custom</span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="lg:col-span-2">
            {selectedDept ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-bold text-gray-900">{selectedDept}</h2>
                  <button onClick={handleSave} disabled={saving || !hasChanges}
                    className={`btn btn-sm border-0 text-white transition-all ${
                      hasChanges ? 'bg-blue-600 hover:bg-blue-700 shadow-md shadow-blue-200' : 'bg-gray-300 cursor-not-allowed'
                    }`}>
                    {saving ? (
                      <span className="flex items-center gap-2"><span className="loading loading-spinner loading-xs"></span> Sauvegarde...</span>
                    ) : 'Sauvegarder'}
                  </button>
                </div>

                {renderSection('Evaluation Quantitative', '📊', 'bg-blue-50 text-blue-600', editQuantitative, setEditQuantitative, 'quanti', newQuanti, setNewQuanti)}
                {renderSection('Evaluation Qualitative', '⭐', 'bg-amber-50 text-amber-600', editQualitative, setEditQualitative, 'quali', newQuali, setNewQuali)}

                <div className="bg-gray-50 rounded-xl border border-gray-200 px-5 py-3 flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-500">Total general</span>
                  <span className="text-xl font-bold text-gray-900">{totalCoeff(editQuantitative) + totalCoeff(editQualitative)} <span className="text-sm font-normal text-gray-400">/ 20</span></span>
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
                <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                </div>
                <p className="text-sm text-gray-400">Selectionnez un departement pour voir son modele</p>
              </div>
            )}
          </div>
        </div>
      )}

      {confirmDelete && (
        <Modal onClose={() => setConfirmDelete(null)}>
          <div className="p-6">
            <h3 className="font-semibold mb-2 text-gray-900">Supprimer ce critere ?</h3>
            <p className="text-sm text-gray-500 mb-5">Cette action est irreversible.</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirmDelete(null)} className="btn btn-sm btn-ghost">Annuler</button>
              <button onClick={doDelete} className="btn btn-sm bg-red-600 hover:bg-red-700 text-white border-0">Supprimer</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
