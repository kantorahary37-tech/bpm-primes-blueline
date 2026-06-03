import { useState, useEffect } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { createBonus, getEmployees, getBonus, updateBonus, getPrimeMax } from '../services/api'
import { useAuth } from '../contexts/AuthContext'
import { ChartIcon, MoonIcon, CalendarIcon, ExclamationIcon, PlusIcon } from '../components/Icons'

const DEFAULT_QUANTI_CRITERIA = [
  'Planification du travail',
  'Respect des deadlines',
  "Capacité d'analyse",
  'Exécution des tâches périodiques',
]
const DEFAULT_QUALI_CRITERIA = [
  'Qualité du travail',
  'Initiative',
  "Travail d'équipe",
]

const BONUS_TYPE_DEPARTMENTS = {
  mensuel: ['Clientèle', 'Commercial GP', 'Commercial entreprise', 'ADV', 'Fidélisation', 'Auditeur interne', 'DAF Contrôleur', 'DAF CDG', 'CTB', 'RH', 'Achat', 'BBS', 'Communication & Mktg', 'DO', 'DSI', 'DT', 'Logistique', 'DG'],
  astreinte: ['BBS', 'DO', 'DSI', 'DT'],
  commission: ['Commercial GP', 'Commercial entreprise'],
}

export default function BonusForm() {
  const { user: connectedUser } = useAuth()
  const { type, id } = useParams()
  const navigate = useNavigate()
  const isEditing = !!id
  const [editType, setEditType] = useState(type)
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

  const saveBonus = isEditing ? (data) => updateBonus(id, data) : createBonus;
  const navigateAfterSave = () => {
    if (!isEditing) navigate('/bonuses');
    else { getBonus(id).then(setEditBonus); navigate('/bonuses'); }
  };

  const [employees, setEmployees] = useState([])
  const [selectedEmp, setSelectedEmp] = useState(null)

  const [employee, setEmployee] = useState({
    department: '', service: '', name: '', function: '', matricule: '',
  })
  const [manager, setManager] = useState({ name: '', function: '' })
  const [params, setParams] = useState({ startDate: monthStart, endDate: monthEnd, maxPrime: 150000 })

  const [observation, setObservation] = useState('')
  const [teamSelections, setTeamSelections] = useState([])

  const sameDeptEmployees = selectedEmp
    ? employees.filter(e => e.department === selectedEmp.department && e.id !== selectedEmp.id)
    : []

  const toggleTeamMember = (id) => {
    setTeamSelections(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [quantitative, setQuantitative] = useState([
    { criteria: 'Planification du travail', description: '', objective: '15%', evaluation: 0, value: 0 },
    { criteria: 'Respect des deadlines', description: '', objective: '15%', evaluation: 0, value: 0 },
    { criteria: "Capacité d'analyse", description: '', objective: '10%', evaluation: 0, value: 0 },
    { criteria: 'Exécution des tâches périodiques', description: '', objective: '10%', evaluation: 0, value: 0 },
  ])
  const [qualitative, setQualitative] = useState([
    { criteria: 'Qualité du travail', description: '', objective: '20%', evaluation: 0, value: 0 },
    { criteria: 'Initiative', description: '', objective: '15%', evaluation: 0, value: 0 },
    { criteria: "Travail d'équipe", description: '', objective: '15%', evaluation: 0, value: 0 },
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
  const [perEmployeeAdditional, setPerEmployeeAdditional] = useState({})

  const handleEmpAdditional = (empId, field, value) => {
    setPerEmployeeAdditional(prev => ({
      ...prev,
      [empId]: { ...prev[empId], [field]: parseFloat(value) || 0 }
    }))
  }
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

  useEffect(() => {
    if (!selectedEmp || !editType) return
    getPrimeMax(selectedEmp.department, editType).then(data => {
      if (Array.isArray(data) && data.length > 0 && data[0].amount != null) {
        setParams(p => ({ ...p, maxPrime: parseFloat(data[0].amount) }))
      }
    }).catch(() => {})
  }, [selectedEmp?.id, editType])

  useEffect(() => {
    if (!isEditing || !id) return;
    getBonus(id).then((b) => {
      setEditType(b.bonus_type);
      setSelectedEmp(b.employee || null);
      setParams((p) => ({ ...p, startDate: b.start_date, endDate: b.end_date }));
      if (b.details) {
        const d = b.details;
        if (d.quantitative) setQuantitative(d.quantitative);
        if (d.qualitative) setQualitative(d.qualitative);
        if (d.sales) setSales(d.sales.map((s, i) => ({ ...s, key: i + 1 })));
        if (d.disponibilites) setDisponibilites(d.disponibilites.map((s, i) => ({ ...s, key: i + 1 })));
        if (d.interventions) setInterventions(d.interventions.map((s, i) => ({ ...s, key: i + 1 })));
        if (d.weekly_max) setAstreinteConfig((c) => ({ ...c, weeklyMax: d.weekly_max, interventionRate: d.intervention_rate }));
        if (d.rate) setCommissionConfig((c) => ({ ...c, rate: d.rate }));
        if (d.exceptionnelle !== undefined) setAdditionalPrimes((p) => ({ ...p, exceptionnelle: d.exceptionnelle }));
        if (d.ponctuelle !== undefined) setAdditionalPrimes((p) => ({ ...p, ponctuelle: d.ponctuelle }));
      }
    });
  }, [id]);

  const totalQuantiEval = quantitative.reduce((s, i) => s + (parseFloat(i.evaluation) || 0), 0)
  const totalQualiEval = qualitative.reduce((s, i) => s + (parseFloat(i.evaluation) || 0), 0)
  const totalEvalPct = totalQuantiEval + totalQualiEval
  const totalQuantiValue = quantitative.reduce((s, i) => s + i.value, 0)
  const totalQualiValue = qualitative.reduce((s, i) => s + i.value, 0)
  const totalValue = totalQuantiValue + totalQualiValue
  const totalQuantiObj = quantitative.reduce((s, i) => s + (parseInt(i.objective) || 0), 0)
  const totalQualiObj = qualitative.reduce((s, i) => s + (parseInt(i.objective) || 0), 0)

  if (!['mensuel', 'astreinte', 'commission'].includes(editType)) {
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
      const item = newData[index]
      const maxEval = parseInt(item.objective) || 0
      const pct = Math.max(0, Math.min(parseFloat(value) || 0, maxEval))
      newData[index].evaluation = pct
      newData[index].value = params.maxPrime * (pct / 100)
    } else {
      newData[index][field] = value
    }
    setter(newData)
  }

  const getAvailableCriteria = (currentList, defaults) =>
    defaults.filter((c) => !currentList.some((item) => item.criteria === c))

  const removeEvalItem = (list, setter, index) => {
    setter(list.filter((_, i) => i !== index))
  }

  const addEvalItem = (list, setter, criteria, section) => {
    setter([...list, { criteria, description: '', objective: '0%', evaluation: 0, value: 0 }])
  }

  const [showAddQuanti, setShowAddQuanti] = useState(false)
  const [showAddQuali, setShowAddQuali] = useState(false)
  const [customMode, setCustomMode] = useState(null) // 'quanti' | 'quali' | null
  const [customCriteria, setCustomCriteria] = useState('')

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
    const weeks = calcWeeks(params.startDate, params.endDate)
    const empName = (id) => employees.find((e) => e.id === id)?.name || `#${id}`

    const allEmpIds = [...new Set([
      ...disponibilites.map(d => d.employee_id),
      ...interventions.map(i => i.employee_id),
    ])].filter(Boolean)

    if (allEmpIds.length === 0) {
      setError('Ajoutez au moins un employé dans les tableaux Disponibilité ou Interventions.')
      setLoading(false)
      return
    }

    const badDept = allEmpIds.some(id => {
      const e = employees.find(x => x.id === id)
      return e && !BONUS_TYPE_DEPARTMENTS.astreinte.includes(e.department)
    })
    if (badDept) {
      setError('Seuls les départements BBS, DO, DSI, DT sont autorisés pour les primes d\'astreinte.')
      setLoading(false); return
    }

    try {
      await Promise.all(allEmpIds.map(employee_id => {
        const empDispos = disponibilites.filter(d => d.employee_id === employee_id)
        const empIntervs = interventions.filter(i => i.employee_id === employee_id)
        const totalDispo = empDispos.reduce((s, d) => s + (parseFloat(d.nombre) || 0) * astreinteConfig.weeklyMax, 0)
        const totalInterv = empIntervs.length * astreinteConfig.interventionRate
        const empAdd = perEmployeeAdditional[employee_id] || {}
        const amount = totalDispo + totalInterv + (empAdd.exceptionnelle || 0) + (empAdd.ponctuelle || 0)

        return saveBonus({
          employee_id,
          start_date: params.startDate,
          end_date: params.endDate,
          bonus_type: 'astreinte',
          total_amount: amount,
          nb_jours_astreinte: totalDispo,
          taux_jour: astreinteConfig.weeklyMax,
          prime_astreinte_amount: totalInterv,
          details: {
            weeks,
            weekly_max: astreinteConfig.weeklyMax,
            intervention_rate: astreinteConfig.interventionRate,
            disponibilites: empDispos.map(d => ({
              employee_id: d.employee_id, employee_name: empName(d.employee_id), nombre: d.nombre,
            })),
            interventions: empIntervs.map(i => ({
              employee_id: i.employee_id, employee_name: empName(i.employee_id),
              date: i.date, heure: i.heure, motif: i.motif, ticket: i.ticket,
            })),
            total_dispo: totalDispo,
            total_interv: totalInterv,
            exceptionnelle: empAdd.exceptionnelle || 0,
            ponctuelle: empAdd.ponctuelle || 0,
          },
        })
      }))
      navigateAfterSave()
    } catch (err) {
      setError(err.response?.status === 409 ? 'Cette prime existe déjà pour cet employé sur cette période.' : (err.response?.data?.detail || "Erreur lors de la création"))
      window.scrollTo({ top: 0, behavior: 'smooth' })
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
    if (selectedEmp) {
      const allowed = BONUS_TYPE_DEPARTMENTS.commission
      if (!allowed.includes(selectedEmp.department)) {
        setError(`Le département "${selectedEmp.department}" n'est pas autorisé pour les commissions.`)
        setLoading(false); return
      }
    }
    const amount = sales.reduce((s, row) => s + (parseFloat(row.nombre) || 0) * commissionConfig.rate, 0)
    try {
      await saveBonus({
        employee_id: selectedEmp?.id,
        start_date: params.startDate,
        end_date: params.endDate,
        bonus_type: 'commission',
        taux_commission: commissionConfig.rate,
        commission_amount: amount,
        total_amount: amount,
        ca_realise: amount,
        details: {
          rate: commissionConfig.rate,
          sales: sales.map((s) => ({
            designation: s.designation, nombre: s.nombre, description: s.description,
          })),
          total: amount,
        },
      })
      navigateAfterSave()
    } catch (err) {
      setError(err.response?.status === 409 ? 'Cette prime existe déjà pour cet employé sur cette période.' : (err.response?.data?.detail || "Erreur lors de la création"))
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } finally {
      setLoading(false)
    }
  }

  const handleSimpleChange = (e) => setSimpleForm({ ...simpleForm, [e.target.name]: e.target.value })

  const handleSelectEmployee = (e) => {
    const id = parseInt(e.target.value)
    const emp = employees.find((x) => x.id === id)
    if (emp) {
      const allowed = BONUS_TYPE_DEPARTMENTS[editType]
      if (allowed && !allowed.includes(emp.department)) {
        setError(`Le département "${emp.department}" n'est pas autorisé pour les primes ${editType === 'mensuel' ? 'mensuelles' : editType === 'astreinte' ? "d'astreinte" : 'de commission'}.`)
        setSelectedEmp(null)
        setEmployee({ department: '', service: '', name: '', function: '', matricule: '' })
        return
      }
      setError('')
      setEmployee({ department: emp.department || '', service: '', name: emp.name, function: '', matricule: emp.matricule })
    }
    setSelectedEmp(emp)
    setSimpleForm({ ...simpleForm, employee_id: id })
  }

  const handleSubmitMensuel = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    const allEmpIds = [selectedEmp?.id, ...teamSelections].filter(Boolean)
    const badDept = allEmpIds.some(id => {
      const e = employees.find(x => x.id === id)
      return e && !BONUS_TYPE_DEPARTMENTS.mensuel.includes(e.department)
    })
    if (badDept) {
      setError('Un ou plusieurs employés sélectionnés ne sont pas autorisés pour les primes mensuelles.')
      setLoading(false); return
    }
    const amount = Math.min(totalValue, params.maxPrime)
    try {
      await Promise.all(allEmpIds.map(employee_id =>
        saveBonus({
          employee_id,
          start_date: params.startDate,
          end_date: params.endDate,
          bonus_type: 'mensuel',
          performance_score: totalEvalPct,
          total_amount: amount,
          details: {
            prime_max: params.maxPrime,
            quantitative: quantitative.map((c) => ({
              criteria: c.criteria, description: c.description,
              objective: c.objective, evaluation: c.evaluation, value: c.value,
            })),
            qualitative: qualitative.map((c) => ({
              criteria: c.criteria, description: c.description,
              objective: c.objective, evaluation: c.evaluation, value: c.value,
            })),
            total_quantitative: totalQuantiValue,
            total_qualitative: totalQualiValue,
            total_evaluation: totalValue,
          },
        })
      ))
      navigateAfterSave()
    } catch (err) {
      setError(err.response?.status === 409 ? 'Cette prime existe déjà pour cet employé sur cette période.' : (err.response?.data?.detail || "Erreur lors de la création"))
      window.scrollTo({ top: 0, behavior: 'smooth' })
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
      await saveBonus(payload)
      navigateAfterSave()
    } catch (err) {
      setError(err.response?.status === 409 ? 'Cette prime existe déjà pour cet employé sur cette période.' : (err.response?.data?.detail || "Erreur lors de la création"))
      window.scrollTo({ top: 0, behavior: 'smooth' })
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

  const sharedHeader = (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
      <div className="card-blueline p-6">
        <h2 className="font-semibold text-base-content mb-4">{editType === 'astreinte' ? 'Responsable' : "Informations de l'employé"}</h2>
        <div className="space-y-3">
          {editType === 'astreinte' ? (
            <div className="bg-blue-50 text-blue-700 text-sm rounded-lg px-3 py-2">
              Les employés sont définis dans les tableaux ci-dessous. Une prime sera créée par employé.
            </div>
          ) : (
            <div>
              <label className="block text-sm font-medium text-base-content/70 mb-1">Employé</label>
              <select value={selectedEmp?.id || ''} onChange={handleSelectEmployee}
                className="w-full px-3 py-2 rounded-lg border border-base-300 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500">
                <option value="">Sélectionner...</option>
                {employees.map((e) => <option key={e.id} value={e.id}>{e.name} ({e.matricule})</option>)}
              </select>
            </div>
          )}
          {editType !== 'astreinte' && (<>
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
          </>)}
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
                <input type="date" value={params.startDate} onChange={(e) => setParams({ ...params, startDate: e.target.value })} className={`w-full px-3 py-2 rounded-lg border focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 ${params.endDate < params.startDate ? 'border-red-400' : 'border-base-300'}`} />
              </div>
              <div>
                <label className="block text-sm font-medium text-base-content/70 mb-1">Date fin</label>
                <input type="date" value={params.endDate} onChange={(e) => setParams({ ...params, endDate: e.target.value })} className={`w-full px-3 py-2 rounded-lg border focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 ${params.endDate < params.startDate ? 'border-red-400' : 'border-base-300'}`} />
              </div>
            </div>
          {params.endDate < params.startDate && (
            <p className="text-red-500 text-sm mt-1">⚠️ La date de fin ne peut pas être avant la date de début.</p>
          )}
          {editType === 'astreinte' ? (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-base-content/70 mb-1">Prime max / semaine (Ar)</label>
                <input type="number" value={astreinteConfig.weeklyMax} onChange={(e) => handleConfigChange('weeklyMax', e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-base-300 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-base-content/70 mb-1">Nombre de semaines</label>
                <input type="number" value={calcWeeks(params.startDate, params.endDate)} readOnly
                  className="w-full px-3 py-2 rounded-lg border border-base-200 bg-base-100 text-base-content/60" />
              </div>
            </div>
          ) : (
            <div>
              <label className="block text-sm font-medium text-base-content/70 mb-1">Prime maximum (Ar)</label>
              <input type="number" value={params.maxPrime} readOnly
                className="w-full px-3 py-2 rounded-lg border border-base-200 bg-base-100 text-base-content/60 cursor-not-allowed" />
              <p className="text-[11px] text-base-content/40 mt-1">Modifiable dans la page Plafonds</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )

  if (type === 'commission') {
    const totalCommission = sales.reduce((s, row) => s + (parseFloat(row.nombre) || 0) * commissionConfig.rate, 0)

    return (
      <div className="page-container max-w-5xl">
        <div className="flex items-center gap-3 mb-6">
          <Link to="/bonuses/new" className="p-2 rounded-lg hover:bg-base-200"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg></Link>
          <div className="flex items-center gap-2"><ChartIcon className="w-6 h-6 text-blue-600" /><div><h1 className="page-title">Prime Commission</h1><p className="text-sm text-base-content/50">Commission par vente</p></div></div>
        </div>
        {error && <div className="bg-red-50 text-red-700 text-sm rounded-lg px-4 py-3 mb-6 flex items-center gap-2"><ExclamationIcon className="w-4 h-4" />{error}</div>}
        <form onSubmit={handleSubmitCommission} className="space-y-6">
          {sharedHeader}
          <div className="card-blueline p-6">
            <h2 className="font-semibold text-base-content mb-4">Configuration commission</h2>
            <div className="max-w-xs">
              <label className="block text-sm font-medium text-base-content/70 mb-1">Commission par vente (Ar)</label>
              <input type="number" value={commissionConfig.rate} onChange={(e) => handleCommissionConfigChange('rate', e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-base-300 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500" />
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
    const weeks = calcWeeks(params.startDate, params.endDate)
    const totalDispo = disponibilites.reduce((s, d) => s + (parseFloat(d.nombre) || 0) * astreinteConfig.weeklyMax, 0)
    const totalInterv = interventions.filter(i => i.employee_id).length * astreinteConfig.interventionRate
    const totalGeneral = totalDispo + totalInterv + Object.values(perEmployeeAdditional).reduce((s, v) => s + (v.exceptionnelle || 0) + (v.ponctuelle || 0), 0)
    const primeCount = [...new Set([...disponibilites.map(d => d.employee_id), ...interventions.map(i => i.employee_id)])].filter(Boolean).length
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
    Object.keys(employeeTotals).forEach(id => {
      const add = perEmployeeAdditional[id] || {}
      employeeTotals[id].exceptionnelle = add.exceptionnelle || 0
      employeeTotals[id].ponctuelle = add.ponctuelle || 0
    })

    return (
      <div className="page-container max-w-5xl">
        <div className="flex items-center gap-3 mb-6">
          <Link to="/bonuses/new" className="p-2 rounded-lg hover:bg-base-200"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg></Link>
          <div className="flex items-center gap-2"><MoonIcon className="w-6 h-6 text-blue-600" /><div><h1 className="page-title">Prime d'Astreinte</h1><p className="text-sm text-base-content/50">Gestion des astreintes et interventions</p></div></div>
        </div>
        {error && <div className="bg-red-50 text-red-700 text-sm rounded-lg px-4 py-3 mb-6 flex items-center gap-2"><ExclamationIcon className="w-4 h-4" />{error}</div>}
        <form onSubmit={handleSubmitAstreinte} className="space-y-6">
          {sharedHeader}

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
                        <input type="date" value={iv.date} min={params.startDate} max={params.endDate} onChange={(e) => handleIntervChange(i, 'date', e.target.value)}
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
            <h2 className="font-semibold text-base-content mb-4">Récapitulatif par employé <span className="text-sm font-normal text-base-content/50">(1 prime par employé)</span></h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-base-200">
                    <th className="text-left py-2 px-2 font-medium text-base-content/60">Employé</th>
                    <th className="text-right py-2 px-2 font-medium text-base-content/60">Disponibilité</th>
                    <th className="text-right py-2 px-2 font-medium text-base-content/60">Interventions</th>
                    <th className="text-right py-2 px-2 font-medium text-base-content/60">Exceptionnelle</th>
                    <th className="text-right py-2 px-2 font-medium text-base-content/60">Ponctuelle</th>
                    <th className="text-right py-2 px-2 font-medium text-base-content/60">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(employeeTotals).map(([id, e]) => (
                    <tr key={id} className="border-b border-base-100">
                      <td className="py-2 px-2 font-medium">{e.name}</td>
                      <td className="py-2 px-2 text-right">{e.dispo.toLocaleString('fr-FR')} Ar</td>
                      <td className="py-2 px-2 text-right">{e.interv.toLocaleString('fr-FR')} Ar</td>
                      <td className="py-2 px-2 text-right">
                        <input type="number" value={perEmployeeAdditional[id]?.exceptionnelle || 0}
                          onChange={(e) => handleEmpAdditional(id, 'exceptionnelle', e.target.value)}
                          className="w-24 px-2 py-1 rounded border border-base-200 text-sm text-right focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500" />
                      </td>
                      <td className="py-2 px-2 text-right">
                        <input type="number" value={perEmployeeAdditional[id]?.ponctuelle || 0}
                          onChange={(e) => handleEmpAdditional(id, 'ponctuelle', e.target.value)}
                          className="w-24 px-2 py-1 rounded border border-base-200 text-sm text-right focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500" />
                      </td>
                      <td className="py-2 px-2 text-right font-semibold">{(e.dispo + e.interv + (e.exceptionnelle || 0) + (e.ponctuelle || 0)).toLocaleString('fr-FR')} Ar</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-between text-lg font-bold border-t-2 border-brand-200 pt-3 mt-3">
              <span>Total Général</span>
              <span className="text-brand-600">{totalGeneral.toLocaleString('fr-FR')} Ar</span>
            </div>
          </div>

          <div className="flex gap-3 justify-end">
            <Link to="/bonuses/new" className="btn btn-ghost">Annuler</Link>
            <button type="submit" disabled={loading} className="btn bg-brand-600 hover:bg-brand-700 text-white border-0">
              {loading ? <span className="loading loading-spinner" /> : `Créer les primes (${primeCount})`}
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
        <div className="flex items-center gap-2"><CalendarIcon className="w-6 h-6 text-blue-600" /><div><h1 className="page-title">Prime Mensuelle</h1><p className="text-sm text-base-content/50">Établissement des primes mensuelles</p></div></div>
      </div>

      {error && <div className="bg-red-50 text-red-700 text-sm rounded-lg px-4 py-3 mb-6 flex items-center gap-2"><ExclamationIcon className="w-4 h-4" />{error}</div>}

      <form onSubmit={handleSubmitMensuel}>
        {sharedHeader}

        {(totalQuantiObj + totalQualiObj) !== 100 && (
          <div className="mb-4 bg-amber-50 text-amber-700 text-sm rounded-lg px-4 py-2 flex items-center gap-2">
            <ExclamationIcon className="w-4 h-4" /> Les objectifs qualitatifs et quantitatifs totalisent {totalQuantiObj + totalQualiObj}% (doivent faire 100%)
          </div>
        )}

        <div className="card-blueline p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-base-content">Évaluation Quantitative</h2>
            <span className="text-xs text-base-content/50">{totalQuantiEval.toFixed(1)}%</span>
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
                  <th className="w-10"></th>
                </tr>
              </thead>
              <tbody>
                {quantitative.map((item, i) => (
                  <tr key={i} className="border-b border-base-100">
                    <td className="py-2 px-2 font-medium">{item.criteria}</td>
                    <td className="py-2 px-2">
                      <input type="text" value={item.description}
                        onChange={(e) => handleEvalChange(quantitative, setQuantitative, i, 'description', e.target.value, 'quanti')}
                        className="w-full px-2 py-1 rounded border border-base-200 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 text-sm" />
                    </td>
                    <td className="py-2 px-2 text-center">
                      <input type="text" value={item.objective}
                        onChange={(e) => handleEvalChange(quantitative, setQuantitative, i, 'objective', e.target.value, 'quanti')}
                        className="w-16 px-2 py-1 rounded border border-base-200 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 text-sm text-center" />
                    </td>
                    <td className="py-2 px-2 text-center">
                      <input type="number" min="0" max={parseInt(item.objective) || 100}
                        value={item.evaluation}
                        onChange={(e) => handleEvalChange(quantitative, setQuantitative, i, 'evaluation', e.target.value, 'quanti')}
                        className="w-20 px-2 py-1 rounded border border-base-200 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 text-sm text-center" />
                    </td>
                    <td className="py-2 px-2 text-right font-medium">{item.value.toLocaleString('fr-FR', { minimumFractionDigits: 2 })}</td>
                    <td className="py-2 px-2 text-center">
                      <button type="button" onClick={() => removeEvalItem(quantitative, setQuantitative, i)}
                        className="text-red-400 hover:text-red-600 text-lg leading-none">&minus;</button>
                    </td>
                  </tr>
                ))}
                <tr className="font-semibold border-t-2 border-brand-200">
                  <td colSpan="5" className="py-2 px-2 text-right">Total Quantitatif</td>
                  <td className="py-2 px-2 text-right text-brand-600">{totalQuantiEval.toFixed(0)}</td>
                </tr>
              </tbody>
            </table>
            <div className="mt-3 flex items-center gap-2 flex-wrap">
              {!showAddQuanti && (
                <button type="button" onClick={() => { setShowAddQuanti(true); setCustomMode(null); setCustomCriteria('') }}
                  className="btn btn-xs btn-ghost text-brand-600 flex items-center gap-1">
                  <PlusIcon className="w-3.5 h-3.5" /> Ajouter un critère
                </button>
              )}
              {showAddQuanti && !customMode && (
                <div className="flex items-center gap-2">
                  <select className="select select-bordered select-xs w-auto"
                    value=""
                    onChange={(e) => {
                      if (e.target.value === '__custom__') { setCustomMode('quanti'); return }
                      addEvalItem(quantitative, setQuantitative, e.target.value, 'quanti')
                      setShowAddQuanti(false)
                    }}>
                    <option value="">Sélectionner...</option>
                    {getAvailableCriteria(quantitative, DEFAULT_QUANTI_CRITERIA).map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                    <option value="__custom__">Autre...</option>
                  </select>
                  <button type="button" onClick={() => setShowAddQuanti(false)} className="btn btn-xs btn-ghost">Annuler</button>
                </div>
              )}
              {customMode === 'quanti' && (
                <div className="flex items-center gap-2">
                  <input type="text" value={customCriteria}
                    onChange={(e) => setCustomCriteria(e.target.value)}
                    placeholder="Nom du critère personnalisé..."
                    className="input input-bordered input-xs w-64" />
                  <button type="button" onClick={() => {
                    if (customCriteria.trim()) {
                      addEvalItem(quantitative, setQuantitative, customCriteria.trim(), 'quanti')
                      setCustomCriteria('')
                      setCustomMode(null)
                      setShowAddQuanti(false)
                    }
                  }} className="btn btn-xs bg-brand-600 text-white border-0">Ajouter</button>
                  <button type="button" onClick={() => { setCustomMode(null); setShowAddQuanti(false) }} className="btn btn-xs btn-ghost">Annuler</button>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="card-blueline p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-base-content">Évaluation Qualitative</h2>
            <span className="text-xs text-base-content/50">{totalQualiEval.toFixed(1)}% / 100%</span>
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
                  <th className="w-10"></th>
                </tr>
              </thead>
              <tbody>
                {qualitative.map((item, i) => (
                  <tr key={i} className="border-b border-base-100">
                    <td className="py-2 px-2 font-medium">{item.criteria}</td>
                    <td className="py-2 px-2">
                      <input type="text" value={item.description}
                        onChange={(e) => handleEvalChange(qualitative, setQualitative, i, 'description', e.target.value, 'quali')}
                        className="w-full px-2 py-1 rounded border border-base-200 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 text-sm" />
                    </td>
                    <td className="py-2 px-2 text-center">
                      <input type="text" value={item.objective}
                        onChange={(e) => handleEvalChange(qualitative, setQualitative, i, 'objective', e.target.value, 'quali')}
                        className="w-16 px-2 py-1 rounded border border-base-200 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 text-sm text-center" />
                    </td>
                    <td className="py-2 px-2 text-center">
                      <input type="number" min="0" max={parseInt(item.objective) || 100}
                        value={item.evaluation}
                        onChange={(e) => handleEvalChange(qualitative, setQualitative, i, 'evaluation', e.target.value, 'quali')}
                        className="w-20 px-2 py-1 rounded border border-base-200 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 text-sm text-center" />
                    </td>
                    <td className="py-2 px-2 text-right font-medium">{item.value.toLocaleString('fr-FR', { minimumFractionDigits: 2 })}</td>
                    <td className="py-2 px-2 text-center">
                      <button type="button" onClick={() => removeEvalItem(qualitative, setQualitative, i)}
                        className="text-red-400 hover:text-red-600 text-lg leading-none">&minus;</button>
                    </td>
                  </tr>
                ))}
                <tr className="font-semibold border-t-2 border-brand-200">
                  <td colSpan="5" className="py-2 px-2 text-right">Total Qualitatif</td>
                  <td className="py-2 px-2 text-right text-brand-600">{totalQualiEval.toFixed(0)}</td>
                </tr>
              </tbody>
            </table>
            <div className="mt-3 flex items-center gap-2 flex-wrap">
              {!showAddQuali && (
                <button type="button" onClick={() => { setShowAddQuali(true); setCustomMode(null); setCustomCriteria('') }}
                  className="btn btn-xs btn-ghost text-brand-600 flex items-center gap-1">
                  <PlusIcon className="w-3.5 h-3.5" /> Ajouter un critère
                </button>
              )}
              {showAddQuali && !customMode && (
                <div className="flex items-center gap-2">
                  <select className="select select-bordered select-xs w-auto"
                    value=""
                    onChange={(e) => {
                      if (e.target.value === '__custom__') { setCustomMode('quali'); return }
                      addEvalItem(qualitative, setQualitative, e.target.value, 'quali')
                      setShowAddQuali(false)
                    }}>
                    <option value="">Sélectionner...</option>
                    {getAvailableCriteria(qualitative, DEFAULT_QUALI_CRITERIA).map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                    <option value="__custom__">Autre...</option>
                  </select>
                  <button type="button" onClick={() => setShowAddQuali(false)} className="btn btn-xs btn-ghost">Annuler</button>
                </div>
              )}
              {customMode === 'quali' && (
                <div className="flex items-center gap-2">
                  <input type="text" value={customCriteria}
                    onChange={(e) => setCustomCriteria(e.target.value)}
                    placeholder="Nom du critère personnalisé..."
                    className="input input-bordered input-xs w-64" />
                  <button type="button" onClick={() => {
                    if (customCriteria.trim()) {
                      addEvalItem(qualitative, setQualitative, customCriteria.trim(), 'quali')
                      setCustomCriteria('')
                      setCustomMode(null)
                      setShowAddQuali(false)
                    }
                  }} className="btn btn-xs bg-brand-600 text-white border-0">Ajouter</button>
                  <button type="button" onClick={() => { setCustomMode(null); setShowAddQuali(false) }} className="btn btn-xs btn-ghost">Annuler</button>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="card-blueline p-6 mb-6">
          <div className="flex flex-col gap-4">
            <p className="text-base-content/60 text-sm">Note de calcul : Total = total valeur quantitative + total valeur qualitative</p>
            <div className="flex items-center gap-4">
              <span className="text-sm text-base-content/60">Période : {params.startDate} → {params.endDate}</span>
            </div>

            <div className="flex items-center gap-4 mb-4">
              <div className="flex-1">
                <div className="flex justify-between text-xs text-base-content/50 mb-1">
                  <span>Quantitatif</span>
                  <span>{totalQuantiEval.toFixed(1)}%</span>
                </div>
                <div className="w-full h-2 bg-base-200 rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-300 bg-blue-500"
                    style={{ width: `${Math.min(totalQuantiEval, 100)}%` }} />
                </div>
              </div>
              <div className="flex-1">
                <div className="flex justify-between text-xs text-base-content/50 mb-1">
                  <span>Qualitatif</span>
                  <span>{totalQualiEval.toFixed(1)}%</span>
                </div>
                <div className="w-full h-2 bg-base-200 rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-300 bg-violet-500"
                    style={{ width: `${Math.min(totalQualiEval, 100)}%` }} />
                </div>
              </div>
            </div>

            <div className="text-right pt-2 border-t border-base-200">
              <p className="text-sm text-base-content/60">Total (quanti + quali)</p>
              <p className="text-2xl font-bold text-brand-600">
                {totalEvalPct.toFixed(1)}% — {totalValue.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} / {params.maxPrime.toLocaleString('fr-FR')} Ar
              </p>
            </div>
          </div>

        </div>

        <div className="card-blueline p-6">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-base-content/70 mb-2">Appliquer ce modèle à :</label>
              {!selectedEmp ? (
                <p className="text-xs text-base-content/40">Sélectionnez d'abord un employé.</p>
              ) : sameDeptEmployees.length === 0 ? (
                <p className="text-xs text-base-content/40">Aucun autre employé dans le même département.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {sameDeptEmployees.map(e => (
                    <button key={e.id} type="button" onClick={() => toggleTeamMember(e.id)}
                      className={`px-3 py-1.5 rounded-lg border text-sm transition-all ${
                        teamSelections.includes(e.id)
                          ? 'bg-brand-600 text-white border-brand-600'
                          : 'bg-white text-base-content/70 border-base-300 hover:border-brand-300'
                      }`}>
                      {e.name}
                    </button>
                  ))}
                </div>
              )}
              {teamSelections.length > 0 && (
                <p className="text-xs text-brand-600 mt-1">{teamSelections.length} employé(s) sélectionné(s)</p>
              )}
            </div>
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
