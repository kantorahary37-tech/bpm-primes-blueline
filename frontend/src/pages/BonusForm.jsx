import { useState, useEffect } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { createBonus, getEmployees } from '../services/api'
import { useAuth } from '../contexts/AuthContext'

const typeConfig = {
  mensuel: { title: 'Prime Mensuelle', icon: '📅' },
  astreinte: { title: "Prime d'Astreinte", icon: '🌙' },
  commission: { title: 'Prime Commission', icon: '📈' },
}

export default function BonusForm() {
  const { user: connectedUser } = useAuth()
  const { type } = useParams()
  const navigate = useNavigate()
  const config = typeConfig[type]
  const today = new Date().toISOString().split('T')[0]
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0]
  const calcWeeks = (start, end) => {
    if (!start || !end) return 1
    const s = new Date(start), e = new Date(end)
    const days = Math.floor((e - s) / (1000 * 60 * 60 * 24)) + 1
    return Math.max(1, Math.ceil(days / 7))
  }

  const [employees, setEmployees] = useState([])
  const [selectedEmp, setSelectedEmp] = useState(null)

  const [employee, setEmployee] = useState({
    department: '', service: '', name: '', function: '', matricule: '',
  })
  const [manager, setManager] = useState({ name: '', function: '' })
  const [params, setParams] = useState({ startDate: today, endDate: today, maxPrime: 150000 })
  const [budgets, setBudgets] = useState({ quanti: 80000, quali: 70000 })
  const [observation, setObservation] = useState('')
  const [applyToAll, setApplyToAll] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [quantitative, setQuantitative] = useState([
    { criteria: 'Planification du travail', description: '', objective: '20%', evaluation: 0, value: 0 },
    { criteria: 'Respect des deadlines', description: '', objective: '20%', evaluation: 0, value: 0 },
    { criteria: "Capacité d'analyse", description: '', objective: '20%', evaluation: 0, value: 0 },
    { criteria: 'Respect des deadlines (doublon)', description: '', objective: '10%', evaluation: 0, value: 0 },
    { criteria: 'Exécution des tâches périodiques', description: '', objective: '30%', evaluation: 0, value: 0 },
  ])
  const [qualitative, setQualitative] = useState([
    { criteria: 'Qualité du travail', description: '', objective: '40%', evaluation: 0, value: 0 },
    { criteria: 'Initiative', description: '', objective: '30%', evaluation: 0, value: 0 },
    { criteria: "Travail d'équipe", description: '', objective: '30%', evaluation: 0, value: 0 },
  ])

  const [simpleForm, setSimpleForm] = useState({
    employee_id: '', start_date: today, end_date: today, total_amount: '',
    nb_jours_astreinte: '', taux_jour: '', prime_astreinte_amount: '',
    ca_realise: '', ca_objectif: '', taux_commission: '', commission_amount: '',
  })

  const [astreinteConfig, setAstreinteConfig] = useState({
    periodStart: monthStart, periodEnd: monthEnd, weeklyMax: 70000, interventionRate: 9000,
  })
  const [disponibilites, setDisponibilites] = useState([
    { key: 1, employee_id: '', nombre: 1 },
  ])
  const [interventions, setInterventions] = useState([
    { key: 2, employee_id: '', date: '', heure: '', motif: '', ticket: '' },
  ])
  const [additionalPrimes, setAdditionalPrimes] = useState({ exceptionnelle: 0, ponctuelle: 0 })
  const [commissionConfig, setCommissionConfig] = useState({
    periodStart: monthStart, periodEnd: monthEnd, rate: 15000,
  })
  const [sales, setSales] = useState([
    { key: 1, designation: '', nombre: 1, description: '' },
  ])
  const [commissionOptions, setCommissionOptions] = useState({
    saveAsDefault: false, customize: false,
  })

  useEffect(() => {
    getEmployees().then(setEmployees).catch(() => {})
  }, [])

  const totalQuantitative = quantitative.reduce((s, i) => s + i.value, 0)
  const totalQualitative = qualitative.reduce((s, i) => s + i.value, 0)
  const totalEval = totalQuantitative + totalQualitative

  if (!config) {
    return (
      <div className="page-container">
        <div className="card-blueline p-8 text-center">
          <p className="text-base-content/60">Type de prime invalide.</p>
          <Link to="/bonuses/new" className="btn bg-brand-600 hover:bg-brand-700 text-white border-0 mt-4">Retour</Link>
        </div>
      </div>
    )
  }

  const handleEvalChange = (list, setter, index, field, value, section) => {
    const newData = [...list]
    if (field === 'evaluation') {
      const pct = parseFloat(value) || 0
      const budget = section === 'quanti' ? budgets.quanti : budgets.quali
      newData[index].evaluation = pct
      newData[index].value = budget * (pct / 100)
    } else {
      newData[index][field] = value
    }
    setter(newData)
  }

  const handleBudgetChange = (section, value) => {
    const newVal = parseFloat(value) || 0
    if (section === 'quanti') {
      const clamped = Math.min(newVal, params.maxPrime)
      setBudgets({ quanti: clamped, quali: params.maxPrime - clamped })
    } else {
      const clamped = Math.min(newVal, params.maxPrime)
      setBudgets({ quali: clamped, quanti: params.maxPrime - clamped })
    }
  }

  const handleConfigChange = (field, value) => {
    setAstreinteConfig({ ...astreinteConfig, [field]: value })
  }

  const addDispoRow = () => {
    setDisponibilites([...disponibilites, { key: Date.now(), employee_id: '', nombre: 1 }])
  }

  const removeDispoRow = (index) => {
    setDisponibilites(disponibilites.filter((_, i) => i !== index))
  }

  const handleDispoChange = (index, field, value) => {
    const newData = [...disponibilites]
    newData[index][field] = value
    setDisponibilites(newData)
  }

  const addIntervRow = () => {
    setInterventions([...interventions, { key: Date.now(), employee_id: '', date: '', heure: '', motif: '', ticket: '' }])
  }

  const removeIntervRow = (index) => {
    setInterventions(interventions.filter((_, i) => i !== index))
  }

  const handleIntervChange = (index, field, value) => {
    const newData = [...interventions]
    newData[index][field] = value
    setInterventions(newData)
  }

  const handleSubmitAstreinte = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    const totalDispo = disponibilites.reduce((s, d) => s + (parseFloat(d.nombre) || 0) * astreinteConfig.weeklyMax, 0)
    const totalInterv = interventions.filter(i => i.employee_id).length * astreinteConfig.interventionRate
    const amount = totalDispo + totalInterv + (parseFloat(additionalPrimes.exceptionnelle) || 0) + (parseFloat(additionalPrimes.ponctuelle) || 0)
    try {
      await createBonus({
        employee_id: disponibilites.find(d => d.employee_id)?.employee_id || interventions.find(i => i.employee_id)?.employee_id,
        start_date: astreinteConfig.periodStart,
        end_date: astreinteConfig.periodEnd,
        bonus_type: 'astreinte',
        total_amount: amount,
        nb_jours_astreinte: totalDispo,
        taux_jour: astreinteConfig.weeklyMax,
        prime_astreinte_amount: totalInterv,
      })
      navigate('/bonuses')
    } catch (err) {
      setError(err.response?.data?.detail || "Erreur lors de la création")
    } finally {
      setLoading(false)
    }
  }

  const handleCommissionConfigChange = (field, value) => {
    setCommissionConfig({ ...commissionConfig, [field]: value })
  }

  const addSaleRow = () => {
    setSales([...sales, { key: Date.now(), designation: '', nombre: 1, description: '' }])
  }

  const removeSaleRow = (index) => {
    setSales(sales.filter((_, i) => i !== index))
  }

  const handleSaleChange = (index, field, value) => {
    const newData = [...sales]
    newData[index][field] = value
    setSales(newData)
  }

  const handleSubmitCommission = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    const amount = sales.reduce((s, row) => s + (parseFloat(row.nombre) || 0) * commissionConfig.rate, 0)
    try {
      await createBonus({
        employee_id: selectedEmp?.id,
        start_date: commissionConfig.periodStart,
        end_date: commissionConfig.periodEnd,
        bonus_type: 'commission',
        total_amount: amount,
        ca_realise: amount,
      })
      navigate('/bonuses')
    } catch (err) {
      setError(err.response?.data?.detail || "Erreur lors de la création")
    } finally {
      setLoading(false)
    }
  }

  const handleSimpleChange = (e) => setSimpleForm({ ...simpleForm, [e.target.name]: e.target.value })

  const handleSelectEmployee = (e) => {
    const id = parseInt(e.target.value)
    const emp = employees.find((x) => x.id === id)
    setSelectedEmp(emp)
    setSimpleForm({ ...simpleForm, employee_id: id })
    if (emp) {
      setEmployee({ department: emp.department || '', service: '', name: emp.name, function: '', matricule: emp.matricule })
    }
  }

  const handleSubmitMensuel = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    const amount = Math.min(totalEval, params.maxPrime)
    try {
      await createBonus({
        employee_id: selectedEmp?.id,
        start_date: params.startDate,
        end_date: params.endDate,
        bonus_type: 'mensuel',
        performance_score: (totalEval / params.maxPrime) * 100,
        total_amount: amount,
      })
      navigate('/bonuses')
    } catch (err) {
      setError(err.response?.data?.detail || "Erreur lors de la création")
    } finally {
      setLoading(false)
    }
  }

  const handleSubmitSimple = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const payload = {
        employee_id: parseInt(simpleForm.employee_id),
        start_date: simpleForm.start_date,
        end_date: simpleForm.end_date,
        bonus_type: type,
        total_amount: parseFloat(simpleForm.total_amount),
      }
      const extraFields = type === 'astreinte'
        ? ['nb_jours_astreinte', 'taux_jour', 'prime_astreinte_amount']
        : ['ca_realise', 'ca_objectif', 'taux_commission', 'commission_amount']
      for (const f of extraFields) {
        if (simpleForm[f]) payload[f] = parseFloat(simpleForm[f])
      }
      await createBonus(payload)
      navigate('/bonuses')
    } catch (err) {
      setError(err.response?.data?.detail || "Erreur lors de la création")
    } finally {
      setLoading(false)
    }
  }

  const renderField = (name, label, placeholder, step = 'any') => (
    <div key={name}>
      <label className="block text-sm font-medium text-base-content/70 mb-1">{label}</label>
      <input type="number" step={step} name={name} value={simpleForm[name]} onChange={handleSimpleChange}
        className="w-full px-3 py-2 rounded-lg border border-base-300 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500"
        placeholder={placeholder} />
    </div>
  )

  if (type === 'commission') {
    const totalCommission = sales.reduce((s, row) => s + (parseFloat(row.nombre) || 0) * commissionConfig.rate, 0)

    return (
      <div className="page-container max-w-5xl">
        <div className="flex items-center gap-3 mb-6">
          <Link to="/bonuses/new" className="p-2 rounded-lg hover:bg-base-200"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg></Link>
          <div><h1 className="page-title">📈 Prime Commission</h1><p className="text-sm text-base-content/50">Commission par vente</p></div>
        </div>
        {error && <div className="bg-red-50 text-red-700 text-sm rounded-lg px-4 py-3 mb-6">⚠️ {error}</div>}
        <form onSubmit={handleSubmitCommission} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="card-blueline p-6">
              <h2 className="font-semibold text-base-content mb-4">Employé</h2>
              <div>
                <label className="block text-sm font-medium text-base-content/70 mb-1">Employé</label>
                <select value={selectedEmp?.id || ''} onChange={handleSelectEmployee} className="w-full px-3 py-2 rounded-lg border border-base-300 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500">
                  <option value="">Sélectionner...</option>
                  {employees.map((e) => <option key={e.id} value={e.id}>{e.name} ({e.matricule})</option>)}
                </select>
              </div>
            </div>
            <div className="card-blueline p-6">
              <h2 className="font-semibold text-base-content mb-4">Responsable</h2>
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-base-content/70 mb-1">Nom et prénom</label>
                  <input type="text" value={connectedUser?.name || ''} readOnly className="w-full px-3 py-2 rounded-lg border border-base-200 bg-base-100 text-base-content/60" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-base-content/70 mb-1">Rôle</label>
                  <input type="text" value={connectedUser?.is_dg ? 'Directeur Général' : connectedUser?.is_drh ? 'DRH' : connectedUser?.is_directeur ? 'Directeur' : connectedUser?.is_validator_n1 ? 'Validateur N+1' : 'Utilisateur'} readOnly className="w-full px-3 py-2 rounded-lg border border-base-200 bg-base-100 text-base-content/60" />
                </div>
              </div>
            </div>
            <div className="card-blueline p-6">
              <h2 className="font-semibold text-base-content mb-4">Configuration</h2>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-base-content/70 mb-1">Début période</label>
                  <input type="date" value={commissionConfig.periodStart} onChange={(e) => handleCommissionConfigChange('periodStart', e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-base-300 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-base-content/70 mb-1">Fin période</label>
                  <input type="date" value={commissionConfig.periodEnd} onChange={(e) => handleCommissionConfigChange('periodEnd', e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-base-300 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500" />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-base-content/70 mb-1">Commission par vente (Ar)</label>
                  <input type="number" value={commissionConfig.rate} onChange={(e) => handleCommissionConfigChange('rate', e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-base-300 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500" />
                </div>
              </div>
            </div>
          </div>

          <div className="card-blueline p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-base-content">Détail des commissions</h2>
              <button type="button" onClick={addSaleRow} className="btn btn-sm bg-brand-600 hover:bg-brand-700 text-white border-0">+ Ajouter</button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-base-200">
                    <th className="text-left py-2 px-2 font-medium text-base-content/60">Désignation</th>
                    <th className="text-center py-2 px-2 font-medium text-base-content/60 w-24">Nombre</th>
                    <th className="text-left py-2 px-2 font-medium text-base-content/60">Description</th>
                    <th className="text-right py-2 px-2 font-medium text-base-content/60 w-36">Montant (Ar)</th>
                    <th className="w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {sales.map((row, i) => (
                    <tr key={row.key} className="border-b border-base-100">
                      <td className="py-1 px-2">
                        <input type="text" value={row.designation} onChange={(e) => handleSaleChange(i, 'designation', e.target.value)}
                          className="w-full px-2 py-1 rounded border border-base-200 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 text-sm" placeholder="Ex: Airfiber, 4G Litebox" />
                      </td>
                      <td className="py-1 px-2 text-center">
                        <input type="number" value={row.nombre} min="0" onChange={(e) => handleSaleChange(i, 'nombre', e.target.value)}
                          className="w-16 px-2 py-1 rounded border border-base-200 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 text-sm text-center" />
                      </td>
                      <td className="py-1 px-2">
                        <input type="text" value={row.description} onChange={(e) => handleSaleChange(i, 'description', e.target.value)}
                          className="w-full px-2 py-1 rounded border border-base-200 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 text-sm" placeholder="Client / contrat..." />
                      </td>
                      <td className="py-1 px-2 text-right font-medium">
                        {((parseFloat(row.nombre) || 0) * commissionConfig.rate).toLocaleString('fr-FR')}
                      </td>
                      <td className="py-1 px-2 text-center">
                        <button type="button" onClick={() => removeSaleRow(i)} className="text-red-500 hover:text-red-700 text-sm">✕</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="font-semibold border-t-2 border-brand-200">
                    <td colSpan="3" className="py-2 px-2 text-right">Total commission</td>
                    <td className="py-2 px-2 text-right text-brand-600">{totalCommission.toLocaleString('fr-FR')} Ar</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          <div className="card-blueline p-6">
            <div className="space-y-3">
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" checked={commissionOptions.saveAsDefault} onChange={(e) => setCommissionOptions({ ...commissionOptions, saveAsDefault: e.target.checked })}
                  className="checkbox checkbox-sm border-base-300 rounded [--chkbg:theme(colors.brand.600)] checked:border-brand-600" />
                <span className="text-sm text-base-content/70">Définir comme modèle par défaut</span>
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" checked={commissionOptions.customize} onChange={(e) => setCommissionOptions({ ...commissionOptions, customize: e.target.checked })}
                  className="checkbox checkbox-sm border-base-300 rounded [--chkbg:theme(colors.brand.600)] checked:border-brand-600" />
                <span className="text-sm text-base-content/70">Personnaliser son modèle</span>
              </label>
            </div>
          </div>

          <div className="flex gap-3 justify-end">
            <Link to="/bonuses/new" className="btn btn-ghost">Annuler</Link>
            <button type="submit" disabled={loading} className="btn bg-brand-600 hover:bg-brand-700 text-white border-0">
              {loading ? <span className="loading loading-spinner" /> : 'Valider/Suivant'}
            </button>
          </div>
        </form>
      </div>
    )
  }

  if (type === 'astreinte') {
    const weeks = calcWeeks(astreinteConfig.periodStart, astreinteConfig.periodEnd)
    const totalDispo = disponibilites.reduce((s, d) => s + (parseFloat(d.nombre) || 0) * astreinteConfig.weeklyMax, 0)
    const totalInterv = interventions.filter(i => i.employee_id).length * astreinteConfig.interventionRate
    const totalGeneral = totalDispo + totalInterv + (parseFloat(additionalPrimes.exceptionnelle) || 0) + (parseFloat(additionalPrimes.ponctuelle) || 0)
    const employeeTotals = {}
    disponibilites.forEach(d => {
      if (!d.employee_id) return
      const emp = employees.find(e => e.id === d.employee_id)
      if (!employeeTotals[d.employee_id]) employeeTotals[d.employee_id] = { name: emp ? emp.name : `#${d.employee_id}`, dispo: 0, interv: 0 }
      employeeTotals[d.employee_id].dispo += (parseFloat(d.nombre) || 0) * astreinteConfig.weeklyMax
    })
    interventions.forEach(iv => {
      if (!iv.employee_id) return
      const emp = employees.find(e => e.id === iv.employee_id)
      if (!employeeTotals[iv.employee_id]) employeeTotals[iv.employee_id] = { name: emp ? emp.name : `#${iv.employee_id}`, dispo: 0, interv: 0 }
      employeeTotals[iv.employee_id].interv += astreinteConfig.interventionRate
    })

    return (
      <div className="page-container max-w-5xl">
        <div className="flex items-center gap-3 mb-6">
          <Link to="/bonuses/new" className="p-2 rounded-lg hover:bg-base-200"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg></Link>
          <div><h1 className="page-title">🌙 Prime d'Astreinte</h1><p className="text-sm text-base-content/50">Gestion des astreintes et interventions</p></div>
        </div>
        {error && <div className="bg-red-50 text-red-700 text-sm rounded-lg px-4 py-3 mb-6">⚠️ {error}</div>}
        <form onSubmit={handleSubmitAstreinte} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="card-blueline p-6">
              <h2 className="font-semibold text-base-content mb-4">Responsable</h2>
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-base-content/70 mb-1">Nom et prénom</label>
                  <input type="text" value={connectedUser?.name || ''} readOnly className="w-full px-3 py-2 rounded-lg border border-base-200 bg-base-100 text-base-content/60" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-base-content/70 mb-1">Rôle</label>
                  <input type="text" value={connectedUser?.is_dg ? 'Directeur Général' : connectedUser?.is_drh ? 'DRH' : connectedUser?.is_directeur ? 'Directeur' : connectedUser?.is_validator_n1 ? 'Validateur N+1' : 'Utilisateur'} readOnly className="w-full px-3 py-2 rounded-lg border border-base-200 bg-base-100 text-base-content/60" />
                </div>
              </div>
            </div>
            <div className="card-blueline p-6">
              <h2 className="font-semibold text-base-content mb-4">Configuration</h2>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-base-content/70 mb-1">Début période</label>
                  <input type="date" value={astreinteConfig.periodStart} onChange={(e) => handleConfigChange('periodStart', e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-base-300 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-base-content/70 mb-1">Fin période</label>
                  <input type="date" value={astreinteConfig.periodEnd} onChange={(e) => handleConfigChange('periodEnd', e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-base-300 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-base-content/70 mb-1">Nombre de semaines</label>
                  <input type="number" value={calcWeeks(astreinteConfig.periodStart, astreinteConfig.periodEnd)} readOnly
                    className="w-full px-3 py-2 rounded-lg border border-base-200 bg-base-100 text-base-content/60" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-base-content/70 mb-1">Prime max / semaine (Ar)</label>
                  <input type="number" value={astreinteConfig.weeklyMax} onChange={(e) => handleConfigChange('weeklyMax', e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-base-300 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500" />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-base-content/70 mb-1">Taux par intervention (Ar)</label>
                  <input type="number" value={astreinteConfig.interventionRate} onChange={(e) => handleConfigChange('interventionRate', e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-base-300 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500" />
                </div>
              </div>
            </div>
          </div>

          <div className="card-blueline p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-base-content">Disponibilité</h2>
              <button type="button" onClick={addDispoRow} className="btn btn-sm bg-brand-600 hover:bg-brand-700 text-white border-0">+ Ajouter</button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-base-200">
                    <th className="text-left py-2 px-2 font-medium text-base-content/60">Employé</th>
                    <th className="text-center py-2 px-2 font-medium text-base-content/60 w-24">Nombre</th>
                    <th className="text-right py-2 px-2 font-medium text-base-content/60 w-36">Montant (Ar)</th>
                    <th className="w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {disponibilites.map((d, i) => (
                    <tr key={d.key} className="border-b border-base-100">
                      <td className="py-1 px-2">
                        <select value={d.employee_id} onChange={(e) => handleDispoChange(i, 'employee_id', parseInt(e.target.value))}
                          className="w-full px-2 py-1 rounded border border-base-200 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 text-sm">
                          <option value="">Sélectionner...</option>
                          {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
                        </select>
                      </td>
                      <td className="py-1 px-2 text-center">
                        <input type="number" value={d.nombre} min="0" max={weeks} onChange={(e) => handleDispoChange(i, 'nombre', e.target.value)}
                          className={`w-16 px-2 py-1 rounded border text-sm text-center focus:outline-none focus:ring-2 focus:ring-brand-500/30 ${(parseFloat(d.nombre) || 0) > weeks ? 'border-red-400 bg-red-50' : 'border-base-200'}`} />
                        {(parseFloat(d.nombre) || 0) > weeks && <span className="text-red-500 text-xs block">max {weeks}</span>}
                      </td>
                      <td className="py-1 px-2 text-right font-medium">
                        {((parseFloat(d.nombre) || 0) * astreinteConfig.weeklyMax).toLocaleString('fr-FR')}
                      </td>
                      <td className="py-1 px-2 text-center">
                        <button type="button" onClick={() => removeDispoRow(i)} className="text-red-500 hover:text-red-700 text-sm">✕</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="font-semibold border-t-2 border-brand-200">
                    <td colSpan="2" className="py-2 px-2 text-right">Total Disponibilité</td>
                    <td className="py-2 px-2 text-right text-brand-600">{totalDispo.toLocaleString('fr-FR')} Ar</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          <div className="card-blueline p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-semibold text-base-content">Interventions</h2>
                <p className="text-xs text-base-content/50">Taux : {Number(astreinteConfig.interventionRate).toLocaleString('fr-FR')} Ar / intervention</p>
              </div>
              <button type="button" onClick={addIntervRow} className="btn btn-sm bg-brand-600 hover:bg-brand-700 text-white border-0">+ Ajouter</button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-base-200">
                    <th className="text-left py-2 px-2 font-medium text-base-content/60">Employé</th>
                    <th className="text-center py-2 px-2 font-medium text-base-content/60">Date</th>
                    <th className="text-center py-2 px-2 font-medium text-base-content/60">Heure</th>
                    <th className="text-left py-2 px-2 font-medium text-base-content/60">Motif</th>
                    <th className="text-center py-2 px-2 font-medium text-base-content/60">Ticket</th>
                    <th className="text-right py-2 px-2 font-medium text-base-content/60">Montant (Ar)</th>
                    <th className="w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {interventions.map((iv, i) => (
                    <tr key={iv.key} className="border-b border-base-100">
                      <td className="py-1 px-2">
                        <select value={iv.employee_id} onChange={(e) => handleIntervChange(i, 'employee_id', parseInt(e.target.value))}
                          className="w-full px-2 py-1 rounded border border-base-200 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 text-sm">
                          <option value="">Sélectionner...</option>
                          {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
                        </select>
                      </td>
                      <td className="py-1 px-2">
                        <input type="date" value={iv.date} min={astreinteConfig.periodStart} max={astreinteConfig.periodEnd} onChange={(e) => handleIntervChange(i, 'date', e.target.value)}
                          className="w-full px-2 py-1 rounded border border-base-200 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 text-sm" />
                      </td>
                      <td className="py-1 px-2">
                        <input type="time" value={iv.heure} onChange={(e) => handleIntervChange(i, 'heure', e.target.value)}
                          className="w-full px-2 py-1 rounded border border-base-200 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 text-sm" />
                      </td>
                      <td className="py-1 px-2">
                        <input type="text" value={iv.motif} onChange={(e) => handleIntervChange(i, 'motif', e.target.value)}
                          className="w-full px-2 py-1 rounded border border-base-200 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 text-sm" placeholder="Motif de l'appel" />
                      </td>
                      <td className="py-1 px-2">
                        <input type="text" value={iv.ticket} onChange={(e) => handleIntervChange(i, 'ticket', e.target.value)}
                          className="w-24 px-2 py-1 rounded border border-base-200 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 text-sm" placeholder="N° ticket" />
                      </td>
                      <td className="py-1 px-2 text-right font-medium">
                        {iv.employee_id ? Number(astreinteConfig.interventionRate).toLocaleString('fr-FR') : '—'}
                      </td>
                      <td className="py-1 px-2 text-center">
                        <button type="button" onClick={() => removeIntervRow(i)} className="text-red-500 hover:text-red-700 text-sm">✕</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="font-semibold border-t-2 border-brand-200">
                    <td colSpan="5" className="py-2 px-2 text-right">Total Interventions</td>
                    <td className="py-2 px-2 text-right text-brand-600">{totalInterv.toLocaleString('fr-FR')} Ar</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          <div className="card-blueline p-6">
            <h2 className="font-semibold text-base-content mb-4">Récapitulatif par employé</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-base-200">
                    <th className="text-left py-2 px-2 font-medium text-base-content/60">Employé</th>
                    <th className="text-right py-2 px-2 font-medium text-base-content/60">Disponibilité</th>
                    <th className="text-right py-2 px-2 font-medium text-base-content/60">Interventions</th>
                    <th className="text-right py-2 px-2 font-medium text-base-content/60">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(employeeTotals).map(([id, e]) => (
                    <tr key={id} className="border-b border-base-100">
                      <td className="py-2 px-2 font-medium">{e.name}</td>
                      <td className="py-2 px-2 text-right">{e.dispo.toLocaleString('fr-FR')} Ar</td>
                      <td className="py-2 px-2 text-right">{e.interv.toLocaleString('fr-FR')} Ar</td>
                      <td className="py-2 px-2 text-right font-semibold">{(e.dispo + e.interv).toLocaleString('fr-FR')} Ar</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="border-t border-base-200 pt-3 mt-3 grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-base-content/70 mb-1">Prime exceptionnelle (Ar)</label>
                <input type="number" value={additionalPrimes.exceptionnelle} onChange={(e) => setAdditionalPrimes({ ...additionalPrimes, exceptionnelle: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-base-300 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-base-content/70 mb-1">Prime ponctuelle (Ar)</label>
                <input type="number" value={additionalPrimes.ponctuelle} onChange={(e) => setAdditionalPrimes({ ...additionalPrimes, ponctuelle: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-base-300 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500" />
              </div>
            </div>
            <div className="flex justify-between text-lg font-bold border-t-2 border-brand-200 pt-3 mt-3">
              <span>Total Général</span>
              <span className="text-brand-600">{totalGeneral.toLocaleString('fr-FR')} Ar</span>
            </div>
          </div>

          <div className="flex gap-3 justify-end">
            <Link to="/bonuses/new" className="btn btn-ghost">Annuler</Link>
            <button type="submit" disabled={loading} className="btn bg-brand-600 hover:bg-brand-700 text-white border-0">
              {loading ? <span className="loading loading-spinner" /> : 'Créer la prime'}
            </button>
          </div>
        </form>
      </div>
    )
  }

  return (
    <div className="page-container max-w-5xl">
      <div className="flex items-center gap-3 mb-6">
        <Link to="/bonuses/new" className="p-2 rounded-lg hover:bg-base-200"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg></Link>
        <div><h1 className="page-title">📅 Prime Mensuelle</h1><p className="text-sm text-base-content/50">Établissement des primes mensuelles</p></div>
      </div>

      {error && <div className="bg-red-50 text-red-700 text-sm rounded-lg px-4 py-3 mb-6">⚠️ {error}</div>}

      <form onSubmit={handleSubmitMensuel}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <div className="card-blueline p-6">
            <h2 className="font-semibold text-base-content mb-4">Informations de l'employé</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-base-content/70 mb-1">Employé</label>
                <select value={selectedEmp?.id || ''} onChange={handleSelectEmployee}
                  className="w-full px-3 py-2 rounded-lg border border-base-300 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500">
                  <option value="">Sélectionner...</option>
                  {employees.map((e) => <option key={e.id} value={e.id}>{e.name} ({e.matricule})</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-base-content/70 mb-1">Département</label>
                <input type="text" value={employee.department} readOnly className="w-full px-3 py-2 rounded-lg border border-base-200 bg-base-100 text-base-content/60" />
              </div>
              <div>
                <label className="block text-sm font-medium text-base-content/70 mb-1">Nom et prénom</label>
                <input type="text" value={employee.name} readOnly className="w-full px-3 py-2 rounded-lg border border-base-200 bg-base-100 text-base-content/60" />
              </div>
              <div>
                <label className="block text-sm font-medium text-base-content/70 mb-1">Matricule</label>
                <input type="text" value={employee.matricule} readOnly className="w-full px-3 py-2 rounded-lg border border-base-200 bg-base-100 text-base-content/60" />
              </div>
              <div>
                <label className="block text-sm font-medium text-base-content/70 mb-1">Service</label>
                <input type="text" value={employee.service} onChange={(e) => setEmployee({ ...employee, service: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-base-300 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500" />
              </div>
            </div>
          </div>

          <div className="card-blueline p-6">
            <h2 className="font-semibold text-base-content mb-4">Responsable & Période</h2>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-base-content/70 mb-1">Nom du responsable</label>
                  <input type="text" value={manager.name || connectedUser?.name || ''} onChange={(e) => setManager({ ...manager, name: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-base-300 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-base-content/70 mb-1">Rôle</label>
                  <input type="text" value={connectedUser?.is_dg ? 'Directeur Général' : connectedUser?.is_drh ? 'DRH' : connectedUser?.is_directeur ? 'Directeur' : connectedUser?.is_validator_n1 ? 'Validateur N+1' : 'Utilisateur'} readOnly className="w-full px-3 py-2 rounded-lg border border-base-200 bg-base-100 text-base-content/60" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-base-content/70 mb-1">Fonction</label>
                <input type="text" value={manager.function || connectedUser?.poste || ''} onChange={(e) => setManager({ ...manager, function: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-base-300 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-base-content/70 mb-1">Date début</label>
                  <input type="date" value={params.startDate} onChange={(e) => setParams({ ...params, startDate: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-base-300 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-base-content/70 mb-1">Date fin</label>
                  <input type="date" value={params.endDate} onChange={(e) => setParams({ ...params, endDate: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-base-300 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-base-content/70 mb-1">Prime maximum (Ar)</label>
                <input type="number" value={params.maxPrime} onChange={(e) => {
                  const newMax = parseFloat(e.target.value) || 0
                  setParams({ ...params, maxPrime: newMax })
                  if (budgets.quanti + budgets.quali > newMax) {
                    setBudgets(prev => ({ ...prev, quali: Math.max(0, newMax - prev.quanti) }))
                  }
                }} className="w-full px-3 py-2 rounded-lg border border-base-300 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500" />
              </div>
            </div>
          </div>
        </div>

        <div className="card-blueline p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-base-content">Évaluation Quantitative</h2>
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-base-content/70">Budget (Ar) :</label>
              <input type="number" value={budgets.quanti}
                onChange={(e) => handleBudgetChange('quanti', e.target.value)}
                className="w-28 px-2 py-1 rounded border border-base-200 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 text-sm text-center" />
              <span className="text-xs text-base-content/50">/ {params.maxPrime.toLocaleString('fr-FR')} Ar</span>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-base-200">
                  <th className="text-left py-2 px-2 font-medium text-base-content/60">Critères</th>
                  <th className="text-left py-2 px-2 font-medium text-base-content/60">Description/Obs</th>
                  <th className="text-center py-2 px-2 font-medium text-base-content/60">Objectif</th>
                  <th className="text-center py-2 px-2 font-medium text-base-content/60">Note (0 à poids)</th>
                  <th className="text-right py-2 px-2 font-medium text-base-content/60">Valeur (Ar)</th>
                </tr>
              </thead>
              <tbody>
                {quantitative.map((item, i) => (
                  <tr key={i} className="border-b border-base-100">
                    <td className="py-2 px-2 font-medium">{item.criteria}</td>
                    <td className="py-2 px-2">
                      <input type="text" value={item.description}                       onChange={(e) => handleEvalChange(quantitative, setQuantitative, i, 'description', e.target.value, 'quanti')}
                        className="w-full px-2 py-1 rounded border border-base-200 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 text-sm" />
                    </td>
                    <td className="py-2 px-2 text-center">{item.objective}</td>
                    <td className="py-2 px-2 text-center">
                      <input type="number" value={item.evaluation} onChange={(e) => handleEvalChange(quantitative, setQuantitative, i, 'evaluation', e.target.value, 'quanti')}
                        className="w-20 px-2 py-1 rounded border border-base-200 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 text-sm text-center" />
                    </td>
                    <td className="py-2 px-2 text-right font-medium">{item.value.toLocaleString('fr-FR', { minimumFractionDigits: 2 })}</td>
                  </tr>
                ))}
                <tr className="font-semibold border-t-2 border-brand-200">
                  <td colSpan="4" className="py-2 px-2 text-right">Total Quantitatif</td>
                  <td className="py-2 px-2 text-right text-brand-600">{totalQuantitative.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} / {budgets.quanti.toLocaleString('fr-FR')} Ar</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div className="card-blueline p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-base-content">Évaluation Qualitative</h2>
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-base-content/70">Budget (Ar) :</label>
              <input type="number" value={budgets.quali}
                onChange={(e) => handleBudgetChange('quali', e.target.value)}
                className="w-28 px-2 py-1 rounded border border-base-200 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 text-sm text-center" />
              <span className="text-xs text-base-content/50">/ {params.maxPrime.toLocaleString('fr-FR')} Ar</span>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-base-200">
                  <th className="text-left py-2 px-2 font-medium text-base-content/60">Critères</th>
                  <th className="text-left py-2 px-2 font-medium text-base-content/60">Description/Obs</th>
                  <th className="text-center py-2 px-2 font-medium text-base-content/60">Objectif</th>
                  <th className="text-center py-2 px-2 font-medium text-base-content/60">Note (0 à poids)</th>
                  <th className="text-right py-2 px-2 font-medium text-base-content/60">Valeur (Ar)</th>
                </tr>
              </thead>
              <tbody>
                {qualitative.map((item, i) => (
                  <tr key={i} className="border-b border-base-100">
                    <td className="py-2 px-2 font-medium">{item.criteria}</td>
                    <td className="py-2 px-2">
                      <input type="text" value={item.description}                       onChange={(e) => handleEvalChange(qualitative, setQualitative, i, 'description', e.target.value, 'quali')}
                        className="w-full px-2 py-1 rounded border border-base-200 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 text-sm" />
                    </td>
                    <td className="py-2 px-2 text-center">{item.objective}</td>
                    <td className="py-2 px-2 text-center">
                      <input type="number" value={item.evaluation} onChange={(e) => handleEvalChange(qualitative, setQualitative, i, 'evaluation', e.target.value, 'quali')}
                        className="w-20 px-2 py-1 rounded border border-base-200 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 text-sm text-center" />
                    </td>
                    <td className="py-2 px-2 text-right font-medium">{item.value.toLocaleString('fr-FR', { minimumFractionDigits: 2 })}</td>
                  </tr>
                ))}
                <tr className="font-semibold border-t-2 border-brand-200">
                  <td colSpan="4" className="py-2 px-2 text-right">Total Qualitatif</td>
                  <td className="py-2 px-2 text-right text-brand-600">{totalQualitative.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} / {budgets.quali.toLocaleString('fr-FR')} Ar</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div className="card-blueline p-6 mb-6">
          <div className="flex flex-col gap-4">
            <p className="text-base-content/60 text-sm">Note de calcul : Total = total valeur quantitative + total valeur qualitative</p>
            <div className="flex items-center gap-4">
              <span className="text-sm text-base-content/60">Période : {params.startDate} → {params.endDate}</span>
            </div>

            <div className="space-y-3">
              <div>
                <div className="flex justify-between text-xs text-base-content/50 mb-1">
                  <span>Budget quantitatif utilisé</span>
                  <span className={totalQuantitative > budgets.quanti ? 'text-red-600 font-semibold' : ''}>
                    {totalQuantitative.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} / {budgets.quanti.toLocaleString('fr-FR')} Ar
                  </span>
                </div>
                <div className="w-full h-2 bg-base-200 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all duration-300 ${totalQuantitative > budgets.quanti ? 'bg-red-500' : totalQuantitative > budgets.quanti * 0.8 ? 'bg-amber-500' : 'bg-brand-500'}`}
                    style={{ width: `${Math.min((totalQuantitative / budgets.quanti) * 100, 100)}%` }} />
                </div>
              </div>
              <div>
                <div className="flex justify-between text-xs text-base-content/50 mb-1">
                  <span>Budget qualitatif utilisé</span>
                  <span className={totalQualitative > budgets.quali ? 'text-red-600 font-semibold' : ''}>
                    {totalQualitative.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} / {budgets.quali.toLocaleString('fr-FR')} Ar
                  </span>
                </div>
                <div className="w-full h-2 bg-base-200 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all duration-300 ${totalQualitative > budgets.quali ? 'bg-red-500' : totalQualitative > budgets.quali * 0.8 ? 'bg-amber-500' : 'bg-brand-500'}`}
                    style={{ width: `${Math.min((totalQualitative / budgets.quali) * 100, 100)}%` }} />
                </div>
              </div>
            </div>

            <div className="text-right pt-2 border-t border-base-200">
              <p className="text-sm text-base-content/60">Total général</p>
              <p className={`text-2xl font-bold ${totalQuantitative > budgets.quanti || totalQualitative > budgets.quali ? 'text-red-600' : 'text-brand-600'}`}>
                {totalEval.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} / {params.maxPrime.toLocaleString('fr-FR')} Ar
              </p>
            </div>
          </div>
          {(totalQuantitative > budgets.quanti || totalQualitative > budgets.quali) && (
            <div className="mt-3 bg-red-50 text-red-700 text-sm rounded-lg px-4 py-2">
              ⚠️ Un ou plusieurs budgets sont dépassés. Ajustez les évaluations.
            </div>
          )}
        </div>

        <div className="card-blueline p-6">
          <div className="space-y-4">
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={applyToAll} onChange={(e) => setApplyToAll(e.target.checked)} className="checkbox checkbox-sm border-base-300 rounded [--chkbg:theme(colors.brand.600)] checked:border-brand-600" />
              <span className="text-sm text-base-content/70">Appliquer ce modèle à tous mes équipes</span>
            </label>
            <div>
              <label className="block text-sm font-medium text-base-content/70 mb-1">Observations générales</label>
              <textarea value={observation} onChange={(e) => setObservation(e.target.value)} rows={3}
                className="w-full px-3 py-2 rounded-lg border border-base-300 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 resize-none"
                placeholder="Ajouter des notes ou observations..." />
            </div>
            <div className="flex gap-3 justify-end">
              <Link to="/bonuses/new" className="btn btn-ghost">Annuler</Link>
              <button type="submit" disabled={loading} className="btn bg-brand-600 hover:bg-brand-700 text-white border-0">
                {loading ? <span className="loading loading-spinner" /> : 'Valider/Suivant'}
              </button>
            </div>
          </div>
        </div>
      </form>
    </div>
  )
}
