import { useState, useEffect, useRef, Fragment } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { createBonus, getEmployees, getBonus, updateBonus, getPrimeMax, uploadFile, openFile, getEvaluationTemplates, saveEvaluationTemplates, previewCommissionImport, importCommissionBonuses } from '../services/api'
import { useAuth } from '../contexts/AuthContext'
import { useSystemConfig } from '../contexts/SystemConfigContext'
import { useCurrencies } from '../contexts/CurrenciesContext'
import { ChartIcon, MoonIcon, CalendarIcon, ExclamationIcon, PlusIcon } from '../components/Icons'
import Modal from '../components/Modal'
import SftpFilePicker from '../components/SftpFilePicker'
import * as XLSX from 'xlsx'

const FRENCH_MONTHS = {
  janvier: '01', février: '02', mars: '03', avril: '04',
  mai: '05', juin: '06', juillet: '07', août: '08',
  septembre: '09', octobre: '10', novembre: '11', décembre: '12',
}

function parseFrenchDate(str) {
  if (!str) return ''
  const s = String(str).trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  const normalized = s.replace(/[–—_-]+/g, ' ')
  const m = normalized.match(/^(\d{1,2})\s+([a-zéûîôèêëàùü]+)\s+(\d{4})$/i)
  if (m) {
    const month = FRENCH_MONTHS[m[2].toLowerCase()]
    if (month) return `${m[3]}-${month}-${m[1].padStart(2, '0')}`
  }
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s)) {
    const [d, mo, y] = s.split('/')
    return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`
  }
  return s
}

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
  mensuel: [
    'Direction Achat', 'Direction Administrative et Financiere',
    'Direction BBS', 'Direction Clientele', 'Direction Commerciale',
    'Direction Communication et Marketing', 'Direction des Operations',
    'Direction des Services Generaux', "Direction des Systemes d'Informations",
    'Direction Generale', 'Direction Logistique', 'Direction Technique',
  ],
  astreinte: ['Direction BBS', 'Direction des Operations',
              "Direction des Systemes d'Informations", 'Direction Technique'],
  commission: ['Direction Commerciale'],
}

export default function BonusForm() {
  const { user: connectedUser } = useAuth()
  const { canSeeAmounts } = useSystemConfig()
  const { symbolFor } = useCurrencies()
  const seeAmounts = canSeeAmounts(connectedUser)
  const showPrimeMax = seeAmounts && !connectedUser?.is_validator_n1
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
  const getRate = (empId) => {
    const emp = employees.find(e => e.id === empId)
    return emp?.astreinte_rate ?? astreinteConfig.weeklyMax
  }

  const getMensuelRate = (empId) => {
    const emp = employees.find(e => e.id === empId)
    return emp?.mensuel_rate ?? null
  }

  const saveBonus = isEditing ? (data) => updateBonus(id, data) : createBonus;
  const navigateAfterSave = () => {
    const msg = isEditing ? 'Prime modifiée avec succès' : 'Prime créée avec succès';
    if (!isEditing) navigate('/bonuses', { state: { success: msg } });
    else navigate(`/bonuses/${id}`);
  };

  const [bonusStatus, setBonusStatus] = useState('')
  const isReadOnly = isEditing && bonusStatus === 'En attente DG' && !connectedUser?.is_dg && !connectedUser?.is_admin && !connectedUser?.is_drh

  const [employees, setEmployees] = useState([])
  const [selectedEmp, setSelectedEmp] = useState(null)
  const formCurrency = symbolFor(selectedEmp?.currency)
  const maskAr = (v, opts) => seeAmounts ? `${v.toLocaleString('fr-FR', opts)} Ar` : '••••••'
  const maskForm = (v, opts) => seeAmounts ? `${v.toLocaleString('fr-FR', opts)} ${formCurrency}` : '••••••'

  const [employee, setEmployee] = useState({
    department: '', service: '', name: '', function: '', matricule: '',
  })
  const [manager, setManager] = useState({ name: '', function: '' })
  const [params, setParams] = useState({ startDate: monthStart, endDate: monthEnd, maxPrime: 150000 })
  const [selectedMonth, setSelectedMonth] = useState(now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0'))
  const [selectedYear, setSelectedYear] = useState(now.getFullYear())
  const months = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre']
  const years = Array.from({ length: 8 }, (_, i) => now.getFullYear() - 2 + i)

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
    { criteria: 'Planification du travail', description: '', coeff: 2, note: 0, value: 0 },
    { criteria: 'Respect des deadlines', description: '', coeff: 1, note: 0, value: 0 },
    { criteria: "Capacité d'analyse", description: '', coeff: 1, note: 0, value: 0 },
    { criteria: 'Exécution des tâches périodiques', description: '', coeff: 2, note: 0, value: 0 },
  ])
  const [qualitative, setQualitative] = useState([
    { criteria: 'Qualité du travail', description: '', coeff: 2, note: 0, value: 0 },
    { criteria: 'Initiative', description: '', coeff: 1, note: 0, value: 0 },
    { criteria: "Travail d'équipe", description: '', coeff: 1, note: 0, value: 0 },
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
    { key: 2, employee_id: '', date: '', heure: '', motif: '', ticket: '', type: 'intervention', demandeur: '', service: '' },
  ])
  const [additionalPrimes, setAdditionalPrimes] = useState({ exceptionnelle: 0, ponctuelle: 0 })
  const [perEmployeeAdditional, setPerEmployeeAdditional] = useState({})
  const importFileRef = useRef(null)
  const [importedFileName, setImportedFileName] = useState('')
  const [importFeedback, setImportFeedback] = useState('')
  const [importError, setImportError] = useState('')

  const [editLoaded, setEditLoaded] = useState(!isEditing)
  const [others, setOthers] = useState([])
  const otherTypes = ['temporaire', 'periodique', 'autres']

  const addOther = () => {
    setOthers(prev => [...prev, { key: Date.now() + Math.random(), libelle: '', type: 'temporaire', typeCustom: '', file: null, fileData: null, debut_mois: '', debut_annee: '', fin_mois: '', fin_annee: '', montant: 0 }])
  }
  const removeOther = (key) => setOthers(prev => prev.filter(o => o.key !== key))
  const updateOther = (key, field, value) => setOthers(prev => prev.map(o => o.key === key ? { ...o, [field]: value } : o))

  const handleOtherFile = async (key, file) => {
    if (!file) return
    try {
      const result = await uploadFile(file)
      updateOther(key, 'file', result)
      updateOther(key, 'fileData', file)
    } catch { }
  }
  const removeOtherFile = (key) => {
    updateOther(key, 'file', null)
    updateOther(key, 'fileData', null)
  }

  const othersTotal = others.reduce((sum, o) => sum + (parseFloat(o.montant) || 0), 0)

  const handleImportExcel = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImportFeedback('')
    setImportError('')
    try {
      const data = await file.arrayBuffer()
      const wb = XLSX.read(data)
      const sheet = wb.Sheets[wb.SheetNames[0]]
      const norm = (s) => s.trim().toLowerCase().replace(/[^a-z0-9]/g, '')
      const KNOWN_COLS = ['date', 'heure', 'matricule', 'employe', 'responsable', 'motif', 'demandeur', 'service']
      const aoa = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })
      let hdrIdx = aoa.findIndex(r => r.filter(c => KNOWN_COLS.includes(norm(String(c)))).length >= 2)
      if (hdrIdx < 0) hdrIdx = 0
      const allRows = XLSX.utils.sheet_to_json(sheet, { defval: '', range: hdrIdx })
      const isHeaderRow = (row) => Object.values(row).filter(v => KNOWN_COLS.includes(norm(String(v)))).length >= 2
      const isEmptyRow = (row) => Object.values(row).every(v => v == null || (typeof v === 'string' && v.trim() === ''))
      const rows = allRows.filter(r => !isEmptyRow(r) && !isHeaderRow(r))
      if (rows.length === 0) { setImportError('Le fichier est vide.'); return }
      const headers = Object.keys(rows[0])
      const findCol = (aliases) => headers.find(h => aliases.some(a => norm(h).includes(a)))
      const formatDate = (v) => {
        if (v == null || v === '') return ''
        if (v instanceof Date) {
          const y = v.getUTCFullYear(); const m = String(v.getUTCMonth() + 1).padStart(2, '0'); const d = String(v.getUTCDate()).padStart(2, '0')
          return `${y}-${m}-${d}`
        }
        if (typeof v === 'number') {
          const d = new Date(1899, 11, 30 + v)
          return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
        }
        return parseFrenchDate(String(v))
      }
      const formatTime = (v) => {
        if (v == null || v === '') return ''
        if (v instanceof Date) return `${String(v.getUTCHours()).padStart(2, '0')}:${String(v.getUTCMinutes()).padStart(2, '0')}`
        if (typeof v === 'number') {
          const totalMin = Math.round(v * 1440)
          return `${String(Math.floor(totalMin / 60)).padStart(2, '0')}:${String(totalMin % 60).padStart(2, '0')}`
        }
        return String(v).trim().replace(/h/, ':').slice(0, 5)
      }
      const dateCol = findCol(['date'])
      const heureCol = findCol(['heure'])
      const respCol = findCol(['responsable', 'employe', 'employé'])
      const matriculeCol = findCol(['matricule'])
      const motifCol = findCol(['motif'])
      const demCol = findCol(['demandeur'])
      const servCol = findCol(['service'])
      const ticketCol = findCol(['ticket', 'numero', 'numéro', 'ref'])
      const sample = rows[0]
      const debugInfo = headers.map(h => {
        const v = sample[h]; const t = typeof v
        return `${h}(${t}${v instanceof Date ? ' Date' : ''})`
      }).join(' | ')
      const findEmpByMatricule = (raw) => {
        if (raw == null || raw === '') return null
        const s = String(raw).trim()
        if (!s) return null
        const n = parseInt(s, 10)
        return employees.find(e => e.matricule === s)
          || (Number.isFinite(n) ? employees.find(e => parseInt(e.matricule, 10) === n) : null)
      }
      const parsed = rows.map((row, idx) => {
        const rawResp = respCol ? String(row[respCol] || '').trim() : ''
        const rawMat = matriculeCol ? row[matriculeCol] : ''
        const emp = findEmpByMatricule(rawMat)
          || (rawResp ? employees.find(e => e.name.toLowerCase().includes(rawResp.toLowerCase())) : null)
        const dateVal = dateCol ? row[dateCol] : undefined
        const heureVal = heureCol ? row[heureCol] : undefined
        return {
          key: Date.now() + idx + Math.random(),
          employee_id: emp?.id || '',
          employee_name: emp?.name || rawResp,
          date: formatDate(dateVal),
          heure: formatTime(heureVal),
          motif: motifCol ? String(row[motifCol] || '') : '',
          type: 'intervention',
          ticket: ticketCol ? String(row[ticketCol] || '') : '',
          demandeur: demCol ? String(row[demCol] || '') : '',
          service: servCol ? String(row[servCol] || '') : '',
          _imported: true,
        }
      })
      setInterventions(prev => {
        const hasData = (i) => i.employee_id || i.date || i.heure || i.motif || i.ticket || i.demandeur || i.service
        const kept = prev.filter(i => !i._imported && hasData(i))
        return [...kept, ...parsed]
      })
      setImportedFileName(`${file.name} (${parsed.length} lignes)`)
      const detected = [dateCol && `date[${dateCol}]`, heureCol && `heure[${heureCol}]`, matriculeCol && `matricule[${matriculeCol}]`, respCol && `employé[${respCol}]`, motifCol && `motif[${motifCol}]`, demCol && `demandeur[${demCol}]`, servCol && `service[${servCol}]`, ticketCol && `ticket[${ticketCol}]`].filter(Boolean)
      const unmatched = parsed.filter(p => !p.employee_id).length
      const skipped = allRows.length - rows.length
      setImportFeedback(`${parsed.length} intervention(s) importée(s). Colonnes: ${detected.join(', ')}. Debug: ${debugInfo}${skipped ? ` — ${skipped} ligne(s) vide(s)/en-tête ignorée(s)` : ''}${unmatched ? ` — ⚠ ${unmatched} ligne(s) sans employé reconnu` : ''}`)
    } catch (err) {
      setImportError('Erreur lors de la lecture du fichier : ' + err.message)
    }
    e.target.value = ''
  }

  const clearImported = () => {
    setInterventions(prev => prev.filter(i => !i._imported))
    setImportedFileName('')
    setImportFeedback('')
    setImportError('')
  }

  const handleEmpAdditional = (empId, field, value) => {
    setPerEmployeeAdditional(prev => ({
      ...prev,
      [empId]: { ...prev[empId], [field]: parseFloat(value) || 0 }
    }))
  }
  // --- État du flux CSV commission (création) ---
  const [commCsvFile, setCommCsvFile] = useState(null)
  const [commCsvPath, setCommCsvPath] = useState('')
  const [showSftp, setShowSftp] = useState(false)
  const [commPreview, setCommPreview] = useState(null)
  const [commLoading, setCommLoading] = useState(false)
  // Tableau des ventes (utilisé uniquement en édition d'une prime commission existante)
  const [sales, setSales] = useState([])
  // Prime chargée en édition
  const [loadedBonus, setLoadedBonus] = useState(null)

  const [showAddQuanti, setShowAddQuanti] = useState(false)
  const [showAddQuali, setShowAddQuali] = useState(false)
  const [customMode, setCustomMode] = useState(null)
  const [customCriteria, setCustomCriteria] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [savingTemplate, setSavingTemplate] = useState(false)
  const [templateSaved, setTemplateSaved] = useState(false)
  const [templateLoadedDept, setTemplateLoadedDept] = useState(null)
  const [empSearch, setEmpSearch] = useState('')
  const [empSearchOpen, setEmpSearchOpen] = useState(false)
  const empSearchRef = useRef(null)

  useEffect(() => {
    getEmployees().then(all => {
      if (connectedUser?.is_admin || connectedUser?.is_dg || connectedUser?.is_drh) {
        setEmployees(all)
      } else {
        setEmployees(all.filter(e => e.department === connectedUser?.department))
      }
    }).catch(() => {})
  }, [])

  useEffect(() => {
    if (!empSearchOpen) return
    const handleClick = (e) => {
      if (empSearchRef.current && !empSearchRef.current.contains(e.target)) setEmpSearchOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [empSearchOpen])

  const filteredEmployees = employees.filter(e =>
    e.name?.toLowerCase().includes(empSearch.toLowerCase()) ||
    e.matricule?.toLowerCase().includes(empSearch.toLowerCase())
  )

  useEffect(() => {
    if (!selectedEmp || !editType) return
    const empCurrency = selectedEmp.currency || 'Ar'
    getPrimeMax(selectedEmp.department, editType).then(data => {
      const list = Array.isArray(data) ? data : []
      const match = list.find(p => p.currency === empCurrency) || list.find(p => !p.currency || p.currency === 'Ar')
      const deptMax = match && match.amount != null ? parseFloat(match.amount) : 150000
      const emp = employees.find(e => e.id === selectedEmp.id)
      const empMax = editType === 'mensuel' ? (emp?.mensuel_rate ?? null) : null
      setParams(p => ({ ...p, maxPrime: empMax ?? deptMax }))
    }).catch(() => {})
  }, [selectedEmp?.id, editType])

  useEffect(() => {
    if (!selectedEmp?.id || editType !== 'mensuel' || isEditing || templateLoadedDept === selectedEmp.id) return
    getEvaluationTemplates(selectedEmp.id).then(data => {
      if (data.quantitative && data.quantitative.length > 0) {
        setQuantitative(data.quantitative.map(c => ({ criteria: c.criteria_name, description: c.description || '', coeff: c.coeff, note: 0, value: 0 })))
      }
      if (data.qualitative && data.qualitative.length > 0) {
        setQualitative(data.qualitative.map(c => ({ criteria: c.criteria_name, description: c.description || '', coeff: c.coeff, note: 0, value: 0 })))
      }
      setTemplateLoadedDept(selectedEmp.id)
      setTemplateSaved(false)
    }).catch(() => {})
  }, [selectedEmp?.id, editType, isEditing])

  useEffect(() => {
    if (!isEditing || !id) return;
    getBonus(id).then((b) => {
      setLoadedBonus(b);
      setEditType(b.bonus_type);
      setBonusStatus(b.status || '');
      setSelectedEmp(b.employee || null);
      if (b.employee) setEmployee({ department: b.employee.department || '', service: '', name: b.employee.name, function: '', matricule: b.employee.matricule });
      setParams((p) => ({ ...p, startDate: b.start_date, endDate: b.end_date }));
      if (b.start_date) { setSelectedMonth(b.start_date.substring(0, 7)); setSelectedYear(parseInt(b.start_date.substring(0, 4))); }
      if (b.details) {
        const d = b.details;
        if (d.quantitative) setQuantitative(d.quantitative);
        if (d.qualitative) setQualitative(d.qualitative);
        if (d.sales) setSales(d.sales.map((s, i) => ({ ...s, key: i + 1 })));
        if (d.disponibilites) setDisponibilites(d.disponibilites.map((s, i) => ({ ...s, key: i + 1 })));
        if (d.interventions) setInterventions(d.interventions.map((s, i) => ({ ...s, key: i + 1 })));
        if (d.weekly_max) setAstreinteConfig((c) => ({ ...c, weeklyMax: d.weekly_max, interventionRate: d.intervention_rate }));
        if (d.exceptionnelle !== undefined) setAdditionalPrimes((p) => ({ ...p, exceptionnelle: d.exceptionnelle }));
        if (d.ponctuelle !== undefined) setAdditionalPrimes((p) => ({ ...p, ponctuelle: d.ponctuelle }));
        if (d.others) setOthers(d.others.map((o, i) => ({
          key: Date.now() + Math.random() + i,
          libelle: o.libelle || '',
          type: o.type || 'temporaire',
          typeCustom: o.type === 'autres' ? '' : '',
          file: o.file && o.file.url ? o.file : null,
          fileData: null,
          debut_mois: o.debut_mois ? String(o.debut_mois) : '',
          debut_annee: o.debut_annee ? String(o.debut_annee) : '',
          fin_mois: o.fin_mois ? String(o.fin_mois) : '',
          fin_annee: o.fin_annee ? String(o.fin_annee) : '',
          montant: o.montant || 0,
        })));
      }
      setEditLoaded(true);
    });
  }, [id]);

  const totalQuantiCoeff = quantitative.reduce((s, i) => s + (parseFloat(i.coeff) || 0), 0)
  const totalQualiCoeff = qualitative.reduce((s, i) => s + (parseFloat(i.coeff) || 0), 0)
  const totalCoeff = totalQuantiCoeff + totalQualiCoeff
  const coeffInvalid = totalCoeff > 0 && totalCoeff !== 10
  const periodKey = (o) => (parseInt(o.debut_annee) || 0) * 12 + (parseInt(o.debut_mois) || 0)
  const periodKeyFin = (o) => (parseInt(o.fin_annee) || 0) * 12 + (parseInt(o.fin_mois) || 0)
  const periodInvalid = others.some(o => {
    const d = periodKey(o), f = periodKeyFin(o)
    if (d === 0 || f === 0) return false
    return d > f
  })
  const otherInvalid = others.some(o =>
    !o.libelle?.trim() ||
    !o.type ||
    (o.type === 'autres' && !o.typeCustom?.trim()) ||
    !(parseFloat(o.montant) > 0) ||
    !o.file ||
    !o.debut_mois || !o.debut_annee || !o.fin_mois || !o.fin_annee
  )
  const employeeInvalid = !selectedEmp
  const totalQuantiValue = quantitative.reduce((s, i) => s + i.value, 0)
  const totalQualiValue = qualitative.reduce((s, i) => s + i.value, 0)
  const totalValue = totalQuantiValue + totalQualiValue
  const notesInvalid = totalValue === 0

  if (!editLoaded) {
    return (
      <div className="flex justify-center items-center h-64">
        <span className="loading loading-spinner loading-lg"></span>
      </div>
    )
  }

  if (editLoaded && !['mensuel', 'astreinte', 'commission'].includes(editType)) {
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
    if (field === 'note') {
      const item = newData[index]
      const note = Math.max(0, Math.min(parseFloat(value) || 0, 10))
      newData[index].note = note
      newData[index].value = params.maxPrime * (item.coeff / 10) * (note / 10)
    } else if (field === 'coeff') {
      const item = newData[index]
      const coeff = Math.max(0, Math.min(parseFloat(value) || 0, 10))
      newData[index].coeff = coeff
      newData[index].value = params.maxPrime * (coeff / 10) * (item.note / 10)
    } else {
      newData[index][field] = value
    }
    setter(newData)
  }

  const getAvailableCriteria = (currentList, defaults) =>
    defaults.filter((c) => !currentList.some((item) => item.criteria === c))
  const doDelete = () => {
    if (confirmDelete) {
      const { list, setter, index } = confirmDelete
      setter(list.filter((_, i) => i !== index))
      setConfirmDelete(null)
    }
  }

  const removeEvalItem = (list, setter, index) => {
    setConfirmDelete({ list, setter, index })
  }

  const addEvalItem = (list, setter, criteria, section) => {
    setter([...list, { criteria, description: '', coeff: 0, note: 0, value: 0 }])
  }

  const handleConfigChange = (field, value) => {
    setAstreinteConfig({ ...astreinteConfig, [field]: value })
  }

  const handleSaveTemplate = async () => {
    if (!selectedEmp?.id) return
    setSavingTemplate(true)
    try {
      await saveEvaluationTemplates({
        employee_id: selectedEmp.id,
        quantitative: quantitative.map((c, i) => ({
          criteria_name: c.criteria,
          description: c.description || '',
          coeff: c.coeff,
          sort_order: i,
        })),
        qualitative: qualitative.map((c, i) => ({
          criteria_name: c.criteria,
          description: c.description || '',
          coeff: c.coeff,
          sort_order: i,
        })),
      })
      setTemplateSaved(true)
    } catch (err) {
      setError("Erreur lors de la sauvegarde du modele")
    } finally {
      setSavingTemplate(false)
    }
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
    setInterventions([...interventions, { key: Date.now(), employee_id: '', date: '', heure: '', motif: '', ticket: '', type: 'intervention', demandeur: '', service: '' }])
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
      setError('Seuls les départements Direction BBS, Direction des Operations, Direction des Systemes d\'Informations, Direction Technique sont autorisés pour les primes d\'astreinte.')
      setLoading(false); return
    }

    try {
      await Promise.all(allEmpIds.map(employee_id => {
        const empDispos = disponibilites.filter(d => d.employee_id === employee_id)
        const empIntervs = interventions.filter(i => i.employee_id === employee_id)
        const totalDispo = empDispos.reduce((s, d) => s + (parseFloat(d.nombre) || 0) * getRate(d.employee_id), 0)
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
              date: i.date, heure: i.heure, motif: i.motif, type: i.type || 'intervention', ticket: i.ticket,
              demandeur: i.demandeur || '', service: i.service || '',
            })),
            total_dispo: totalDispo,
            total_interv: empIntervs.length * astreinteConfig.interventionRate,
            total_interv_exceptionnelle: empIntervs.filter(i => i.type === 'exceptionnelle').length * astreinteConfig.interventionRate,
            total_interv_ponctuelle: empIntervs.filter(i => i.type === 'ponctuelle').length * astreinteConfig.interventionRate,
            exceptionnelle: empAdd.exceptionnelle || 0,
            ponctuelle: empAdd.ponctuelle || 0,
          },
        })
      }))
      navigateAfterSave()
    } catch (err) {
      setError(err.response?.status === 409 ? 'Cette prime existe déjà pour cet employé sur cette période.' : `Erreur (${err.response?.status}): ${err.response?.data?.detail || err.message || "inconnue"}`)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } finally {
      setLoading(false)
    }
  }

  const handleSftpSelect = (file, info) => {
    setCommCsvFile(file)
    setCommCsvPath(info?.path || '')
    setCommPreview(null)
  }

  const handlePreviewCommission = async () => {
    setError('')
    setCommPreview(null)
    if (!commCsvFile) { setError("Sélectionnez d'abord le fichier CSV 4D des ventes."); return }
    if (!params.startDate || !params.endDate) { setError('Sélectionnez la période.'); return }
    setCommLoading(true)
    try {
      const data = await previewCommissionImport(commCsvFile, params.startDate, params.endDate)
      setCommPreview(data)
    } catch (err) {
      setError(err.response?.data?.detail || 'Erreur lors du calcul des commissions.')
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } finally {
      setCommLoading(false)
    }
  }

  const handleSubmitCommission = async (e) => {
    e.preventDefault()
    setError('')
    if (!commPreview || !commCsvFile) { setError("Calculez d'abord les commissions (aperçu)."); return }
    setCommLoading(true)
    try {
      const result = await importCommissionBonuses(commCsvFile, params.startDate, params.endDate)
      const totalAr = (result.total_amount ?? 0).toLocaleString('fr-FR')
      const msg = `${result.count} prime(s) commission créée(s) pour un total de ${totalAr} Ar.`
        + (result.skipped?.length ? ` ${result.skipped.length} employé(s) ignoré(s) (prime déjà existante sur la période).` : '')
      navigate('/bonuses', { state: { success: msg } })
    } catch (err) {
      setError(err.response?.data?.detail || 'Erreur lors de la création des primes commission.')
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } finally {
      setCommLoading(false)
    }
  }

  const handleSubmitCommissionEdit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await updateBonus(id, {
        start_date: params.startDate,
        end_date: params.endDate,
        bonus_type: 'commission',
        total_amount: parseFloat(loadedBonus?.total_amount ?? 0),
        commission_amount: loadedBonus?.commission_amount != null
          ? parseFloat(loadedBonus.commission_amount)
          : parseFloat(loadedBonus?.total_amount ?? 0),
        details: loadedBonus?.details,
      })
      navigate(`/bonuses/${id}`)
    } catch (err) {
      setError(err.response?.status === 409 ? 'Cette prime existe déjà pour cet employé sur cette période.' : `Erreur (${err.response?.status}): ${err.response?.data?.detail || err.message || "inconnue"}`)
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
    try {
      await Promise.all(allEmpIds.map(employee_id => {
        const empMaxRate = getMensuelRate(employee_id)
        const maxPrime = empMaxRate ?? params.maxPrime
        const amount = Math.min(totalValue, maxPrime)
          return saveBonus({
            employee_id,
            start_date: params.startDate,
            end_date: params.endDate,
            bonus_type: 'mensuel',
            performance_score: totalCoeff,
            total_amount: amount + othersTotal,
            details: {
              prime_max: maxPrime,
              quantitative: quantitative.map((c) => ({
                criteria: c.criteria, description: c.description,
                coeff: c.coeff, note: c.note, value: c.value,
              })),
              qualitative: qualitative.map((c) => ({
                criteria: c.criteria, description: c.description,
                coeff: c.coeff, note: c.note, value: c.value,
              })),
              total_quantitative: totalQuantiValue,
              total_qualitative: totalQualiValue,
              total_evaluation: totalValue,
              others: others.map(o => ({
                libelle: o.libelle, type: o.type === 'autres' ? o.typeCustom : o.type,
                file: o.file ? { filename: o.file.filename, original_name: o.file.original_name, url: o.file.url } : null,
                debut_mois: o.debut_mois, debut_annee: o.debut_annee, fin_mois: o.fin_mois, fin_annee: o.fin_annee, montant: parseFloat(o.montant) || 0,
              })),
            },
          })
      }))
      navigateAfterSave()
    } catch (err) {
      setError(err.response?.status === 409 ? 'Cette prime existe déjà pour cet employé sur cette période.' : `Erreur (${err.response?.status}): ${err.response?.data?.detail || err.message || "inconnue"}`)
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
        bonus_type: editType,
        total_amount: parseFloat(simpleForm.total_amount),
      }
      const extraFields = editType === 'astreinte'
        ? ['nb_jours_astreinte', 'taux_jour', 'prime_astreinte_amount']
        : ['ca_realise', 'ca_objectif', 'taux_commission', 'commission_amount']
      for (const f of extraFields) {
        if (simpleForm[f]) payload[f] = parseFloat(simpleForm[f])
      }
      await saveBonus(payload)
      navigateAfterSave()
    } catch (err) {
      setError(err.response?.status === 409 ? 'Cette prime existe déjà pour cet employé sur cette période.' : `Erreur (${err.response?.status}): ${err.response?.data?.detail || err.message || "inconnue"}`)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } finally {
      setLoading(false)
    }
  }

  const renderField = (name, label, placeholder, step = 'any') => (
    <div key={name}>
      <label className="block text-sm font-medium text-base-content/70 mb-0.5">{label}</label>
      <input type="number" step={step} name={name} value={simpleForm[name]} onChange={handleSimpleChange}
        className="w-full px-3 py-2 rounded-lg border border-base-300 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500"
        placeholder={placeholder} />
    </div>
  )

  const sharedHeader = (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-2">
      <div className="card-blueline p-3">
        <h2 className="font-semibold text-base-content mb-2 text-sm">{editType === 'astreinte' ? 'Responsable' : editType === 'commission' && !isEditing ? 'Import CSV 4D' : "Informations de l'employé"}</h2>
        <div className="space-y-1.5">
          {editType === 'astreinte' ? (
            <div className="bg-blue-50 text-blue-700 text-sm rounded-lg px-3 py-2">
              Les employés sont définis dans les tableaux ci-dessous. Une prime sera créée par employé.
            </div>
          ) : editType === 'commission' && !isEditing ? (
            <div className="bg-blue-50 text-blue-700 text-sm rounded-lg px-3 py-2 space-y-1">
              <p>Les primes commission sont calculées à partir du <b>fichier CSV 4D</b> des ventes du mois (séparateur <b>;</b>).</p>
              <p>Une prime <b>Initialisée</b> sera créée par employé trouvé (matricule exact) ayant réalisé au moins une vente.</p>
            </div>
          ) : isEditing ? (
            <div className="space-y-1.5">
              <div>
                <label className="block text-sm font-medium text-base-content/70 mb-0.5">Nom et prénom</label>
                <input type="text" value={employee.name} readOnly className="w-full px-3 py-2 rounded-lg border border-base-200 bg-base-100 text-base-content/60" />
              </div>
              <div>
                <label className="block text-sm font-medium text-base-content/70 mb-0.5">Matricule</label>
                <input type="text" value={employee.matricule} readOnly className="w-full px-3 py-2 rounded-lg border border-base-200 bg-base-100 text-base-content/60" />
              </div>
              <div>
                <label className="block text-sm font-medium text-base-content/70 mb-0.5">Département</label>
                <input type="text" value={employee.department} readOnly className="w-full px-3 py-2 rounded-lg border border-base-200 bg-base-100 text-base-content/60" />
              </div>
            </div>
          ) : (
            <div className="space-y-1.5">
              <div ref={empSearchRef} className="relative">
                <label className="block text-sm font-medium text-base-content/70 mb-0.5">Employé</label>
                <input
                  type="text"
                  placeholder="Rechercher par nom ou matricule..."
                  value={empSearchOpen ? empSearch : (selectedEmp ? `${selectedEmp.name} (${selectedEmp.matricule})` : '')}
                  onFocus={() => { setEmpSearchOpen(true); setEmpSearch('') }}
                  onChange={(e) => { setEmpSearch(e.target.value); setEmpSearchOpen(true) }}
                  className="w-full px-3 py-2 rounded-lg border border-base-300 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500"
                />
                {empSearchOpen && (
                  <div className="absolute z-50 mt-1 w-full max-h-60 overflow-y-auto bg-white rounded-lg border border-base-300 shadow-lg">
                    {filteredEmployees.length === 0 ? (
                      <div className="px-3 py-2 text-sm text-base-content/40">Aucun employé trouvé</div>
                    ) : (
                      filteredEmployees.map(e => (
                        <button
                          key={e.id}
                          type="button"
                          onClick={() => {
                            handleSelectEmployee({ target: { value: e.id } })
                            setEmpSearchOpen(false)
                            setEmpSearch('')
                          }}
                          className={`w-full text-left px-3 py-2 text-sm hover:bg-base-100 transition-colors ${
                            selectedEmp?.id === e.id ? 'bg-brand-50 text-brand-700 font-medium' : 'text-base-content'
                          }`}
                        >
                          <span>{e.name}</span>
                          <span className="text-xs text-base-content/40 ml-1">({e.matricule})</span>
                          <span className="text-xs text-base-content/30 ml-1">— {e.department}</span>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-base-content/70 mb-0.5">Département</label>
                <input type="text" value={employee.department} readOnly className="w-full px-3 py-2 rounded-lg border border-base-200 bg-base-100 text-base-content/60" />
              </div>
              <div>
                <label className="block text-sm font-medium text-base-content/70 mb-0.5">Nom et prénom</label>
                <input type="text" value={employee.name} readOnly className="w-full px-3 py-2 rounded-lg border border-base-200 bg-base-100 text-base-content/60" />
              </div>
              <div>
                <label className="block text-sm font-medium text-base-content/70 mb-0.5">Matricule</label>
                <input type="text" value={employee.matricule} readOnly className="w-full px-3 py-2 rounded-lg border border-base-200 bg-base-100 text-base-content/60" />
              </div>
              <div>
                <label className="block text-sm font-medium text-base-content/70 mb-0.5">Service</label>
                <input type="text" value={employee.service} onChange={(e) => setEmployee({ ...employee, service: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-base-300 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500" />
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="card-blueline p-3">
        <h2 className="font-semibold text-base-content mb-2 text-sm">Responsable & Période</h2>
        <div className="space-y-1.5">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-sm font-medium text-base-content/70 mb-0.5">Nom du responsable</label>
              <input type="text" value={connectedUser?.name || ''} readOnly className="w-full px-3 py-2 rounded-lg border border-base-200 bg-base-100 text-base-content/60" />
            </div>
            <div>
              <label className="block text-sm font-medium text-base-content/70 mb-0.5">Rôle</label>
              <input type="text" value={connectedUser?.is_admin ? 'Admin' : connectedUser?.is_dg ? 'Directeur Général' : connectedUser?.is_drh ? 'DRH' : connectedUser?.is_directeur ? 'Directeur' : connectedUser?.is_validator_n1 ? 'Validateur N+1' : 'Utilisateur'} readOnly className="w-full px-3 py-2 rounded-lg border border-base-200 bg-base-100 text-base-content/60" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-base-content/70 mb-0.5">Fonction</label>
            <input type="text" value={connectedUser?.poste || ''} readOnly className="w-full px-3 py-2 rounded-lg border border-base-200 bg-base-100 text-base-content/60" />
            </div>
            {editType === 'astreinte' ? (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-base-content/70 mb-0.5">Date début</label>
                  <input type="date" value={params.startDate} onChange={(e) => setParams({ ...params, startDate: e.target.value })} className={`w-full px-3 py-2 rounded-lg border focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 ${params.endDate < params.startDate ? 'border-red-400' : 'border-base-300'}`} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-base-content/70 mb-0.5">Date fin</label>
                  <input type="date" value={params.endDate} onChange={(e) => setParams({ ...params, endDate: e.target.value })} className={`w-full px-3 py-2 rounded-lg border focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 ${params.endDate < params.startDate ? 'border-red-400' : 'border-base-300'}`} />
                </div>
              </div>
            ) : (
              <div>
                <label className="block text-sm font-medium text-base-content/70 mb-0.5">Mois</label>
                <div className="flex gap-2 items-start">
                  <select value={selectedMonth} onChange={(e) => {
                    const val = e.target.value
                    setSelectedMonth(val)
                    const [y, m] = val.split('-')
                    const last = new Date(parseInt(y), parseInt(m), 0).toISOString().split('T')[0]
                    setParams(p => ({ ...p, startDate: val + '-01', endDate: last }))
                  }}
                  className="w-44 px-3 py-2 rounded-lg border border-base-300 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 text-sm">
                    {months.map((m, i) => {
                      const idx = String(i + 1).padStart(2, '0')
                      return <option key={idx} value={`${selectedYear}-${idx}`}>{m}</option>
                    })}
                  </select>
                  <select value={selectedYear} onChange={(e) => {
                    const y = e.target.value
                    setSelectedYear(y)
                    const idx = selectedMonth.split('-')[1]
                    const last = new Date(parseInt(y), parseInt(idx), 0).toISOString().split('T')[0]
                    const newVal = y + '-' + idx
                    setSelectedMonth(newVal)
                    setParams(p => ({ ...p, startDate: newVal + '-01', endDate: last }))
                  }}
                  className="w-28 px-3 py-2 rounded-lg border border-base-300 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 text-sm">
                    {years.map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                  <button type="button" onClick={() => {
                    const now = new Date()
                    const y = now.getFullYear()
                    const m = String(now.getMonth() + 1).padStart(2, '0')
                    const val = y + '-' + m
                    setSelectedYear(y)
                    setSelectedMonth(val)
                    const last = new Date(y, now.getMonth() + 1, 0).toISOString().split('T')[0]
                    setParams(p => ({ ...p, startDate: val + '-01', endDate: last }))
                  }}
                  className="btn btn-sm btn-ghost px-2 mt-0 text-xs text-brand-600 hover:bg-brand-50 whitespace-nowrap">Mois en cours</button>
                </div>
              </div>
            )}
            {editType === 'astreinte' && params.endDate < params.startDate && (
              <p className="text-red-500 text-sm mt-0.5">⚠️ La date de fin ne peut pas être avant la date de début.</p>
            )}
          {editType === 'astreinte' ? (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-sm font-medium text-base-content/70 mb-0.5">Prime max / semaine (Ar)</label>
                <input type="number" value={astreinteConfig.weeklyMax} onChange={(e) => handleConfigChange('weeklyMax', e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-base-300 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-base-content/70 mb-0.5">Nombre de semaines</label>
                <input type="number" value={calcWeeks(params.startDate, params.endDate)} readOnly
                  className="w-full px-3 py-2 rounded-lg border border-base-200 bg-base-100 text-base-content/60" />
              </div>
            </div>
          ) : editType !== 'commission' && (
            <div>
              <label className="block text-sm font-medium text-base-content/70 mb-0.5">Prime maximum ({formCurrency})</label>
              {showPrimeMax ? (
                <input type="number" value={params.maxPrime} readOnly
                  className="w-full px-3 py-2 rounded-lg border border-base-200 bg-base-100 text-base-content/60 cursor-not-allowed" />
              ) : (
                <input type="text" value="••••••" readOnly
                  className="w-full px-3 py-2 rounded-lg border border-base-200 bg-base-100 text-base-content/60 cursor-not-allowed" />
              )}
              <p className="text-[11px] text-base-content/40 mt-0.5">Modifiable dans la page Plafonds</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )

  if (editType === 'commission') {
    const fmtAr = (n) => seeAmounts ? (parseFloat(n) || 0).toLocaleString('fr-FR') : '••••••'

    // ----- Mode édition : consultation des détails, enregistrement tel quel -----
    if (isEditing) {
      const editTotal = parseFloat(loadedBonus?.total_amount ?? 0)
      return (
        <div className="page-container !px-2 max-w-full">
          <div className="flex items-center gap-3 mb-6">
            <Link to={`/bonuses/${id}`} className="p-2 rounded-lg hover:bg-base-200"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg></Link>
            <div className="flex items-center gap-2"><ChartIcon className="w-6 h-6 text-blue-600" /><div><h1 className="page-title">Prime Commission</h1><p className="text-sm text-base-content/50">Prime commission (import CSV 4D)</p></div></div>
          </div>
          {error && <div className="bg-red-50 text-red-700 text-sm rounded-lg px-4 py-3 mb-3 flex items-center gap-2"><ExclamationIcon className="w-4 h-4" />{error}</div>}
          <form onSubmit={handleSubmitCommissionEdit} className="space-y-3">
            {sharedHeader}
            <div className="card-blueline p-4">
              <h2 className="font-semibold text-base-content text-sm mb-3">Détail des commissions</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-300">
                      <th className="text-left py-2 px-2 font-medium text-gray-600 text-xs">Produit</th>
                      <th className="text-center py-2 px-2 font-medium text-gray-600 text-xs">Ventes</th>
                      <th className="text-right py-2 px-2 font-medium text-gray-600 text-xs">Taux (Ar)</th>
                      <th className="text-center py-2 px-2 font-medium text-gray-600 text-xs">Objectif</th>
                      <th className="text-center py-2 px-2 font-medium text-gray-600 text-xs">Doublé</th>
                      <th className="text-right py-2 px-2 font-medium text-gray-600 text-xs">Montant (Ar)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sales.map((sale, i) => (
                      <tr key={i} className="border-b border-gray-200">
                        <td className="py-1.5 px-2 text-gray-900">{sale.designation || '—'}</td>
                        <td className="py-1.5 px-2 text-center">{sale.nombre ?? 0}</td>
                        <td className="py-1.5 px-2 text-right">{fmtAr(sale.taux)}</td>
                        <td className="py-1.5 px-2 text-center">{sale.objectif ?? '—'}</td>
                        <td className="py-1.5 px-2 text-center">{sale.doublé ? 'Oui' : 'Non'}</td>
                        <td className="py-1.5 px-2 text-right font-medium">{fmtAr(sale.montant)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="font-semibold border-t-2 border-brand-200">
                      <td colSpan={5} className="py-2 px-2 text-right">Total commission</td>
                      <td className="py-2 px-2 text-right text-brand-600">{fmtAr(editTotal)} Ar</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
            <div className="flex gap-3 justify-end">
              <Link to={`/bonuses/${id}`} className="btn btn-ghost">Retour</Link>
              <button type="submit" disabled={loading || isReadOnly} className="btn bg-brand-600 hover:bg-brand-700 text-white border-0">
                {loading ? <span className="loading loading-spinner" /> : 'Enregistrer'}
              </button>
            </div>
          </form>
        </div>
      )
    }

    // ----- Mode création : import CSV 4D + aperçu + validation -----
    const previewCount = commPreview?.count ?? 0
    const totalAmount = commPreview?.total_amount ?? 0

    return (
      <>
      <div className="page-container !px-2 max-w-full">
        <div className="flex items-center gap-3 mb-6">
          <Link to="/bonuses/new" className="p-2 rounded-lg hover:bg-base-200"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg></Link>
          <div className="flex items-center gap-2"><ChartIcon className="w-6 h-6 text-blue-600" /><div><h1 className="page-title">Prime Commission</h1><p className="text-sm text-base-content/50">Calcul à partir du fichier CSV 4D des ventes</p></div></div>
        </div>
        {error && <div className="bg-red-50 text-red-700 text-sm rounded-lg px-4 py-3 mb-3 flex items-center gap-2"><ExclamationIcon className="w-4 h-4" />{error}</div>}
        <form onSubmit={handleSubmitCommission} className="space-y-3">
          {sharedHeader}
          <div className="card-blueline p-4">
            <h2 className="font-semibold text-base-content text-sm mb-2">Fichier CSV 4D des ventes</h2>
            <div className="flex flex-col md:flex-row md:items-end gap-3">
              <div className="flex-1">
                <label className="block text-sm font-medium text-base-content/70 mb-0.5">Fichier (séparateur ;, encodage UTF-8)</label>
                <button type="button" onClick={() => setShowSftp(true)}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-base-300 bg-white hover:border-brand-500 hover:ring-2 hover:ring-brand-500/20 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 text-left">
                  <svg className="w-4 h-4 text-brand-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" />
                  </svg>
                  {commCsvFile
                    ? <span className="text-base-content font-medium truncate">{commCsvFile.name}</span>
                    : <span className="text-base-content/50">Choisir le fichier CSV 4D sur le serveur SFTP…</span>}
                </button>
                {commCsvFile && commCsvPath && (
                  <p className="text-[11px] text-base-content/40 mt-1 truncate">SFTP : {commCsvPath}</p>
                )}
              </div>
              <button type="button" onClick={handlePreviewCommission} disabled={commLoading}
                className="btn bg-brand-600 hover:bg-brand-700 text-white border-0 shrink-0">
                {commLoading ? <span className="loading loading-spinner loading-sm" /> : 'Calculer les commissions'}
              </button>
            </div>
            <p className="text-[11px] text-base-content/40 mt-2">
              Colonnes attendues : Nom ; Matricule ; Point de vente ; &lt;produits&gt;. La colonne « Point de vente » (Grand/Petit) sélectionne le bon objectif du barème. Les noms de produits doivent correspondre au barème (page Barème commission). Employés ou produits non trouvés : ignorés.
            </p>
          </div>

          {commPreview && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="card-blueline p-3">
                  <p className="text-xs text-base-content/50">Primes à créer</p>
                  <p className="text-xl font-bold text-base-content">{commPreview.count}</p>
                </div>
                <div className="card-blueline p-3">
                  <p className="text-xs text-base-content/50">Total commission</p>
                  <p className="text-xl font-bold text-brand-600">{fmtAr(totalAmount)} Ar</p>
                </div>
                <div className="card-blueline p-3">
                  <p className="text-xs text-base-content/50">Produits reconnus</p>
                  <p className="text-base font-medium text-base-content">{commPreview.matched_products?.length ?? 0}</p>
                </div>
              </div>

              <div className="card-blueline p-4">
                <h2 className="font-semibold text-base-content text-sm mb-3">Aperçu par employé</h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-300">
                        <th className="text-left py-2 px-2 font-medium text-gray-600 text-xs">Matricule</th>
                        <th className="text-left py-2 px-2 font-medium text-gray-600 text-xs">Employé</th>
                        <th className="text-center py-2 px-2 font-medium text-gray-600 text-xs">PDV</th>
                        <th className="text-left py-2 px-2 font-medium text-gray-600 text-xs">Produit</th>
                        <th className="text-center py-2 px-2 font-medium text-gray-600 text-xs">Ventes</th>
                        <th className="text-right py-2 px-2 font-medium text-gray-600 text-xs">Taux (Ar)</th>
                        <th className="text-center py-2 px-2 font-medium text-gray-600 text-xs">Objectif</th>
                        <th className="text-center py-2 px-2 font-medium text-gray-600 text-xs">Doublé</th>
                        <th className="text-right py-2 px-2 font-medium text-gray-600 text-xs">Montant (Ar)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {commPreview.employees.map((emp) => (
                        <Fragment key={emp.employee_id}>
                          {emp.lines.map((line, i) => (
                            <tr key={i} className="border-b border-gray-200">
                              {i === 0 && (
                                <>
                                  <td className="py-1.5 px-2 text-gray-900 font-medium align-top" rowSpan={emp.lines.length}>{emp.matricule}</td>
                                  <td className="py-1.5 px-2 text-gray-900 align-top" rowSpan={emp.lines.length}>
                                    {emp.name}
                                    <span className="block text-[11px] text-gray-400">{emp.department}</span>
                                  </td>
                                  <td className="py-1.5 px-2 text-center align-top" rowSpan={emp.lines.length}>
                                    {emp.is_gpv
                                      ? <span className="badge badge-primary badge-sm border-0">GPV</span>
                                      : <span className="badge badge-ghost badge-sm text-gray-500">Petit</span>}
                                    {emp.barème_fallback && (
                                      <span className="block mt-1 text-[10px] text-amber-600 font-medium">⚠ barème exact absent</span>
                                    )}
                                  </td>
                                </>
                              )}
                              <td className="py-1.5 px-2 text-gray-800">{line.designation}</td>
                              <td className="py-1.5 px-2 text-center">{line.nombre}</td>
                              <td className="py-1.5 px-2 text-right">{fmtAr(line.taux)}</td>
                              <td className="py-1.5 px-2 text-center">{line.objectif}</td>
                              <td className="py-1.5 px-2 text-center">{line.doublé ? <span className="badge badge-success badge-sm">Oui</span> : '—'}</td>
                              <td className="py-1.5 px-2 text-right font-medium">{fmtAr(line.montant)}</td>
                            </tr>
                          ))}
                          <tr className="bg-gray-50 border-b border-gray-200">
                            <td colSpan={8} className="py-1.5 px-2 text-right text-gray-700 font-medium">Total {emp.name}</td>
                            <td className="py-1.5 px-2 text-right text-brand-600 font-semibold">{fmtAr(emp.total)}</td>
                          </tr>
                        </Fragment>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="font-semibold border-t-2 border-brand-200">
                        <td colSpan={8} className="py-2 px-2 text-right">Total général</td>
                        <td className="py-2 px-2 text-right text-brand-600">{fmtAr(totalAmount)} Ar</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {(commPreview.ignored_employees?.length > 0 || commPreview.ignored_columns?.length > 0) && (
                  <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                    {commPreview.ignored_employees?.length > 0 && (
                      <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
                        <p className="font-medium text-amber-800 mb-1">Employés ignorés (matricule introuvable) : {commPreview.ignored_employees.length}</p>
                        <p className="text-amber-700 break-words">{commPreview.ignored_employees.join(', ')}</p>
                      </div>
                    )}
                    {commPreview.ignored_columns?.length > 0 && (
                      <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
                        <p className="font-medium text-amber-800 mb-1">Colonnes ignorées (hors barème) : {commPreview.ignored_columns.length}</p>
                        <p className="text-amber-700 break-words">{commPreview.ignored_columns.join(', ')}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="flex gap-3 justify-end">
                <Link to="/bonuses/new" className="btn btn-ghost">Annuler</Link>
                <button type="submit" disabled={commLoading || previewCount === 0} className="btn bg-brand-600 hover:bg-brand-700 text-white border-0">
                  {commLoading ? <span className="loading loading-spinner" /> : `Valider et créer ${previewCount} prime(s) commission`}
                </button>
              </div>
            </>
          )}
        </form>
      </div>
      <SftpFilePicker open={showSftp} onClose={() => setShowSftp(false)} onSelect={handleSftpSelect} />
      </>
    )
  }

  if (editType === 'astreinte') {
    const weeks = calcWeeks(params.startDate, params.endDate)
    const totalDispo = disponibilites.reduce((s, d) => s + (parseFloat(d.nombre) || 0) * getRate(d.employee_id), 0)
    const totalInterv = interventions.filter(i => i.employee_id).length * astreinteConfig.interventionRate
    const totalGeneral = totalDispo + totalInterv + Object.values(perEmployeeAdditional).reduce((s, v) => s + (v.exceptionnelle || 0) + (v.ponctuelle || 0), 0)
    const primeCount = [...new Set([...disponibilites.map(d => d.employee_id), ...interventions.map(i => i.employee_id)])].filter(Boolean).length
    const employeeTotals = {}
    disponibilites.forEach(d => {
      if (!d.employee_id) return
      const emp = employees.find(e => e.id === d.employee_id)
      if (!employeeTotals[d.employee_id]) employeeTotals[d.employee_id] = { name: emp ? emp.name : `#${d.employee_id}`, dispo: 0, interv: 0, exceptionnelle: 0, ponctuelle: 0 }
      employeeTotals[d.employee_id].dispo += (parseFloat(d.nombre) || 0) * getRate(d.employee_id)
    })
    interventions.forEach(iv => {
      if (!iv.employee_id) return
      const emp = employees.find(e => e.id === iv.employee_id)
      if (!employeeTotals[iv.employee_id]) employeeTotals[iv.employee_id] = { name: emp ? emp.name : `#${iv.employee_id}`, dispo: 0, interv: 0, exceptionnelle: 0, ponctuelle: 0 }
      const t = (iv.type || 'intervention')
      if (t === 'exceptionnelle') employeeTotals[iv.employee_id].exceptionnelle += astreinteConfig.interventionRate
      else if (t === 'ponctuelle') employeeTotals[iv.employee_id].ponctuelle += astreinteConfig.interventionRate
      else employeeTotals[iv.employee_id].interv += astreinteConfig.interventionRate
    })
    Object.keys(employeeTotals).forEach(id => {
      const add = perEmployeeAdditional[id] || {}
      employeeTotals[id].exceptionnelle += add.exceptionnelle || 0
      employeeTotals[id].ponctuelle += add.ponctuelle || 0
    })

    return (
      <div className="page-container !px-2 max-w-full">
        <div className="flex items-center gap-3 mb-6">
          <Link to="/bonuses/new" className="p-2 rounded-lg hover:bg-base-200"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg></Link>
          <div className="flex items-center gap-2"><MoonIcon className="w-6 h-6 text-blue-600" /><div><h1 className="page-title">Prime d'Astreinte</h1><p className="text-sm text-base-content/50">Gestion des astreintes et interventions</p></div></div>
        </div>
        {error && <div className="bg-red-50 text-red-700 text-sm rounded-lg px-4 py-3 mb-3 flex items-center gap-2"><ExclamationIcon className="w-4 h-4" />{error}</div>}
        {isReadOnly && (
          <div className="bg-blue-50 text-blue-700 text-sm rounded-lg px-4 py-3 mb-3 flex items-center gap-2">
            <ExclamationIcon className="w-4 h-4" /> Cette prime a été modifiée par le DG. Vous pouvez consulter les détails mais pas modifier.
          </div>
        )}
        <form onSubmit={handleSubmitAstreinte} className="space-y-3">
          {sharedHeader}

          <div className="card-blueline p-4">
            <div className="flex items-center justify-between mb-2">
              <h2 className="font-semibold text-base-content text-sm">Disponibilité</h2>
              <button type="button" onClick={addDispoRow} className="btn btn-sm bg-brand-600 hover:bg-brand-700 text-white border-0">+ Ajouter</button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-300">
                    <th className="text-left py-2 px-2 font-medium text-gray-700">Employé</th>
                    <th className="text-center py-2 px-2 font-medium text-gray-700 w-24">Nombre</th>
                    <th className="text-right py-2 px-2 font-medium text-gray-700 w-36">Montant (Ar)</th>
                    <th className="w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {disponibilites.map((d, i) => (
                    <tr key={d.key} className="border-b border-gray-200">
                      <td className="py-1 px-2">
                        <select value={d.employee_id} onChange={(e) => handleDispoChange(i, 'employee_id', parseInt(e.target.value))}
                          className="w-full px-2 py-1 rounded border border-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 text-sm">
                          <option value="">Sélectionner...</option>
                          {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
                        </select>
                      </td>
                      <td className="py-1 px-2 text-center">
                        <input type="number" value={d.nombre} min="0" max={weeks} onChange={(e) => handleDispoChange(i, 'nombre', e.target.value)}
                          className={`w-16 px-2 py-1 rounded border text-sm text-center focus:outline-none focus:ring-2 focus:ring-brand-500/30 ${(parseFloat(d.nombre) || 0) > weeks ? 'border-red-400 bg-red-50' : 'border-gray-400'}`} />
                        {(parseFloat(d.nombre) || 0) > weeks && <span className="text-red-500 text-xs block">max {weeks}</span>}
                      </td>
                      <td className="py-1 px-2 text-right font-medium">
                        {seeAmounts ? ((parseFloat(d.nombre) || 0) * getRate(d.employee_id)).toLocaleString('fr-FR') : '••••••'}
                      </td>
                      <td className="py-1 px-2 text-center">
                        <button type="button" onClick={() => removeDispoRow(i)} className="text-red-500 hover:text-red-700 text-sm">✕</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="font-semibold border-t-2 border-gray-400">
                    <td colSpan="2" className="py-2 px-2 text-right">Total Disponibilité</td>
                    <td className="py-2 px-2 text-right text-brand-600">{maskAr(totalDispo)}</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          <div className="card-blueline p-4">
            <div className="flex items-center justify-between mb-2">
              <div>
                <h2 className="font-semibold text-base-content text-sm">Interventions</h2>
                <p className="text-xs text-base-content/50">Taux : {seeAmounts ? `${Number(astreinteConfig.interventionRate).toLocaleString('fr-FR')} Ar` : '••••••'} / intervention</p>
              </div>
              <div className="flex gap-2 items-center">
                {importedFileName && <span className="text-xs text-base-content/70 flex items-center gap-1 bg-base-200 px-2 py-1 rounded"><span className="truncate max-32">{importedFileName}</span><button type="button" onClick={clearImported} className="text-red-500 hover:text-red-700 text-sm leading-none">✕</button></span>}
                {importFeedback && !importedFileName && <span className="text-xs text-green-600 self-center">{importFeedback}</span>}
                {importError && <span className="text-xs text-red-600 self-center">{importError}</span>}
                <input ref={importFileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImportExcel} />
                <button type="button" onClick={() => importFileRef.current?.click()} className="btn btn-sm bg-emerald-600 hover:bg-emerald-700 text-white border-0">Importer Excel</button>
                <button type="button" onClick={addIntervRow} className="btn btn-sm bg-brand-600 hover:bg-brand-700 text-white border-0">+ Ajouter</button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-300">
                    <th className="text-left py-2 px-2 font-medium text-gray-700">Employé</th>
                    <th className="text-center py-2 px-2 font-medium text-gray-700">Date</th>
                    <th className="text-center py-2 px-2 font-medium text-gray-700">Heure</th>
                    <th className="text-left py-2 px-2 font-medium text-gray-700">Demandeur</th>
                    <th className="text-left py-2 px-2 font-medium text-gray-700">Service</th>
                    <th className="text-left py-2 px-2 font-medium text-gray-700">Motif</th>
                    <th className="text-center py-2 px-2 font-medium text-gray-700">Type</th>
                    <th className="text-center py-2 px-2 font-medium text-gray-700">Ticket</th>
                    <th className="text-right py-2 px-2 font-medium text-gray-700">Montant (Ar)</th>
                    <th className="w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {interventions.map((iv, i) => (
                    <tr key={iv.key} className="border-b border-gray-200">
                      <td className="py-1 px-2">
                        <select value={iv.employee_id} onChange={(e) => handleIntervChange(i, 'employee_id', parseInt(e.target.value))}
                          className="w-full px-2 py-1 rounded border border-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 text-sm">
                          <option value="">Sélectionner...</option>
                          {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
                        </select>
                      </td>
                      <td className="py-1 px-2">
                        <input type="date" value={iv.date} min={params.startDate} max={params.endDate} onChange={(e) => handleIntervChange(i, 'date', e.target.value)}
                          className="w-full px-2 py-1 rounded border border-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 text-sm" />
                      </td>
                      <td className="py-1 px-2">
                        <input type="time" value={iv.heure} onChange={(e) => handleIntervChange(i, 'heure', e.target.value)}
                          className="w-full px-2 py-1 rounded border border-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 text-sm" />
                      </td>
                      <td className="py-1 px-2">
                        <input type="text" value={iv.demandeur || ''} onChange={(e) => handleIntervChange(i, 'demandeur', e.target.value)}
                          className="w-full px-2 py-1 rounded border border-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 text-sm" placeholder="Demandeur" />
                      </td>
                      <td className="py-1 px-2">
                        <input type="text" value={iv.service || ''} onChange={(e) => handleIntervChange(i, 'service', e.target.value)}
                          className="w-full px-2 py-1 rounded border border-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 text-sm" placeholder="Service" />
                      </td>
                      <td className="py-1 px-2">
                        <input type="text" value={iv.motif} title={iv.motif} onChange={(e) => handleIntervChange(i, 'motif', e.target.value)}
                          className="w-full px-2 py-1 rounded border border-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 text-sm" placeholder="Motif de l'appel" />
                      </td>
                      <td className="py-1 px-2">
                        <select value={iv.type || 'intervention'} onChange={(e) => handleIntervChange(i, 'type', e.target.value)}
                          className="w-full px-2 py-1 rounded border border-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 text-sm">
                          <option value="intervention">Intervention</option>
                          <option value="exceptionnelle">Exceptionnelle</option>
                          <option value="ponctuelle">Ponctuelle</option>
                        </select>
                      </td>
                      <td className="py-1 px-2">
                        <input type="text" value={iv.ticket} onChange={(e) => handleIntervChange(i, 'ticket', e.target.value)}
                          className="w-24 px-2 py-1 rounded border border-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 text-sm" placeholder="N° ticket" />
                      </td>
                      <td className="py-1 px-2 text-right font-medium">
                        {iv.employee_id ? (seeAmounts ? Number(astreinteConfig.interventionRate).toLocaleString('fr-FR') : '••••••') : '—'}
                      </td>
                      <td className="py-1 px-2 text-center">
                        <button type="button" onClick={() => removeIntervRow(i)} className="text-red-500 hover:text-red-700 text-sm">✕</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="font-semibold border-t-2 border-brand-200">
                    <td colSpan="8" className="py-2 px-2 text-right">Total Interventions</td>
                    <td className="py-2 px-2 text-right text-brand-600">{maskAr(totalInterv)}</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          <div className="card-blueline p-4">
            <h2 className="font-semibold text-base-content text-sm mb-2">Récapitulatif par employé <span className="text-xs font-normal text-base-content/50">(1 prime par employé)</span></h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-300">
                    <th className="text-left py-2 px-2 font-medium text-gray-700">Employé</th>
                    <th className="text-right py-2 px-2 font-medium text-gray-700">Disponibilité</th>
                    <th className="text-center py-2 px-2 font-medium text-gray-700">Taux</th>
                    <th className="text-right py-2 px-2 font-medium text-gray-700">Interventions</th>
                    <th className="text-right py-2 px-2 font-medium text-gray-700">Exceptionnelle</th>
                    <th className="text-right py-2 px-2 font-medium text-gray-700">Ponctuelle</th>
                    <th className="text-right py-2 px-2 font-medium text-gray-700">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(employeeTotals).map(([id, e]) => {
                    const rate = getRate(parseInt(id))
                    const isCustom = rate !== astreinteConfig.weeklyMax
                    return (
                    <tr key={id} className="border-b border-gray-200">
                      <td className="py-2 px-2 font-medium">{e.name}</td>
                      <td className="py-2 px-2 text-right">{maskAr(e.dispo)}</td>
                      <td className="py-2 px-2 text-center text-xs">{isCustom ? <span className="text-blue-600 font-medium">{rate.toLocaleString('fr-FR')}</span> : <span className="text-gray-400">{rate.toLocaleString('fr-FR')}</span>}</td>
                      <td className="py-2 px-2 text-right">{maskAr(e.interv)}</td>
                      <td className="py-2 px-2 text-right">{maskAr(e.exceptionnelle)}</td>
                      <td className="py-2 px-2 text-right">{maskAr(e.ponctuelle)}</td>
                      <td className="py-2 px-2 text-right font-semibold">{seeAmounts ? `${(e.dispo + e.interv + e.exceptionnelle + e.ponctuelle).toLocaleString('fr-FR')} Ar` : '••••••'}</td>
                    </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex justify-between text-lg font-bold border-t-2 border-gray-400 pt-3 mt-3">
              <span>Total Général</span>
              <span className="text-brand-600">{maskAr(totalGeneral)}</span>
            </div>
          </div>

          <div className="flex gap-3 justify-end">
            <Link to="/bonuses/new" className="btn btn-ghost">Annuler</Link>
            <button type="submit" disabled={loading || coeffInvalid || periodInvalid || otherInvalid || isReadOnly || primeCount === 0} className="btn bg-brand-600 hover:bg-brand-700 text-white border-0">
              {loading ? <span className="loading loading-spinner" /> : `Créer les primes (${primeCount})`}
            </button>
          </div>
        </form>
      </div>
    )
  }

  return (
    <>
    <div className="page-container !px-2 max-w-full">
      <div className="flex items-center gap-3 mb-6">
        <Link to="/bonuses/new" className="p-2 rounded-lg hover:bg-base-200"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg></Link>
        <div className="flex items-center gap-2"><CalendarIcon className="w-6 h-6 text-blue-600" /><div><h1 className="page-title">Prime Mensuelle</h1><p className="text-sm text-base-content/50">Établissement des primes mensuelles</p></div></div>
      </div>

      {error && <div className="bg-red-50 text-red-700 text-sm rounded-lg px-4 py-3 mb-3 flex items-center gap-2"><ExclamationIcon className="w-4 h-4" />{error}</div>}

      {isReadOnly && (
        <div className="bg-blue-50 text-blue-700 text-sm rounded-lg px-4 py-3 mb-3 flex items-center gap-2">
          <ExclamationIcon className="w-4 h-4" /> Cette prime a été modifiée par le DG. Vous pouvez consulter les détails mais pas modifier.
        </div>
      )}

      <form onSubmit={handleSubmitMensuel}>
        {sharedHeader}

        {totalCoeff > 0 && totalCoeff !== 10 && (
          <div className="mb-4 bg-amber-50 text-amber-700 text-sm rounded-lg px-4 py-2 flex items-center gap-2">
            <ExclamationIcon className="w-4 h-4" /> La somme des coefficients ({totalCoeff.toFixed(1)}) n'est pas égale à 10 — la validation est bloquée tant que ce total n'est pas égal à 10
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-4">

        <div className="card-blueline p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-base-content text-sm">Évaluation Quantitative</h2>
            <span className="text-xs text-gray-600">{maskForm(totalQuantiValue, { minimumFractionDigits: 2 })}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-300">
                  <th className="text-left py-2 px-2 font-medium text-gray-700">Critères</th>
                  <th className="text-left py-2 px-2 font-medium text-gray-700">Description/Obs</th>
                  <th className="text-center py-2 px-2 font-medium text-gray-700">Coefficient</th>
                  <th className="text-center py-2 px-2 font-medium text-gray-700">Note /10</th>
                  <th className="text-right py-2 px-2 font-medium text-gray-700">Montant ({formCurrency})</th>
                  <th className="w-10"></th>
                </tr>
              </thead>
              <tbody>
                {quantitative.map((item, i) => (
                  <tr key={i} className="border-b border-gray-200">
                    <td className="py-2 px-2 font-medium">{item.criteria}</td>
                    <td className="py-2 px-2">
                      <input type="text" value={item.description}
                        onChange={(e) => handleEvalChange(quantitative, setQuantitative, i, 'description', e.target.value, 'quanti')}
                        className="w-full px-2 py-1 rounded border border-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 text-sm" />
                    </td>
                    <td className="py-2 px-2 text-center">
                      <input type="number" min="0" max="10" step="0.5" value={item.coeff}
                        onChange={(e) => handleEvalChange(quantitative, setQuantitative, i, 'coeff', e.target.value, 'quanti')}
                        className="w-16 px-2 py-1 rounded border border-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 text-sm text-center" />
                    </td>
                    <td className="py-2 px-2 text-center">
                      <input type="number" min="0" max="10" step="0.5"
                        value={item.note}
                          onChange={(e) => handleEvalChange(quantitative, setQuantitative, i, 'note', e.target.value, 'quanti')}
                        className="w-20 px-2 py-1 rounded border border-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 text-sm text-center" />
                    </td>
                    <td className="py-2 px-2 text-right font-medium">{seeAmounts ? `${item.value.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} ${formCurrency}` : '••••••'}</td>
                    <td className="py-2 px-2 text-center">
                      <button type="button" onClick={() => removeEvalItem(quantitative, setQuantitative, i)}
                        className="text-red-400 hover:text-red-600 text-lg leading-none">&minus;</button>
                    </td>
                  </tr>
                ))}
                <tr className="font-semibold border-t-2 border-gray-400">
                  <td colSpan="3" className="py-2 px-2 text-right">Total Quantitatif</td>
                  <td className="py-2 px-2 text-center font-medium">{totalQuantiCoeff.toFixed(1)}</td>
                  <td className="py-2 px-2 text-right text-brand-600">{seeAmounts ? `${totalQuantiValue.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} ${formCurrency}` : '••••••'}</td>
                  <td></td>
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

        <div className="card-blueline p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-base-content text-sm">Évaluation Qualitative</h2>
            <span className="text-xs text-gray-600">{maskForm(totalQualiValue, { minimumFractionDigits: 2 })}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-300">
                  <th className="text-left py-2 px-2 font-medium text-gray-700">Critères</th>
                  <th className="text-left py-2 px-2 font-medium text-gray-700">Description/Obs</th>
                  <th className="text-center py-2 px-2 font-medium text-gray-700">Coefficient</th>
                  <th className="text-center py-2 px-2 font-medium text-gray-700">Note /10</th>
                  <th className="text-right py-2 px-2 font-medium text-gray-700">Montant ({formCurrency})</th>
                  <th className="w-10"></th>
                </tr>
              </thead>
              <tbody>
                {qualitative.map((item, i) => (
                  <tr key={i} className="border-b border-gray-200">
                    <td className="py-2 px-2 font-medium">{item.criteria}</td>
                    <td className="py-2 px-2">
                      <input type="text" value={item.description}
                        onChange={(e) => handleEvalChange(qualitative, setQualitative, i, 'description', e.target.value, 'quali')}
                        className="w-full px-2 py-1 rounded border border-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 text-sm" />
                    </td>
                    <td className="py-2 px-2 text-center">
                      <input type="number" min="0" max="10" step="0.5" value={item.coeff}
                        onChange={(e) => handleEvalChange(qualitative, setQualitative, i, 'coeff', e.target.value, 'quali')}
                        className="w-16 px-2 py-1 rounded border border-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 text-sm text-center" />
                    </td>
                    <td className="py-2 px-2 text-center">
                      <input type="number" min="0" max="10" step="0.5"
                        value={item.note}
                          onChange={(e) => handleEvalChange(qualitative, setQualitative, i, 'note', e.target.value, 'quali')}
                        className="w-20 px-2 py-1 rounded border border-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 text-sm text-center" />
                    </td>
                    <td className="py-2 px-2 text-right font-medium">{seeAmounts ? `${item.value.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} ${formCurrency}` : '••••••'}</td>
                    <td className="py-2 px-2 text-center">
                      <button type="button" onClick={() => removeEvalItem(qualitative, setQualitative, i)}
                        className="text-red-400 hover:text-red-600 text-lg leading-none">&minus;</button>
                    </td>
                  </tr>
                ))}
                <tr className="font-semibold border-t-2 border-gray-400">
                  <td colSpan="3" className="py-2 px-2 text-right">Total Qualitatif</td>
                  <td className="py-2 px-2 text-center font-medium">{totalQualiCoeff.toFixed(1)}</td>
                  <td className="py-2 px-2 text-right text-brand-600">{seeAmounts ? `${totalQualiValue.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} ${formCurrency}` : '••••••'}</td>
                  <td></td>
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
      </div>

        <div className="card-blueline p-3 mb-0">
          <div className="flex items-center justify-between">
            <p className="text-gray-600 text-xs font-medium">
              Modele d'evaluation - {selectedEmp?.name || 'Employe'}
            </p>
            {templateSaved ? (
              <span className="text-xs text-green-600 font-medium">Modèle sauvegardé !</span>
            ) : (
              <button type="button" onClick={handleSaveTemplate} disabled={savingTemplate || coeffInvalid}
                className="btn btn-xs bg-brand-600 hover:bg-brand-700 text-white border-0 disabled:bg-gray-300 disabled:text-gray-500 disabled:border-0">
                {savingTemplate ? 'Sauvegarde...' : 'Sauvegarder comme modèle par défaut'}
              </button>
            )}
          </div>
        </div>

        <div className="card-blueline p-3 mb-0">
          <div className="flex flex-col gap-1.5">
            <p className="text-gray-600 text-xs">Note de calcul : Montant = PrimeMax × (Coeff/10) × (Note/10)</p>
            <p className="text-[10px] text-gray-500">Période : {params.startDate} → {params.endDate}</p>

            <div className="flex items-center gap-3">
              <div className="flex-1">
                <div className="flex justify-between text-[11px] text-gray-600">
                  <span>Quantitatif</span>
                  <span>{maskForm(totalQuantiValue, { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden mt-0.5">
                  <div className="h-full rounded-full transition-all duration-300 bg-blue-500"
                    style={{ width: `${Math.min((totalQuantiValue / (params.maxPrime || 1)) * 100, 100)}%` }} />
                </div>
              </div>
              <div className="flex-1">
                <div className="flex justify-between text-[11px] text-gray-600">
                  <span>Qualitatif</span>
                  <span>{maskForm(totalQualiValue, { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden mt-0.5">
                  <div className="h-full rounded-full transition-all duration-300 bg-violet-500"
                    style={{ width: `${Math.min((totalQualiValue / (params.maxPrime || 1)) * 100, 100)}%` }} />
                </div>
              </div>
            </div>

            <div className="border-t border-gray-300 pt-3 mt-3">
              <div className="flex items-center justify-between text-[11px] text-gray-600">
                <span>Total évaluation (quanti + quali) <span className="text-gray-400">/ {showPrimeMax ? `${parseFloat(params.maxPrime || 0).toLocaleString('fr-FR')} ${formCurrency}` : '••••••'}</span></span>
                <span>{maskForm(totalValue, { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden mt-0.5">
                <div className="h-full rounded-full transition-all duration-300 bg-blue-500"
                  style={{ width: `${Math.min((totalValue / (params.maxPrime || 1)) * 100, 100)}%` }} />
              </div>
            </div>
          </div>

        </div>

        <div className="card-blueline p-4 mt-3 border-l-4 border-l-amber-500 bg-amber-50/30">
          {others.length > 0 && otherInvalid && (
            <div className="mb-3 bg-red-50 text-red-700 text-sm rounded-lg px-4 py-2 flex items-center gap-2">
              <ExclamationIcon className="w-4 h-4" /> Chaque « Autre prime » doit avoir un libellé, un type, un montant supérieur à 0, une période (début et fin) et une pièce jointe.
            </div>
          )}
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="font-semibold text-gray-900 text-sm">Autres primes</h2>
              <p className="text-[10px] text-gray-500 mt-0.5">Ajoutez des primes supplementaires (installation, interim, etc.)</p>
            </div>
            <button type="button" onClick={addOther} className="btn btn-xs bg-amber-600 hover:bg-amber-700 text-white border-0 flex items-center gap-1">
              <PlusIcon className="w-3.5 h-3.5" /> Ajouter
            </button>
          </div>

          {others.length === 0 && (
            <div className="text-center py-6 text-gray-400 text-xs">
              Aucune prime supplementaire. Cliquez sur "Ajouter" pour en créer une.
            </div>
          )}

          {others.map((o, idx) => (
            <div key={o.key} className="bg-white rounded-lg border border-amber-200 p-3 mb-2">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-medium text-amber-700">Autre prime #{idx + 1}</span>
                <button type="button" onClick={() => removeOther(o.key)} className="text-red-400 hover:text-red-600 text-lg leading-none">&times;</button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                <div className="lg:col-span-2">
                  <label className="block text-[10px] font-medium text-gray-600 mb-0.5">Libelle</label>
                  <input type="text" value={o.libelle} onChange={(e) => updateOther(o.key, 'libelle', e.target.value)}
                    placeholder="ex: Prime d'installation"
                    className="w-full px-2 py-1 rounded border border-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 text-sm" />
                </div>
                <div className="lg:col-span-2">
                  <label className="block text-[10px] font-medium text-gray-600 mb-0.5">Type</label>
                  <select value={o.type} onChange={(e) => updateOther(o.key, 'type', e.target.value)}
                    className="w-full px-2 py-1 rounded border border-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 text-sm">
                    {otherTypes.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                  {o.type === 'autres' && (
                    <input type="text" value={o.typeCustom} onChange={(e) => updateOther(o.key, 'typeCustom', e.target.value)}
                      placeholder="Precisez le type..."
                      className="w-full px-2 py-1 rounded border border-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 text-sm mt-1" />
                  )}
                </div>
                <div className="lg:col-span-3">
                  <label className="block text-[10px] font-medium text-gray-600 mb-0.5">Période (optionnel)</label>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[11px] text-gray-500">Début</span>
                    <select value={o.debut_mois} onChange={(e) => updateOther(o.key, 'debut_mois', e.target.value)}
                      className="px-2 py-1 rounded border border-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 text-sm">
                      <option value="">Mois</option>
                      {months.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                    </select>
                    <select value={o.debut_annee} onChange={(e) => updateOther(o.key, 'debut_annee', e.target.value)}
                      className="px-2 py-1 rounded border border-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 text-sm">
                      <option value="">Année</option>
                      {years.map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                    <span className="text-[11px] text-gray-500 ml-2">Fin</span>
                    <select value={o.fin_mois} onChange={(e) => updateOther(o.key, 'fin_mois', e.target.value)}
                      className="px-2 py-1 rounded border border-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 text-sm">
                      <option value="">Mois</option>
                      {months.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                    </select>
                    <select value={o.fin_annee} onChange={(e) => updateOther(o.key, 'fin_annee', e.target.value)}
                      className="px-2 py-1 rounded border border-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 text-sm">
                      <option value="">Année</option>
                      {years.map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                  </div>
                  {periodKey(o) > 0 && periodKeyFin(o) > 0 && periodKey(o) > periodKeyFin(o) && (
                    <p className="text-[11px] text-red-600 mt-1">La date de début doit être antérieure ou égale à la date de fin.</p>
                  )}
                </div>
                <div className="lg:col-span-1">
                  <label className="block text-[10px] font-medium text-gray-600 mb-0.5">Montant ({formCurrency})</label>
                  <input type="number" min="0" value={o.montant} onChange={(e) => updateOther(o.key, 'montant', e.target.value)}
                    className="w-full px-2 py-1 rounded border border-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 text-sm" />
                </div>
              </div>
              <div className="mt-2">
                <label className="block text-[10px] font-medium text-gray-600 mb-0.5">Piece jointe (obligatoire)</label>
                {o.file ? (
                  <div className="flex items-center gap-2 text-sm">
                    <button type="button" onClick={() => openFile(o.file.url)} className="text-blue-600 hover:underline truncate text-left">{o.file.original_name}</button>
                    <button type="button" onClick={() => removeOtherFile(o.key)} className="text-red-400 hover:text-red-600">&times;</button>
                  </div>
                ) : (
                  <input type="file" accept=".pdf,.png,.jpg,.jpeg,.gif,.doc,.docx,.xls,.xlsx"
                    onChange={(e) => handleOtherFile(o.key, e.target.files?.[0])}
                    className="file-input file-input-bordered file-input-xs w-full text-sm" />
                )}
              </div>
            </div>
          ))}

          {othersTotal > 0 && (
            <div className="border-t border-amber-200 pt-3 mt-3">
              <div className="flex items-center justify-between text-[11px] text-gray-600">
                <span>Autres primes</span>
                <span>{maskForm(othersTotal, { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden mt-0.5">
                <div className="h-full rounded-full transition-all duration-300 bg-amber-500" style={{ width: '100%' }} />
              </div>
            </div>
          )}
        </div>

        {othersTotal > 0 && (
          <div className="card-blueline p-4 mt-3 border-l-4 border-l-blue-500 bg-blue-50/40">
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold text-gray-900">Total général</p>
              <p className="text-2xl font-bold text-brand-600">{seeAmounts ? `${(totalValue + othersTotal).toLocaleString('fr-FR', { minimumFractionDigits: 2 })} ${formCurrency}` : '••••••'}</p>
            </div>
          </div>
        )}

        <div className="card-blueline p-3 border-l-4 border-l-blue-500 bg-blue-50/40">
          <div className="space-y-2">
            <div>
              <label className="block text-sm font-bold text-gray-900 mb-1">Appliquer ce modèle à :</label>
              {!selectedEmp ? (
                <p className="text-xs text-base-content/40">Sélectionnez d'abord un employé.</p>
              ) : sameDeptEmployees.length === 0 ? (
                <p className="text-xs text-base-content/40">Aucun autre employé dans le même département.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {sameDeptEmployees.map(e => (
                    <button key={e.id} type="button" onClick={() => toggleTeamMember(e.id)}
                      className={`px-2.5 py-1 rounded-lg border text-xs transition-all ${
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
              <label className="block text-xs font-medium text-base-content/70 mb-0.5">Observations générales</label>
              <textarea value={observation} onChange={(e) => setObservation(e.target.value)} rows={2}
                className="w-full px-3 py-1.5 rounded-lg border border-base-300 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 resize-none text-sm"
                placeholder="Ajouter des notes ou observations..." />
            </div>
          </div>
        </div>

        <div className="flex gap-3 justify-end">
          <Link to="/bonuses/new" className="btn btn-ghost">Annuler</Link>
          <button type="submit" disabled={loading || coeffInvalid || periodInvalid || otherInvalid || isReadOnly || employeeInvalid || notesInvalid} className="btn bg-brand-600 hover:bg-brand-700 text-white border-0">
            {loading ? <span className="loading loading-spinner" /> : 'Valider/Suivant'}
          </button>
        </div>
      </form>
    </div>

      <Modal open={!!confirmDelete} onClose={() => setConfirmDelete(null)} title="Confirmer la suppression" size="sm">
        <p className="text-sm text-gray-600 mb-6">Ce critère sera définitivement supprimé.</p>
        <div className="flex gap-2 justify-end">
          <button onClick={() => setConfirmDelete(null)} className="btn btn-sm btn-ghost">Annuler</button>
          <button onClick={doDelete} className="btn btn-sm bg-red-500 hover:bg-red-600 text-white border-0">Supprimer</button>
        </div>
      </Modal>

    </>
  )
}
