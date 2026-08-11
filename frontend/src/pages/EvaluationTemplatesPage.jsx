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
      await load()
    } catch {
      toast.error('Erreur lors de la sauvegarde')
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteCriteria = (section, id) => {
    if (!id) {
      if (section === 'quanti') setEditQuantitative(prev => prev.filter((_, i) => i !== [...prev].findIndex(c => !c.id)))
      return
    }
    setConfirmDelete({ section, id })
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
  }

  const updateCriteria = (section, index, field, value) => {
    const setter = section === 'quanti' ? setEditQuantitative : setEditQualitative
    setter(prev => prev.map((c, i) => i === index ? { ...c, [field]: field === 'coeff' ? parseFloat(value) || 0 : value } : c))
  }

  const totalCoeff = (list) => list.reduce((s, c) => s + (parseFloat(c.coeff) || 0), 0)

  if (!currentUser?.is_admin && !currentUser?.is_dg && !currentUser?.is_drh) {
    return <div className="page-container"><div className="card-blueline p-8 text-center"><p className="text-base-content/60">Acces reserve aux administrateurs.</p></div></div>
  }

  return (
    <div className="page-container">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-base-content">Modeles d'evaluation</h1>
          <p className="text-sm text-base-content/50 mt-1">Criteres d'evaluation par departement</p>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center p-8"><span className="loading loading-spinner loading-lg"></span></div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1">
            <div className="card-blueline p-4">
              <h2 className="text-sm font-semibold mb-3">Departements</h2>
              <div className="space-y-1">
                {templates.map(t => (
                  <button key={t.department} onClick={() => selectDept(t.department)}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                      selectedDept === t.department
                        ? 'bg-brand-50 text-brand-700 font-medium'
                        : 'text-base-content/60 hover:bg-base-200'
                    }`}>
                    <div className="flex items-center justify-between">
                      <span className="truncate">{t.department}</span>
                      {t.is_default ? (
                        <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">defaut</span>
                      ) : (
                        <span className="text-[10px] bg-green-100 text-green-600 px-1.5 py-0.5 rounded">personnalise</span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="lg:col-span-2">
            {selectedDept ? (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-bold text-base-content">{selectedDept}</h2>
                    <p className="text-xs text-base-content/40 mt-0.5">
                      {editQuantitative.length} critere(s) quantitatif(s) · {editQualitative.length} critere(s) qualitatif(s) · Coeff total : {totalCoeff(editQuantitative) + totalCoeff(editQualitative)}/10
                    </p>
                  </div>
                  <button onClick={handleSave} disabled={saving}
                    className="btn btn-sm bg-brand-600 hover:bg-brand-700 text-white border-0">
                    {saving ? 'Sauvegarde...' : 'Sauvegarder'}
                  </button>
                </div>

                {/* QUANTITATIF */}
                <div className="rounded-xl border border-base-200 overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 bg-blue-50 border-b border-blue-100">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                      <h3 className="text-sm font-semibold text-blue-800">Evaluation Quantitative</h3>
                    </div>
                    <span className="text-xs font-mono text-blue-600 bg-blue-100 px-2 py-0.5 rounded-full">
                      Total coeff : {totalCoeff(editQuantitative)}
                    </span>
                  </div>
                  <div className="divide-y divide-base-100">
                    {editQuantitative.map((c, i) => (
                      <div key={c.id || `new-q-${i}`} className="flex items-center gap-3 px-4 py-3 hover:bg-base-50 transition-colors">
                        <span className="text-xs text-base-content/30 font-mono w-5 text-center shrink-0">{i + 1}</span>
                        <div className="flex-1 min-w-0">
                          <input type="text" value={c.criteria_name}
                            onChange={(e) => updateCriteria('quanti', i, 'criteria_name', e.target.value)}
                            className="input input-bordered input-sm w-full bg-white" />
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="text-xs text-base-content/40">Coeff</span>
                          <input type="number" step="0.5" min="0" max="10" value={c.coeff}
                            onChange={(e) => updateCriteria('quanti', i, 'coeff', e.target.value)}
                            className="input input-bordered input-sm w-16 text-center font-semibold bg-white" />
                        </div>
                        <button onClick={() => handleDeleteCriteria('quanti', c.id)}
                          className="p-1.5 rounded-lg text-base-content/20 hover:text-red-500 hover:bg-red-50 transition-colors shrink-0"
                          title="Supprimer">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center gap-2 px-4 py-3 bg-base-50 border-t border-base-100">
                    <input type="text" placeholder="Ajouter un critere..." value={newQuanti.criteria_name}
                      onChange={(e) => setNewQuanti({ ...newQuanti, criteria_name: e.target.value })}
                      onKeyDown={(e) => e.key === 'Enter' && addCriteria('quanti')}
                      className="input input-bordered input-sm flex-1 bg-white" />
                    <span className="text-xs text-base-content/40 shrink-0">Coeff</span>
                    <input type="number" step="0.5" min="0" max="10" value={newQuanti.coeff}
                      onChange={(e) => setNewQuanti({ ...newQuanti, coeff: parseFloat(e.target.value) || 0 })}
                      className="input input-bordered input-sm w-16 text-center bg-white" />
                    <button onClick={() => addCriteria('quanti')}
                      className="btn btn-sm bg-brand-600 text-white border-0 px-3">+</button>
                  </div>
                </div>

                {/* QUALITATIF */}
                <div className="rounded-xl border border-base-200 overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 bg-emerald-50 border-b border-emerald-100">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                      <h3 className="text-sm font-semibold text-emerald-800">Evaluation Qualitative</h3>
                    </div>
                    <span className="text-xs font-mono text-emerald-600 bg-emerald-100 px-2 py-0.5 rounded-full">
                      Total coeff : {totalCoeff(editQualitative)}
                    </span>
                  </div>
                  <div className="divide-y divide-base-100">
                    {editQualitative.map((c, i) => (
                      <div key={c.id || `new-q-${i}`} className="flex items-center gap-3 px-4 py-3 hover:bg-base-50 transition-colors">
                        <span className="text-xs text-base-content/30 font-mono w-5 text-center shrink-0">{i + 1}</span>
                        <div className="flex-1 min-w-0">
                          <input type="text" value={c.criteria_name}
                            onChange={(e) => updateCriteria('quali', i, 'criteria_name', e.target.value)}
                            className="input input-bordered input-sm w-full bg-white" />
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="text-xs text-base-content/40">Coeff</span>
                          <input type="number" step="0.5" min="0" max="10" value={c.coeff}
                            onChange={(e) => updateCriteria('quali', i, 'coeff', e.target.value)}
                            className="input input-bordered input-sm w-16 text-center font-semibold bg-white" />
                        </div>
                        <button onClick={() => handleDeleteCriteria('quali', c.id)}
                          className="p-1.5 rounded-lg text-base-content/20 hover:text-red-500 hover:bg-red-50 transition-colors shrink-0"
                          title="Supprimer">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center gap-2 px-4 py-3 bg-base-50 border-t border-base-100">
                    <input type="text" placeholder="Ajouter un critere..." value={newQuali.criteria_name}
                      onChange={(e) => setNewQuali({ ...newQuali, criteria_name: e.target.value })}
                      onKeyDown={(e) => e.key === 'Enter' && addCriteria('quali')}
                      className="input input-bordered input-sm flex-1 bg-white" />
                    <span className="text-xs text-base-content/40 shrink-0">Coeff</span>
                    <input type="number" step="0.5" min="0" max="10" value={newQuali.coeff}
                      onChange={(e) => setNewQuali({ ...newQuali, coeff: parseFloat(e.target.value) || 0 })}
                      className="input input-bordered input-sm w-16 text-center bg-white" />
                    <button onClick={() => addCriteria('quali')}
                      className="btn btn-sm bg-brand-600 text-white border-0 px-3">+</button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="card-blueline p-8 text-center text-base-content/40 text-sm">
                Selectionnez un departement pour voir et modifier son modele d'evaluation.
              </div>
            )}
          </div>
        </div>
      )}

      {confirmDelete && (
        <Modal onClose={() => setConfirmDelete(null)}>
          <div className="p-6">
            <h3 className="font-semibold mb-3">Confirmer la suppression</h3>
            <p className="text-sm text-base-content/60 mb-4">Voulez-vous vraiment supprimer ce critere ?</p>
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
