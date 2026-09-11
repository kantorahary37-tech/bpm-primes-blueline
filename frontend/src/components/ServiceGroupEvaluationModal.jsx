import { useEffect, useState } from 'react'
import { getServices, applyServiceGroupTemplates } from '../services/api'
import Modal from './Modal'
import toast from 'react-hot-toast'

const totalCoeff = (list) => list.reduce((s, c) => s + (parseFloat(c.coeff) || 0), 0)

function CriteriaEditor({ title, badge, itemBg, accentDot, list, setList, input, setInput, onRemove }) {
  const add = () => {
    if (!input.criteria_name.trim()) return
    setList(prev => [...prev, { criteria_name: input.criteria_name.trim(), description: '', coeff: input.coeff, sort_order: 0, id: null }])
    setInput({ criteria_name: '', coeff: 1 })
  }

  return (
    <div className="rounded-xl border border-base-200 overflow-hidden">
      <div className={`flex items-center justify-between px-4 py-3 ${itemBg} border-b border-base-100`}>
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${accentDot}`}></span>
          <h3 className="text-sm font-semibold">{title}</h3>
        </div>
        <span className={`text-xs font-mono px-2 py-0.5 rounded-full ${badge}`}>
          Total coeff : {totalCoeff(list)}
        </span>
      </div>
      <div className="divide-y divide-base-100">
        {list.map((c, i) => (
          <div key={c.id || `new-${i}`} className="flex items-center gap-3 px-4 py-3 hover:bg-base-50 transition-colors">
            <span className="text-xs text-base-content/30 font-mono w-5 text-center shrink-0">{i + 1}</span>
            <div className="flex-1 min-w-0">
              <input type="text" value={c.criteria_name}
                onChange={(e) => setList(prev => prev.map((x, j) => j === i ? { ...x, criteria_name: e.target.value } : x))}
                className="input input-bordered input-sm w-full bg-white" />
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-xs text-base-content/40">Coeff</span>
              <input type="number" step="0.5" min="0" max="10" value={c.coeff}
                onChange={(e) => setList(prev => prev.map((x, j) => j === i ? { ...x, coeff: parseFloat(e.target.value) || 0 } : x))}
                className="input input-bordered input-sm w-16 text-center font-semibold bg-white" />
            </div>
            <button onClick={() => onRemove(i)}
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
        <input type="text" placeholder="Ajouter un critere..." value={input.criteria_name}
          onChange={(e) => setInput({ ...input, criteria_name: e.target.value })}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          className="input input-bordered input-sm flex-1 bg-white" />
        <span className="text-xs text-base-content/40 shrink-0">Coeff</span>
        <input type="number" step="0.5" min="0" max="10" value={input.coeff}
          onChange={(e) => setInput({ ...input, coeff: parseFloat(e.target.value) || 0 })}
          className="input input-bordered input-sm w-16 text-center bg-white" />
        <button onClick={add} className="btn btn-sm bg-brand-600 text-white border-0 px-3">+</button>
      </div>
    </div>
  )
}

export default function ServiceGroupEvaluationModal({ open, onClose, templates, onApplied }) {
  const [services, setServices] = useState([])
  const [serviceId, setServiceId] = useState('')
  const [quanti, setQuanti] = useState([])
  const [quali, setQuali] = useState([])
  const [newQuanti, setNewQuanti] = useState({ criteria_name: '', coeff: 1 })
  const [newQuali, setNewQuali] = useState({ criteria_name: '', coeff: 1 })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    getServices()
      .then(setServices)
      .catch(() => toast.error('Erreur lors du chargement des services'))
  }, [open])

  const unassignedCount = templates.filter(t => !t.service_group).length
  const serviceOptions = [
    ...services,
    { id: 'none', name: 'Sans service', department: '', employee_count: unassignedCount },
  ]
  const selectedOption = serviceOptions.find(s => String(s.id) === serviceId) || null

  const selectService = (value) => {
    setServiceId(String(value))
    setNewQuanti({ criteria_name: '', coeff: 1 })
    setNewQuali({ criteria_name: '', coeff: 1 })
    if (value === 'none') {
      const sample = templates.find(t => !t.service_group)
      setQuanti(sample ? [...sample.quantitative] : [])
      setQuali(sample ? [...sample.qualitative] : [])
      return
    }
    const svc = services.find(s => s.id === Number(value))
    if (!svc) { setQuanti([]); setQuali([]); return }
    const sample = templates.find(t => t.service_group === svc.name)
    setQuanti(sample ? [...sample.quantitative] : [])
    setQuali(sample ? [...sample.qualitative] : [])
  }

  const reset = () => {
    setServiceId('')
    setQuanti([])
    setQuali([])
    setNewQuanti({ criteria_name: '', coeff: 1 })
    setNewQuali({ criteria_name: '', coeff: 1 })
  }

  const close = () => { reset(); onClose() }

  const handleApply = async () => {
    if (!serviceId) return
    setSaving(true)
    try {
      const res = await applyServiceGroupTemplates({
        service_group_id: serviceId === 'none' ? null : Number(serviceId),
        quantitative: quanti.map((c, i) => ({ criteria_name: c.criteria_name, description: c.description || '', coeff: c.coeff, sort_order: i })),
        qualitative: quali.map((c, i) => ({ criteria_name: c.criteria_name, description: c.description || '', coeff: c.coeff, sort_order: i })),
      })
      toast.success(res.message || 'Evaluation appliquee au service')
      close()
      onApplied && onApplied()
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Erreur lors de l'application de l'evaluation")
    } finally {
      setSaving(false)
    }
  }

  const total = totalCoeff(quanti) + totalCoeff(quali)
  const canApply = !!selectedOption && selectedOption.employee_count > 0 && total === 10 && !saving

  return (
    <Modal open={open} onClose={close} title="Evaluation par service" size="xl">
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-base-content/60 mb-1.5">Service</label>
            <select
              value={serviceId}
              onChange={(e) => selectService(e.target.value)}
              className="select select-bordered select-sm w-full bg-white"
            >
              <option value="">-- Choisir un service --</option>
              {serviceOptions.map(s => (
                <option key={s.id} value={s.id}>
                  {s.name}{s.department ? ` (${s.department})` : ''} — {s.employee_count} employe{s.employee_count > 1 ? 's' : ''}
                </option>
              ))}
            </select>
          {selectedOption && selectedOption.employee_count === 0 && (
            <p className="text-xs text-amber-600 mt-1.5 font-medium">{selectedOption.id === 'none' ? 'Aucun employe actif sans service.' : 'Ce service ne contient aucun employe actif.'}</p>
          )}
          {selectedOption && selectedOption.employee_count > 0 && (
            <p className="text-xs text-base-content/40 mt-1.5">
              {selectedOption.name} : {selectedOption.employee_count} employe(s) recevront exactement les memes criteres.
              Les modeles individuels existants sont remplaces.
            </p>
          )}
        </div>

        <CriteriaEditor
          title="Evaluation Quantitative"
          badge="text-blue-600 bg-blue-100"
          itemBg="bg-blue-50"
          accentDot="bg-blue-500"
          list={quanti}
          setList={setQuanti}
          input={newQuanti}
          setInput={setNewQuanti}
          onRemove={(i) => setQuanti(prev => prev.filter((_, j) => j !== i))}
        />

        <CriteriaEditor
          title="Evaluation Qualitative"
          badge="text-emerald-600 bg-emerald-100"
          itemBg="bg-emerald-50"
          accentDot="bg-emerald-500"
          list={quali}
          setList={setQuali}
          input={newQuali}
          setInput={setNewQuali}
          onRemove={(i) => setQuali(prev => prev.filter((_, j) => j !== i))}
        />

        {total !== 10 && (
          <p className="text-xs text-red-500 font-medium">Le total des coefficients doit etre egal a 10 (actuel : {total})</p>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button onClick={close} className="btn btn-sm btn-ghost">Annuler</button>
          <button
            onClick={handleApply}
            disabled={!canApply}
            className="btn btn-sm bg-brand-600 hover:bg-brand-700 text-white border-0 disabled:bg-gray-300 disabled:text-gray-500"
          >
            {saving ? 'Application...' : 'Appliquer a tout le service'}
          </button>
        </div>
      </div>
    </Modal>
  )
}