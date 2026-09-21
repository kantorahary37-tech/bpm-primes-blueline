import { useState, useEffect, useRef, useMemo, Fragment } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { createBonus, getEmployees, getBonus, updateBonus, getPrimeMax, uploadFile, openFile, getEvaluationTemplates, saveEvaluationTemplates, previewCommissionImport, importCommissionBonuses, previewCommissionGCImport, importCommissionGCBonuses, getMyServiceAssignments, getOtherPrimesTypes, getUsers } from '../services/api'
import { useAuth } from '../contexts/AuthContext'
import { useSystemConfig } from '../contexts/SystemConfigContext'
import { useCurrencies } from '../contexts/CurrenciesContext'
import { ChartIcon, MoonIcon, CalendarIcon, ExclamationIcon, PlusIcon } from '../components/Icons'
import toast from 'react-hot-toast'
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
  const showPrimeMax = seeAmounts && !connectedUser?.is_validator_n1 && !connectedUser?.is_validator_n2
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
  // Mode Jour : nombre de jours entre date début et fin (ex : 17/09 -> 30/09 = 13 jours)
  const calcDays = (start, end) => {
    if (!start || !end) return 1
    const s = new Date(start), e = new Date(end)
    return Math.max(1, Math.floor((e - s) / (1000 * 60 * 60 * 24)))
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
  const [serviceAssignments, setServiceAssignments] = useState([])
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
    { key: 1, employee_id: '', nombre: 1, mode: 'semaine' },
  ])
  const [interventions, setInterventions] = useState([
    { key: 2, employee_id: '', date: '', heure: '', motif: '', ticket: '', type: 'intervention', demandeur: '', service: '' },
  ])
  const [additionalPrimes, setAdditionalPrimes] = useState({ exceptionnelle: 0, ponctuelle: 0 })
  const [perEmployeeAdditional, setPerEmployeeAdditional] = useState({})
  const importFileRef = useRef(null)
  const otherFileRefs = useRef({})
  const [importedFileName, setImportedFileName] = useState('')
  const [importFeedback, setImportFeedback] = useState('')
  const [importError, setImportError] = useState('')

  const [editLoaded, setEditLoaded] = useState(!isEditing)
  const [others, setOthers] = useState([])
  const [otherPrimesTypes, setOtherPrimesTypes] = useState([])
  const otherTypes = ['periodique', 'temporaire', 'autres']

  // N+2 (sous-directeur) states
  const [passToN2, setPassToN2] = useState(false)
  const [n2UserId, setN2UserId] = useState('')
  const [n2Users, setN2Users] = useState([])

  const OTHER_TYPE_DESCRIPTIONS = {
    temporaire: {
      idea: "Prime versée UNE SEULE FOIS, en une fois.",
      when: "À utiliser pour une gratification ponctuelle sur un mois donné sans reconduction automatique.",
      examples: "Exemples : gratification exceptionnelle, prime d'installation, prime d'un projet achevé, prime de fin d'année.",
      period: "Période : indiquez simplement le mois de versement (optionnel).",
    },
    periodique: {
      idea: "Prime versée RÉGULIÈREMENT, chaque mois, pendant une durée déterminée.",
      when: "À utiliser pour une indemnité récurrente qui se répète jusqu'à une date de fin.",
      examples: "Exemples : indemnité de logement, de transport, de panier, indemnité mensuelle d'une mission.",
      period: "Période : renseignez la date de DÉBUT et de FIN pour définir la durée de versement.",
    },
    autres: {
      idea: "Prime SPÉCIFIQUE qui ne correspond pas aux catégories ci-dessus.",
      when: "À utiliser pour un cas particulier non couvert par Temporaire ou Périodique.",
      examples: "Exemples : prime liée à un événement interne, compensation particulière, gratification d'un fonds dédié.",
      period: "Précisez le type exact dans le champ prévu et renseignez la période si besoin.",
    },
  }
  const OTHER_TYPE_LABELS = {
    temporaire: 'Temporaire',
    periodique: 'Périodique',
    autres: 'Autres',
  }

  const addOther = () => {
    setOthers(prev => [...prev, { key: Date.now() + Math.random(), libelle: '', selectedTypeId: '', type: 'temporaire', typeCustom: '', file: null, fileData: null, debut_mois: '', debut_annee: '', fin_mois: '', fin_annee: '', montant: 0, nbr_jour: '1' }])
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

  // « Autres primes » : montant de base (type de prime ou libre) × nombre de jours
  // o.montant = montant de base ; o.nbr_jour = multiplicateur (défaut 1)
  const otherJour = (o) => Math.max(1, parseInt(o.nbr_jour) || 1)
  const otherBase = (o) => parseFloat(o.montant) || 0
  const otherTotal = (o) => otherBase(o) * otherJour(o)
  const othersTotal = others.reduce((sum, o) => sum + otherTotal(o), 0)
  // Prime intérimaire (type à montant libre) : elle ne concerne QUE l'employé
  // sélectionné en haut — on masque « Appliquer ce modèle à » dans ce cas.
  const hasFreeAmountType = others.some(o => otherPrimesTypes.find(t => t.id === o.selectedTypeId)?.free_amount)

  useEffect(() => {
    if (hasFreeAmountType && teamSelections.length > 0) setTeamSelections([])
  }, [hasFreeAmountType])

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
  // Type de prime commission sélectionné : 'gp' (Prime Commission GP) ou 'gc' (Entreprise / Grand Compte)
  const [commSubType, setCommSubType] = useState('gp')
  // --- État du flux commission Entreprise / Grand Compte (création) ---
  const [gcCsvFile, setGcCsvFile] = useState(null)
  const [gcPreview, setGcPreview] = useState(null)
  const [gcLoading, setGcLoading] = useState(false)
  const gcFileInputRef = useRef(null)
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

    getMyServiceAssignments().then(setServiceAssignments).catch(() => {})
    getOtherPrimesTypes().then(setOtherPrimesTypes).catch(() => {})

    // Fetch N+2 users for the current user's department
    getUsers().then(allUsers => {
      const dept = connectedUser?.department
      const n2 = allUsers.filter(u => u.is_validator_n2 && (!dept || u.department === dept))
      setN2Users(n2)
    }).catch(() => {})
  }, [])

  // Pour une prime MENSELLE, un N+1 avec des services affectés ne sélectionne
  // que les employés de ses services. (Prime ASTREINTE : inchangée.)
  const restrictedToAssignedServices =
    editType === 'mensuel' &&
    (connectedUser?.is_validator_n1 || connectedUser?.is_validator_n2) &&
    !(connectedUser?.is_admin || connectedUser?.is_dg || connectedUser?.is_drh || connectedUser?.is_directeur) &&
    serviceAssignments.length > 0

  const selectableEmployees = useMemo(() => {
    if (!restrictedToAssignedServices) return employees
    const names = new Set(serviceAssignments.map(a => a.service_group_name).filter(Boolean))
    return employees.filter(e => names.has(e.service))
  }, [restrictedToAssignedServices, employees, serviceAssignments])

  // « Appliquer ce modèle à » : pour un N+1/N+2 avec des services affectés, on
  // ne propose que les employés de ses services (comme le sélecteur principal).
  const sameDeptEmployees = selectedEmp
    ? selectableEmployees.filter(e => e.department === selectedEmp.department && e.id !== selectedEmp.id)
    : []

  useEffect(() => {
    if (!empSearchOpen) return
    const handleClick = (e) => {
      if (empSearchRef.current && !empSearchRef.current.contains(e.target)) setEmpSearchOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [empSearchOpen])

  const filteredEmployees = selectableEmployees.filter(e =>
    e.name?.toLowerCase().includes(empSearch.toLowerCase()) ||
    e.matricule?.toLowerCase().includes(empSearch.toLowerCase())
  )

  const employeeOptGroups = (() => {
    const grouped = {}
    employees.forEach(e => {
      const key = e.service || 'Sans service'
      if (!grouped[key]) grouped[key] = []
      grouped[key].push(e)
    })
    return Object.entries(grouped)
      .map(([service, emps]) => [service, [...emps].sort((a, b) => (a.name || '').localeCompare(b.name || ''))])
      .sort(([a], [b]) => (a === 'Sans service' ? 1 : b === 'Sans service' ? -1 : a.localeCompare(b)))
  })()

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
      if (b.employee) setEmployee({ department: b.employee.department || '', service: b.employee.service || '', name: b.employee.name, function: '', matricule: b.employee.matricule });
      setParams((p) => ({ ...p, startDate: b.start_date, endDate: b.end_date }));
      if (b.start_date) { setSelectedMonth(b.start_date.substring(0, 7)); setSelectedYear(parseInt(b.start_date.substring(0, 4))); }
      if (b.details) {
        const d = b.details;
        if (d.quantitative) setQuantitative(d.quantitative);
        if (d.qualitative) setQualitative(d.qualitative);
        if (d.sales) setSales(d.sales.map((s, i) => ({ ...s, key: i + 1 })));
        if (d.disponibilites) setDisponibilites(d.disponibilites.map((s, i) => ({ ...s, mode: s.mode || 'semaine', key: i + 1 })));
        if (d.interventions) setInterventions(d.interventions.map((s, i) => ({ ...s, key: i + 1 })));
        if (d.weekly_max) setAstreinteConfig((c) => ({ ...c, weeklyMax: d.weekly_max, interventionRate: d.intervention_rate }));
        if (d.exceptionnelle !== undefined) setAdditionalPrimes((p) => ({ ...p, exceptionnelle: d.exceptionnelle }));
        if (d.ponctuelle !== undefined) setAdditionalPrimes((p) => ({ ...p, ponctuelle: d.ponctuelle }));
        if (d.others) setOthers(d.others.map((o, i) => ({
          key: Date.now() + Math.random() + i,
          libelle: o.libelle || '',
          selectedTypeId: o.selectedTypeId || '',
          type: otherTypes.includes(o.type) ? o.type : (o.type ? 'autres' : 'temporaire'),
          typeCustom: otherTypes.includes(o.type) ? '' : (o.type || ''),
          file: o.file && o.file.url ? o.file : null,
          fileData: null,
          debut_mois: o.debut_mois ? String(o.debut_mois) : '',
          debut_annee: o.debut_annee ? String(o.debut_annee) : '',
          fin_mois: o.fin_mois ? String(o.fin_mois) : '',
          fin_annee: o.fin_annee ? String(o.fin_annee) : '',
          montant: o.montant_base ?? (o.montant || 0),
          nbr_jour: o.nbr_jour != null ? String(o.nbr_jour) : '1',
        })));
      }
      // Load N+2 data
      if (b.pass_to_n2) setPassToN2(true)
      if (b.n2_user_id) setN2UserId(String(b.n2_user_id))
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
    (!o.selectedTypeId && !o.libelle?.trim()) ||
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

  if (editLoaded && !['mensuel', 'astreinte', 'commission', 'commission_gc'].includes(editType)) {
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
    setDisponibilites([...disponibilites, { key: Date.now(), employee_id: '', nombre: 1, mode: 'semaine' }])
  }

  const removeDispoRow = (index) => {
    setDisponibilites(disponibilites.filter((_, i) => i !== index))
  }

  const handleDispoChange = (index, field, value) => {
    const newData = [...disponibilites]
    newData[index][field] = value
    setDisponibilites(newData)
  }

  const handleDispoMode = (index, mode) => {
    const newData = [...disponibilites]
    newData[index].mode = mode
    // Ajuste le nombre si le changement de mode dépasse le nouveau max (semaines vs jours)
    const max = mode === 'jour' ? calcDays(params.startDate, params.endDate) : calcWeeks(params.startDate, params.endDate)
    if ((parseFloat(newData[index].nombre) || 0) > max) newData[index].nombre = max
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
    const days = calcDays(params.startDate, params.endDate)
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

    // Max selon le mode de chaque ligne : Semaine -> nb semaines, Jour -> nb jours de la période
    const badNombre = disponibilites.some(d => {
      const max = d.mode === 'jour' ? days : weeks
      return (parseFloat(d.nombre) > max)
    })
    if (badNombre) {
      setError(`Nombre hors limite en Disponibilité : max ${weeks} semaine(s) en mode Semaine, ${days} jour(s) en mode Jour pour la période sélectionnée.`)
      setLoading(false); return
    }

    try {
      await Promise.all(allEmpIds.map(employee_id => {
        const empDispos = disponibilites.filter(d => d.employee_id === employee_id)
        const empIntervs = interventions.filter(i => i.employee_id === employee_id)
        const totalDispo = empDispos.reduce((s, d) => {
          const tauxHebdo = d.mode === 'jour' ? astreinteConfig.weeklyMax / 7 : getRate(d.employee_id)
          return s + (parseFloat(d.nombre) || 0) * tauxHebdo
        }, 0)
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
              employee_id: d.employee_id, employee_name: empName(d.employee_id), nombre: d.nombre, mode: d.mode,
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
    setGcCsvFile(file)
    setCommPreview(null)
    setGcPreview(null)
  }

  const handleLocalFile = (e) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    setCommCsvFile(f)
    setCommCsvPath('')
    setGcCsvFile(f)
    setCommPreview(null)
    setGcPreview(null)
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
      if (result.count > 0) {
        const totalAr = (result.total_amount ?? 0).toLocaleString('fr-FR')
        const msg = `${result.count} prime(s) commission créée(s) pour un total de ${totalAr} Ar.`
          + (result.skipped?.length ? ` ${result.skipped.length} déjà couvert(s).` : '')
        navigate('/bonuses', { state: { success: msg } })
      } else if (result.skipped?.length) {
        toast.error(`Des primes commission pour ${result.skipped.length} employé(s) sont déjà créées pour cette période.`, { duration: 6000 })
      } else {
        toast.error('Aucune commission n\'a pu être créée.', { duration: 6000 })
      }
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

  const handlePreviewCommissionGC = async () => {
    setError('')
    setGcPreview(null)
    if (!gcCsvFile) { setError("Sélectionnez d'abord le fichier CSV des ventes grand compte."); return }
    if (!params.startDate || !params.endDate) { setError('Sélectionnez la période.'); return }
    setGcLoading(true)
    try {
      const data = await previewCommissionGCImport(gcCsvFile, params.startDate, params.endDate)
      setGcPreview(data)
    } catch (err) {
      setError(err.response?.data?.detail || 'Erreur lors du calcul des commissions grand compte.')
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } finally {
      setGcLoading(false)
    }
  }

  const handleSubmitCommissionGC = async (e) => {
    e.preventDefault()
    setError('')
    if (!gcPreview || !gcCsvFile) { setError("Calculez d'abord les commissions (aperçu)."); return }
    setGcLoading(true)
    try {
      const result = await importCommissionGCBonuses(gcCsvFile, params.startDate, params.endDate)
      if (result.count > 0) {
        const totalAr = (result.total_amount ?? 0).toLocaleString('fr-FR')
        const msg = `${result.count} prime(s) commission grand compte créée(s) pour un total de ${totalAr} Ar.`
          + (result.skipped?.length ? ` ${result.skipped.length} déjà couvert(s).` : '')
        navigate('/bonuses', { state: { success: msg } })
      } else if (result.skipped?.length) {
        toast.error(`Des primes commission grand compte pour ${result.skipped.length} employé(s) sont déjà créées pour cette période.`, { duration: 6000 })
      } else {
        toast.error('Aucune commission n\'a pu être créée.', { duration: 6000 })
      }
    } catch (err) {
      setError(err.response?.data?.detail || 'Erreur lors de la création des primes commission grand compte.')
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } finally {
      setGcLoading(false)
    }
  }

  const handleSubmitCommissionEditGC = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await updateBonus(id, {
        start_date: params.startDate,
        end_date: params.endDate,
        bonus_type: 'commission_gc',
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
      setEmployee({ department: emp.department || '', service: emp.service || '', name: emp.name, function: '', matricule: emp.matricule })
    }
    setSelectedEmp(emp)
    setSimpleForm({ ...simpleForm, employee_id: id })
  }

  const handleSubmitMensuel = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    const allEmpIds = [selectedEmp?.id, ...(hasFreeAmountType ? [] : teamSelections)].filter(Boolean)
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
            pass_to_n2: passToN2 && n2UserId ? true : false,
            n2_user_id: passToN2 && n2UserId ? parseInt(n2UserId) : null,
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
                selectedTypeId: o.selectedTypeId || null,
                file: o.file ? { filename: o.file.filename, original_name: o.file.original_name, url: o.file.url } : null,
                debut_mois: o.debut_mois, debut_annee: o.debut_annee, fin_mois: o.fin_mois, fin_annee: o.fin_annee,
                montant: otherTotal(o), montant_base: otherBase(o), nbr_jour: otherJour(o),
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

  const isCommView = ['commission', 'commission_gc'].includes(editType)

  const sharedHeader = (
    <div className={`grid gap-3 mb-2 ${isCommView ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-2'}`}>
      {!isCommView && (
        <div className="card-blueline p-3">
          <h2 className="font-semibold text-base-content mb-2 text-sm">{editType === 'astreinte' ? 'Responsable' : "Informations de l'employé"}</h2>
          <div className="space-y-1.5">
            {editType === 'astreinte' ? (
              <div className="bg-blue-50 text-blue-700 text-sm rounded-lg px-3 py-2">
                Les employés sont définis dans les tableaux ci-dessous. Une prime sera créée par employé.
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
                <div>
                  <label className="block text-sm font-medium text-base-content/70 mb-0.5">Service</label>
                  <input type="text" value={employee.service || '—'} readOnly className="w-full px-3 py-2 rounded-lg border border-base-200 bg-base-100 text-base-content/60" />
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
                      (() => {
                        const grouped = {}
                        filteredEmployees.forEach(e => {
                          const key = e.service || 'Sans service'
                          if (!grouped[key]) grouped[key] = []
                          grouped[key].push(e)
                        })
                        return Object.entries(grouped)
                          .sort(([a], [b]) => (a === 'Sans service' ? 1 : b === 'Sans service' ? -1 : a.localeCompare(b)))
                          .map(([service, emps]) => (
                            <div key={service}>
                              <div className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-base-content/40 bg-base-100 sticky top-0">
                                {service} <span className="font-normal normal-case text-base-content/30">({emps.length})</span>
                              </div>
                              {emps.map(e => (
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
                              ))}
                            </div>
                          ))
                      })()
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
                <input type="text" value={employee.service || '—'} readOnly className="w-full px-3 py-2 rounded-lg border border-base-200 bg-base-100 text-base-content/60" />
              </div>
            </div>
          )}
        </div>
      </div>
      )}

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
              <input type="text" value={connectedUser?.is_admin ? 'Admin' : connectedUser?.is_dg ? 'Directeur Général' : connectedUser?.is_drh ? 'DRH' : connectedUser?.is_directeur ? 'Directeur' : connectedUser?.is_validator_n2 ? 'Validateur N+2' : connectedUser?.is_validator_n1 ? 'Validateur N+1' : 'Utilisateur'} readOnly className="w-full px-3 py-2 rounded-lg border border-base-200 bg-base-100 text-base-content/60" />
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
                <input type="number" value={astreinteConfig.weeklyMax} readOnly
                  className="w-full px-3 py-2 rounded-lg border border-base-200 bg-base-100 text-base-content/60 cursor-not-allowed" />
                <p className="text-[11px] text-base-content/40 mt-0.5">Modifiable dans la page Plafonds</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-base-content/70 mb-0.5">Nombre de semaines</label>
                <input type="number" value={calcWeeks(params.startDate, params.endDate)} readOnly
                  className="w-full px-3 py-2 rounded-lg border border-base-200 bg-base-100 text-base-content/60" />
                <p className="text-[11px] text-base-content/40 mt-0.5">soit {calcDays(params.startDate, params.endDate)} jours (max en mode Jour)</p>
              </div>
            </div>
          ) : !isCommView && (
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

  if (editType === 'commission' || editType === 'commission_gc') {
    const fmtAr = (n) => seeAmounts ? (parseFloat(n) || 0).toLocaleString('fr-FR') : '••••••'
    const fmtPct = (p) => `${((parseFloat(p) ?? 0) * 100).toFixed(2)} %`
    const isGc = editType === 'commission_gc'
    const gcDet = loadedBonus?.details || {}

    const commTypeSelector = (
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <span className="text-sm text-base-content/60 font-medium">Type de prime commission :</span>
        <div className="inline-flex rounded-lg border border-base-300 bg-base-100 p-0.5">
          <button type="button" onClick={() => setCommSubType('gp')}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${commSubType === 'gp' ? 'bg-brand-600 text-white' : 'text-base-content/70 hover:text-base-content'}`}>
            Prime Commission GP
          </button>
          <button type="button" onClick={() => setCommSubType('gc')}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${commSubType === 'gc' ? 'bg-brand-600 text-white' : 'text-base-content/70 hover:text-base-content'}`}>
            Prime Commission GC
          </button>
        </div>
      </div>
    )

    // ----- Mode édition : consultation des détails -----
    if (isEditing) {
      // --- Grand compte : détail des commissions calculées sur objectifs ---
      if (isGc) {
        const editTotal = parseFloat(loadedBonus?.total_amount ?? 0)
        const mrcPct = parseFloat(gcDet.mrc_pct ?? 0)
        const fmsPct = parseFloat(gcDet.fms_pct ?? 0)
        return (
          <div className="page-container !px-2 max-w-full">
            <div className="flex items-center gap-3 mb-6">
              <Link to={`/bonuses/${id}`} className="p-2 rounded-lg hover:bg-base-200"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg></Link>
              <div className="flex items-center gap-2"><ChartIcon className="w-6 h-6 text-blue-600" /><div><h1 className="page-title">Prime Commission GC</h1><p className="text-sm text-base-content/50">Prime commission GC (import CSV grand compte)</p></div></div>
            </div>
            {error && <div className="bg-red-50 text-red-700 text-sm rounded-lg px-4 py-3 mb-3 flex items-center gap-2"><ExclamationIcon className="w-4 h-4" />{error}</div>}
            <form onSubmit={handleSubmitCommissionEditGC} className="space-y-3">
              {sharedHeader}
              <div className="card-blueline p-4">
                <h2 className="font-semibold text-base-content text-sm mb-3">Détail des commissions</h2>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
                  <div className="rounded-lg bg-base-100 border border-base-200 px-3 py-2">
                    <p className="text-xs text-base-content/50">MRC réalisé</p>
                    <p className="text-lg font-bold text-base-content">{fmtAr(gcDet.mrc_actual)} Ar</p>
                    <p className="text-[11px] text-base-content/40">Objectif {fmtAr(gcDet.mrc_objective)} Ar</p>
                  </div>
                  <div className="rounded-lg bg-base-100 border border-base-200 px-3 py-2">
                    <p className="text-xs text-base-content/50">FMS réalisé</p>
                    <p className="text-lg font-bold text-base-content">{fmtAr(gcDet.fms_actual)} Ar</p>
                    <p className="text-[11px] text-base-content/40">Objectif {fmtAr(gcDet.fms_objective)} Ar (÷ 12)</p>
                  </div>
                  <div className="rounded-lg bg-base-100 border border-base-200 px-3 py-2">
                    <p className="text-xs text-base-content/50">Total réalisé (MRC+FMS)</p>
                    <p className="text-lg font-bold text-base-content">{fmtAr((parseFloat(gcDet.mrc_actual) || 0) + (parseFloat(gcDet.fms_actual) || 0))} Ar</p>
                    <p className="text-[11px] text-base-content/40">Somme des ventes produits</p>
                  </div>
                  <div className="rounded-lg bg-base-100 border border-base-200 px-3 py-2">
                    <p className="text-xs text-base-content/50">Atteinte objectif</p>
                    <p className="text-lg font-bold text-base-content">MRC {fmtPct(mrcPct)}</p>
                    <p className="text-[11px] text-base-content/40">FMS {fmtPct(fmsPct)}</p>
                  </div>
                  <div className="rounded-lg bg-base-100 border border-base-200 px-3 py-2">
                    <p className="text-xs text-base-content/50">Commission brute</p>
                    <p className="text-lg font-bold text-brand-600">{fmtAr(gcDet.mrc_commission + gcDet.fms_commission)} Ar</p>
                    <p className="text-[11px] text-base-content/40">commission@100% : {fmtAr(gcDet.commission_at_100)} Ar</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                  <div className="rounded-lg border border-base-200 px-3 py-2">
                    <p className="text-xs text-base-content/50 mb-1">Répartition de la commission</p>
                    <div className="flex justify-between text-sm"><span className="text-base-content/70">Commission MRC</span><span className="font-medium text-base-content">{fmtAr(gcDet.mrc_commission)} Ar</span></div>
                    <div className="flex justify-between text-sm"><span className="text-base-content/70">Commission FMS</span><span className="font-medium text-base-content">{fmtAr(gcDet.fms_commission)} Ar</span></div>
                    <div className="flex justify-between text-sm font-semibold border-t border-base-200 mt-1 pt-1"><span className="text-base-content/70">Total</span><span className="text-brand-600">{fmtAr(editTotal)} Ar</span></div>
                  </div>
                  <div className="rounded-lg border base-200 border-base-200 px-3 py-2">
                    <p className="text-xs text-base-content/50 mb-1">Plafond</p>
                    {gcDet.capped
                      ? <p className="text-sm font-medium text-amber-700"><span className="badge badge-sm badge-warning text-amber-700">plafonnée</span> {fmtAr(gcDet.max_commission)} Ar</p>
                      : <p className="text-sm text-base-content/70">Non atteint — plafond {fmtAr(gcDet.max_commission)} Ar</p>}
                    <p className="text-[11px] text-base-content/40 mt-1">Montant : {fmtAr(editTotal)} Ar</p>
                  </div>
                </div>

                <h3 className="font-medium text-base-content/80 text-sm mb-2">Produits</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-300">
                        <th className="text-left py-2 px-2 font-medium text-gray-600 text-xs">Produit</th>
                        <th className="text-right py-2 px-2 font-medium text-gray-600 text-xs">MRC (Ar)</th>
                        <th className="text-right py-2 px-2 font-medium text-gray-600 text-xs">FMS (Ar)</th>
                        <th className="text-right py-2 px-2 font-medium text-gray-600 text-xs">Montant</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(gcDet.lines || []).map((line, i) => (
                        <tr key={i} className="border-b border-gray-200">
                          <td className="py-1.5 px-2 text-gray-900">{line.product}</td>
                          <td className="py-1.5 px-2 text-right">{line.mrc > 0 ? `${fmtAr(line.mrc)} Ar` : '—'}</td>
                          <td className="py-1.5 px-2 text-right">{line.fms > 0 ? `${fmtAr(line.fms)} Ar` : '—'}</td>
                          <td className="py-1.5 px-2 text-right text-brand-600 font-medium">{line.total > 0 ? `${fmtAr(line.total)} Ar` : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="font-semibold border-t-2 border-brand-200">
                        <td colSpan={3} className="py-2 px-2 text-right">Total commission</td>
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
      const editTotal = parseFloat(loadedBonus?.total_amount ?? 0)
      return (
        <div className="page-container !px-2 max-w-full">
          <div className="flex items-center gap-3 mb-6">
            <Link to={`/bonuses/${id}`} className="p-2 rounded-lg hover:bg-base-200"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg></Link>
            <div className="flex items-center gap-2"><ChartIcon className="w-6 h-6 text-blue-600" /><div><h1 className="page-title">Prime Commission GP</h1><p className="text-sm text-base-content/50">Prime commission GP (import CSV 4D)</p></div></div>
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
                      <th className="text-center py-2 px-2 font-medium text-gray-600 text-xs">Doublé</th>
                      <th className="text-right py-2 px-2 font-medium text-gray-600 text-xs">Montant</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sales.map((sale, i) => (
                      <tr key={i} className="border-b border-gray-200">
                        <td className="py-1.5 px-2 text-gray-900">{sale.designation || '—'}</td>
                        <td className="py-1.5 px-2 text-center">{sale.nombre ?? 0}</td>
                        <td className="py-1.5 px-2 text-center">{sale.doublé ? <span className="badge badge-sm badge-amber-100 text-amber-700">doublé</span> : '—'}</td>
                        <td className="py-1.5 px-2 text-right text-brand-600 font-medium">{sale.montant > 0 ? `${fmtAr(sale.montant)} Ar` : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="font-semibold border-t-2 border-brand-200">
                      <td colSpan={3} className="py-2 px-2 text-right">Total commission</td>
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

    // ----- Mode création : Commission Entreprise / Grand Compte -----
    if (isGc || commSubType === 'gc') {
      const previewCount = gcPreview?.count ?? 0
      const totalAmount = gcPreview?.total_amount ?? 0
      const config = gcPreview?.config
      const cappedCount = gcPreview?.employees?.filter(e => e.capped).length ?? 0

      return (
        <>
        <div className="page-container !px-2 max-w-full">
          <div className="flex items-center gap-3 mb-6">
            <Link to="/bonuses/new" className="p-2 rounded-lg hover:bg-base-200"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg></Link>
            <div className="flex items-center gap-2"><ChartIcon className="w-6 h-6 text-blue-600" /><div><h1 className="page-title">Prime Commission GC</h1><p className="text-sm text-base-content/50">Calcul à partir des ventes Entreprise / Grand Compte</p></div></div>
          </div>
          {error && <div className="bg-red-50 text-red-700 text-sm rounded-lg px-4 py-3 mb-3 flex items-center gap-2"><ExclamationIcon className="w-4 h-4" />{error}</div>}
          {commTypeSelector}
          <form onSubmit={handleSubmitCommissionGC} className="space-y-3">
            {sharedHeader}
            <div className="card-blueline p-4">
              <div className="flex items-center gap-2 mb-3">
                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-brand-600 text-white text-xs font-bold">1</span>
                <h2 className="font-semibold text-base-content text-sm">Importer le fichier CSV des ventes grand compte</h2>
              </div>
              <div className="flex flex-col md:flex-row gap-3">
                <button type="button" onClick={() => setShowSftp(true)}
                  className="flex-1 flex items-center gap-3 px-4 py-3 rounded-xl border-2 border-dashed border-base-300 bg-base-50 hover:border-brand-500 hover:bg-brand-50/50 transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500/30 text-left">
                  <svg className="w-6 h-6 text-brand-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                  </svg>
                  <span className="min-w-0">
                    {gcCsvFile
                      ? <>
                          <span className="block text-base-content font-medium truncate">{gcCsvFile.name}</span>
                          {commCsvPath && <span className="block text-[11px] text-base-content/40 truncate">SFTP : {commCsvPath}</span>}
                        </>
                      : <><span className="block text-base-content font-medium">Sélectionner le fichier CSV grand compte</span>
                         <span className="block text-[11px] text-base-content/40">Serveur SFTP ou fichier local • séparateur « ; » • 2 lignes d'en-tête (produits puis RMS / FMS)</span></>}
                  </span>
                </button>
                <div className="flex flex-col gap-1.5 shrink-0 justify-end">
                  <button type="button" onClick={() => gcFileInputRef.current?.click()}
                    className="text-[11px] text-brand-600 hover:text-brand-700 flex items-center gap-1 justify-center">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" /></svg>
                    Choisir un fichier local…
                  </button>
                  <input ref={gcFileInputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleLocalFile} />
                  <button type="button" onClick={handlePreviewCommissionGC} disabled={gcLoading || !gcCsvFile}
                    className="btn bg-brand-600 hover:bg-brand-700 text-white border-0 disabled:opacity-50">
                    {gcLoading ? <span className="loading loading-spinner loading-sm" /> : 'Calculer les commissions'}
                  </button>
                </div>
              </div>

              <div className="relative inline-block mt-3 group/calcmode">
                <button type="button" className="inline-flex items-center gap-1.5 text-[11px] font-medium text-brand-600 hover:text-brand-700 rounded-md px-1.5 py-1 hover:bg-brand-50">
                  <span className="flex items-center justify-center w-4 h-4 rounded-full border border-brand-600 text-[10px] font-semibold leading-none">i</span>
                  Mode de calcul
                </button>
                <div className="pointer-events-none absolute left-0 top-7 z-30 w-96 max-w-[85vw] opacity-0 invisible group-hover/calcmode:opacity-100 group-hover/calcmode:visible transition-opacity">
                  <div className="rounded-xl border border-base-300 bg-base-100 shadow-xl p-3.5 text-[11px] text-base-content/70 space-y-2">
                    <p className="font-medium text-base-content/90">Commission par employé</p>
                    <ul className="space-y-0.5 list-disc list-inside">
                      <li>RMS des produits = MRC réalisé</li>
                      <li>FMS des produits ramené % par 12 : <span className="font-medium">FMS% = (FMS réalisé ÷ 12) / objectif FMS</span></li>
                      <li>MRC% = MRC réalisé / objectif MRC</li>
                      <li>Commission = commission@100% × (MRC% + FMS%)</li>
                      <li>Total plafonné à max_commission (arrondi à 2 déc.)</li>
                      <li>Employés sans MRC ni FMS ignorés</li>
                    </ul>
                    {config && (
                      <>
                        <p className="font-medium text-base-content/90">Configuration appliquée</p>
                        <ul className="space-y-0.5 list-disc list-inside">
                          <li>Objectif MRC : {fmtAr(config.mrc_objective)} Ar</li>
                          <li>Objectif FMS : {fmtAr(config.fms_objective)} Ar</li>
                          <li>Commission à 100% : {fmtAr(config.commission_at_100)} Ar</li>
                          <li>Plafond : {fmtAr(config.max_commission)} Ar</li>
                        </ul>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {gcPreview && (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="card-blueline p-3 border-l-4 border-l-brand-500">
                    <p className="text-xs text-base-content/50">Primes à créer</p>
                    <p className="text-xl font-bold text-base-content">{gcPreview.count}</p>
                  </div>
                  <div className="card-blueline p-3 border-l-4 border-l-emerald-500">
                    <p className="text-xs text-base-content/50">Total commission</p>
                    <p className="text-xl font-bold text-emerald-600">{fmtAr(totalAmount)} Ar</p>
                  </div>
                  <div className="card-blueline p-3 border-l-4 border-l-sky-500">
                    <p className="text-xs text-base-content/50">Commission à 100%</p>
                    <p className="text-base font-medium text-base-content">{config ? `${fmtAr(config.commission_at_100)} Ar` : '—'}</p>
                    {config && <p className="text-[11px] text-base-content/40">Plafond {fmtAr(config.max_commission)} Ar</p>}
                  </div>
                  <div className="card-blueline p-3 border-l-4 border-l-amber-500">
                    <p className="text-xs text-base-content/50">Commission plafonnée</p>
                    <p className="text-base font-medium text-base-content">{cappedCount > 0 ? `${cappedCount} employé(s)` : 'Aucune'}</p>
                    <p className="text-[11px] text-base-content/40">Produits reconnus : {gcPreview.matched_products?.length ?? 0}</p>
                  </div>
                </div>

                <div className="card-blueline p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="flex items-center justify-center w-6 h-6 rounded-full bg-brand-600 text-white text-xs font-bold">2</span>
                    <h2 className="font-semibold text-base-content text-sm">Vérifier et créer les primes</h2>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-300 bg-base-100/60">
                          <th className="text-left py-2 px-3 font-medium text-gray-600 text-xs uppercase tracking-wider">Matricule</th>
                          <th className="text-left py-2 px-3 font-medium text-gray-600 text-xs uppercase tracking-wider">Employé</th>
                          <th className="text-right py-2 px-3 font-medium text-gray-600 text-xs uppercase tracking-wider">MRC réalisé</th>
                          <th className="text-right py-2 px-3 font-medium text-gray-600 text-xs uppercase tracking-wider">FMS réalisé</th>
                          <th className="text-right py-2 px-3 font-medium text-gray-600 text-xs uppercase tracking-wider">Total (MRC+FMS)</th>
                          <th className="text-center py-2 px-3 font-medium text-gray-600 text-xs uppercase tracking-wider">MRC %</th>
                          <th className="text-center py-2 px-3 font-medium text-gray-600 text-xs uppercase tracking-wider">FMS %</th>
                          <th className="text-right py-2 px-3 font-medium text-gray-600 text-xs uppercase tracking-wider">Commission GC</th>
                        </tr>
                      </thead>
                      <tbody>
                        {gcPreview.employees.map((emp) => (
                          <tr key={emp.employee_id} className={`border-b border-gray-100 ${emp.capped ? 'bg-amber-50/60' : ''}`}>
                            <td className="py-2 px-3 text-gray-900 font-semibold">{emp.matricule}</td>
                            <td className="py-2 px-3 text-gray-900">
                              {emp.name}
                              <span className="block text-[11px] text-gray-400">{emp.department}</span>
                              {emp.lines.length > 0 && (
                                <details className="mt-0.5">
                                  <summary className="text-[11px] text-brand-600 cursor-pointer hover:text-brand-700 list-none">Détail produits ({emp.lines.length})</summary>
                                  <ul className="mt-1 space-y-0.5 text-[11px] text-base-content/70">
                                    {emp.lines.map((line, i) => (
                                      <li key={i} className="flex justify-between gap-3 border-b border-base-100 pb-0.5">
                                        <span>{line.product}</span>
                                        <span className="font-medium">{fmtAr(line.total)} Ar</span>
                                      </li>
                                    ))}
                                  </ul>
                                </details>
                              )}
                            </td>
                            <td className="py-2 px-3 text-right">
                              <span className="block">{fmtAr(emp.mrc_actual)} <span className="text-[10px] text-base-content/40">/ {fmtAr(emp.mrc_objective)}</span></span>
                              <span className="block text-[10px] text-base-content/50">
                                {fmtAr(emp.mrc_actual)} ÷ {fmtAr(emp.mrc_objective)} = {fmtPct(emp.mrc_pct)}
                              </span>
                            </td>
                            <td className="py-2 px-3 text-right">
                              <span className="block">{fmtAr(emp.fms_actual)} <span className="text-[10px] text-base-content/40">/ {fmtAr(emp.fms_objective)}</span></span>
                              <span className="block text-[10px] text-base-content/50">
                                ({fmtAr(emp.fms_actual)} ÷ 12) ÷ {fmtAr(emp.fms_objective)} = {fmtPct(emp.fms_pct)}
                              </span>
                            </td>
                            <td className="py-2 px-3 text-right font-semibold text-gray-900">{fmtAr(emp.total_actual)}</td>
                            <td className="py-2 px-3 text-center">{fmtPct(emp.mrc_pct)}</td>
                            <td className="py-2 px-3 text-center">{fmtPct(emp.fms_pct)}</td>
                            <td className="py-2 px-3 text-right text-brand-600 font-semibold">
                              <span className="block">{fmtAr(emp.total_commission)} Ar</span>
                              {config && (
                                <span className="block text-[10px] font-normal text-base-content/50 mt-0.5">
                                  = {fmtAr(config.commission_at_100)} × ({fmtPct(emp.mrc_pct)} + {fmtPct(emp.fms_pct)})
                                </span>
                              )}
                              {emp.capped && <span className="badge badge-sm badge-warning text-amber-700 mt-0.5">plafonné</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="font-semibold bg-brand-50/50">
                          <td colSpan={7} className="py-3 px-3 text-right text-base-content/70">Total général</td>
                          <td className="py-3 px-3 text-right text-brand-700">{fmtAr(totalAmount)} Ar</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>

                  {(gcPreview.ignored_employees?.length > 0 || gcPreview.ignored_columns?.length > 0) && (
                    <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                      {gcPreview.ignored_employees?.length > 0 && (
                        <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
                          <p className="font-medium text-amber-800 mb-1">Employés ignorés (matricule introuvable) : {gcPreview.ignored_employees.length}</p>
                          <p className="text-amber-700 break-words">{gcPreview.ignored_employees.join(', ')}</p>
                        </div>
                      )}
                      {gcPreview.ignored_columns?.length > 0 && (
                        <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
                          <p className="font-medium text-amber-800 mb-1">Colonnes ignorées : {gcPreview.ignored_columns.length}</p>
                          <p className="text-amber-700 break-words">{gcPreview.ignored_columns.join(', ')}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {!config && (
                  <div className="rounded-lg bg-sky-50 border border-sky-200 px-4 py-3 text-sm text-sky-700">
                    Aucune configuration grand compte affichée — vérifiez la configuration (Admin → Configuration → Commission Grand Compte).
                  </div>
                )}

                <div className="flex gap-3 justify-end items-center">
                  <Link to="/bonuses/new" className="btn btn-ghost">Annuler</Link>
                  <button type="submit" disabled={gcLoading || previewCount === 0} className="btn bg-brand-600 hover:bg-brand-700 text-white border-0">
                    {gcLoading ? <span className="loading loading-spinner" /> : `Créer ${previewCount} prime(s) commission grand compte`}
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

    // ----- Mode création : import CSV 4D + aperçu + validation -----
    const previewCount = commPreview?.count ?? 0
    const totalAmount = commPreview?.total_amount ?? 0

    return (
      <>
      <div className="page-container !px-2 max-w-full">
        <div className="flex items-center gap-3 mb-6">
          <Link to="/bonuses/new" className="p-2 rounded-lg hover:bg-base-200"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg></Link>
          <div className="flex items-center gap-2"><ChartIcon className="w-6 h-6 text-blue-600" /><div><h1 className="page-title">Prime Commission GP</h1><p className="text-sm text-base-content/50">Calcul à partir du fichier CSV 4D des ventes</p></div></div>
        </div>
        {error && <div className="bg-red-50 text-red-700 text-sm rounded-lg px-4 py-3 mb-3 flex items-center gap-2"><ExclamationIcon className="w-4 h-4" />{error}</div>}
        {commTypeSelector}
        <form onSubmit={handleSubmitCommission} className="space-y-3">
          {sharedHeader}
          <div className="card-blueline p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="flex items-center justify-center w-6 h-6 rounded-full bg-brand-600 text-white text-xs font-bold">1</span>
              <h2 className="font-semibold text-base-content text-sm">Importer le fichier CSV des ventes</h2>
            </div>
            <div className="flex flex-col md:flex-row gap-3">
              <button type="button" onClick={() => setShowSftp(true)}
                className="flex-1 flex items-center gap-3 px-4 py-3 rounded-xl border-2 border-dashed border-base-300 bg-base-50 hover:border-brand-500 hover:bg-brand-50/50 transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500/30 text-left">
                <svg className="w-6 h-6 text-brand-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                </svg>
                <span className="min-w-0">
                  {commCsvFile
                    ? <>
                        <span className="block text-base-content font-medium truncate">{commCsvFile.name}</span>
                        {commCsvPath && <span className="block text-[11px] text-base-content/40 truncate">SFTP : {commCsvPath}</span>}
                      </>
                    : <><span className="block text-base-content font-medium">Sélectionner le fichier CSV 4D</span>
                       <span className="block text-[11px] text-base-content/40">Serveur SFTP • séparateur « ; » • UTF-8</span></>}
                </span>
              </button>
              <div className="flex md:flex-col gap-2 shrink-0 justify-end">
                <button type="button" onClick={handlePreviewCommission} disabled={commLoading || !commCsvFile}
                  className="btn bg-brand-600 hover:bg-brand-700 text-white border-0 disabled:opacity-50">
                  {commLoading ? <span className="loading loading-spinner loading-sm" /> : 'Calculer les commissions'}
                </button>
              </div>
            </div>

            <details className="mt-3 group">
              <summary className="text-[11px] text-brand-600 cursor-pointer hover:text-brand-700 list-none flex items-center gap-1">
                <svg className="w-3 h-3 group-open:rotate-90 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                Format attendu du fichier
              </summary>
              <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px] text-base-content/60">
                <div className="rounded-lg bg-base-100 border border-base-200 px-3 py-2">
                  <p className="font-medium text-base-content/80 mb-1">Colonnes reconnues</p>
                  <ul className="space-y-0.5 list-disc list-inside">
                    <li>Nom / Matricule</li>
                    <li>&lt;produits&gt; (ex : 4G prepaye, Airfiber…)</li>
                    <li>total montant</li>
                  </ul>
                </div>
                <div className="rounded-lg bg-base-100 border border-base-200 px-3 py-2">
                  <p className="font-medium text-base-content/80 mb-1">Valeurs produits</p>
                  <ul className="space-y-0.5 list-disc list-inside">
                    <li>format <code className="px-1 rounded bg-base-200">montant(qty)</code> → <code className="px-1 rounded bg-base-200">220000(11)</code></li>
                    <li>« (x2) » = montant doublé</li>
                    <li>Le montant est lu tel quel (aucun calcul)</li>
                  </ul>
                </div>
                <div className="rounded-lg bg-base-100 border border-base-200 px-3 py-2 md:col-span-2">
                  <p>Une vérification compare la <b>somme des montants produits</b> à la colonne <b>total montant</b>. Les colonnes de dates après « total montant » et les employés non trouvés sont ignorés.</p>
                </div>
              </div>
            </details>
          </div>

          {commPreview && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="card-blueline p-3 border-l-4 border-l-brand-500">
                  <p className="text-xs text-base-content/50">Primes à créer</p>
                  <p className="text-xl font-bold text-base-content">{commPreview.count}</p>
                </div>
                <div className="card-blueline p-3 border-l-4 border-l-emerald-500">
                  <p className="text-xs text-base-content/50">Total commission</p>
                  <p className="text-xl font-bold text-emerald-600">{fmtAr(totalAmount)} Ar</p>
                </div>
                <div className="card-blueline p-3 border-l-4 border-l-sky-500">
                  <p className="text-xs text-base-content/50">Produits reconnus</p>
                  <p className="text-base font-medium text-base-content">{commPreview.matched_products?.length ?? 0}</p>
                </div>
                <div className="card-blueline p-3 border-l-4 border-l-amber-500">
                  <p className="text-xs text-base-content/50">Vérifications OK</p>
                  <p className="text-base font-medium text-base-content">
                    {commPreview.employees.filter(e => e.verif_match !== false).length}
                    <span className="text-sm text-base-content/40"> / {commPreview.employees.length}</span>
                  </p>
                </div>
              </div>

              <div className="card-blueline p-4">
                <div className="flex items-center gap-2 mb-3">
                  <span className="flex items-center justify-center w-6 h-6 rounded-full bg-brand-600 text-white text-xs font-bold">2</span>
                  <h2 className="font-semibold text-base-content text-sm">Vérifier et créer les primes</h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-300 bg-base-100/60">
                        <th className="text-left py-2 px-3 font-medium text-gray-600 text-xs uppercase tracking-wider">Matricule</th>
                        <th className="text-left py-2 px-3 font-medium text-gray-600 text-xs uppercase tracking-wider">Employé</th>
                        <th className="text-left py-2 px-3 font-medium text-gray-600 text-xs uppercase tracking-wider">Produit</th>
                        <th className="text-center py-2 px-3 font-medium text-gray-600 text-xs uppercase tracking-wider">Ventes</th>
                        <th className="text-center py-2 px-3 font-medium text-gray-600 text-xs uppercase tracking-wider">Doublé</th>
                        <th className="text-right py-2 px-3 font-medium text-gray-600 text-xs uppercase tracking-wider">Montant</th>
                      </tr>
                    </thead>
                    <tbody>
                      {commPreview.employees.map((emp) => (
                        <Fragment key={emp.employee_id}>
                          {emp.lines.map((line, i) => (
                            <tr key={i} className={`border-b border-gray-100 ${i % 2 === 0 ? 'bg-white' : 'bg-base-50'}`}>
                              {i === 0 && (
                                <>
                                  <td className="py-2 px-3 text-gray-900 font-semibold align-top" rowSpan={emp.lines.length}>{emp.matricule}</td>
                                  <td className="py-2 px-3 text-gray-900 align-top" rowSpan={emp.lines.length}>
                                    {emp.name}
                                    <span className="block text-[11px] text-gray-400">{emp.department}</span>
                                  </td>
                                </>
                              )}
                              <td className="py-2 px-3 text-gray-800">{line.designation}</td>
                              <td className="py-2 px-3 text-center">{line.nombre}</td>
                              <td className="py-2 px-3 text-center">{line.doublé ? <span className="badge badge-sm badge-warning text-amber-700">doublé</span> : '—'}</td>
                              <td className="py-2 px-3 text-right text-brand-600 font-medium">{line.montant > 0 ? `${fmtAr(line.montant)} Ar` : '—'}</td>
                            </tr>
                          ))}
                          <tr className={`bg-gray-50 border-b ${emp.verif_match === false ? 'border-amber-200' : 'border-gray-200'}`}>
                            <td colSpan={4} className="py-2 px-3 text-right text-gray-700 font-medium">
                              Total {emp.name}
                              {emp.verif_match !== false ? (
                                <span className="ml-1 badge badge-success badge-sm text-emerald-700">vérifié</span>
                              ) : (
                                <span className="block text-[11px] font-normal text-amber-600">
                                  Vérif: somme produits {fmtAr(emp.verif_sum)} ≠ total {fmtAr(emp.total)} Ar
                                </span>
                              )}
                            </td>
                            <td className="py-2 px-3 text-right text-gray-500 text-xs">{emp.lines.length} produit(s)</td>
                            <td className="py-2 px-3 text-right text-brand-600 font-semibold">{fmtAr(emp.total)} Ar</td>
                          </tr>
                        </Fragment>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="font-semibold bg-brand-50/50">
                        <td colSpan={5} className="py-3 px-3 text-right text-base-content/70">Total général</td>
                        <td className="py-3 px-3 text-right text-brand-700">{fmtAr(totalAmount)} Ar</td>
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

              <div className="flex gap-3 justify-end items-center">
                {commPreview.employees.some(e => e.verif_match === false) && (
                  <p className="text-xs text-amber-600 mr-auto">Certains écarts de vérification à examiner</p>
                )}
                <Link to="/bonuses/new" className="btn btn-ghost">Annuler</Link>
                <button type="submit" disabled={commLoading || previewCount === 0} className="btn bg-brand-600 hover:bg-brand-700 text-white border-0">
                  {commLoading ? <span className="loading loading-spinner" /> : `Créer ${previewCount} prime(s) commission`}
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
    const days = calcDays(params.startDate, params.endDate)
    const totalDispo = disponibilites.reduce((s, d) => {
      const tauxHebdo = d.mode === 'jour' ? astreinteConfig.weeklyMax / 7 : getRate(d.employee_id)
      return s + (parseFloat(d.nombre) || 0) * tauxHebdo
    }, 0)
    const totalInterv = interventions.filter(i => i.employee_id).length * astreinteConfig.interventionRate
    const totalGeneral = totalDispo + totalInterv + Object.values(perEmployeeAdditional).reduce((s, v) => s + (v.exceptionnelle || 0) + (v.ponctuelle || 0), 0)
    const primeCount = [...new Set([...disponibilites.map(d => d.employee_id), ...interventions.map(i => i.employee_id)])].filter(Boolean).length
    const employeeTotals = {}
    disponibilites.forEach(d => {
      if (!d.employee_id) return
      const emp = employees.find(e => e.id === d.employee_id)
      if (!employeeTotals[d.employee_id]) employeeTotals[d.employee_id] = { name: emp ? emp.name : `#${d.employee_id}`, dispo: 0, interv: 0, exceptionnelle: 0, ponctuelle: 0 }
      employeeTotals[d.employee_id].dispo += (parseFloat(d.nombre) || 0) * (d.mode === 'jour' ? astreinteConfig.weeklyMax / 7 : getRate(d.employee_id))
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
                    <th className="text-center py-2 px-2 font-medium text-gray-700 w-24">Mode</th>
                    <th className="text-center py-2 px-2 font-medium text-gray-700 w-32">Nombre</th>
                    <th className="text-right py-2 px-2 font-medium text-gray-700 w-36">Montant (Ar)</th>
                    <th className="w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {disponibilites.map((d, i) => {
                    const rowMax = d.mode === 'jour' ? days : weeks
                    return (
                    <tr key={d.key} className="border-b border-gray-200">
                      <td className="py-1 px-2">
                        <select value={d.employee_id} onChange={(e) => handleDispoChange(i, 'employee_id', parseInt(e.target.value))}
                          className="w-full px-2 py-1 rounded border border-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 text-sm">
                          <option value="">Sélectionner...</option>
                          {employeeOptGroups.map(([service, emps]) => (
                            <optgroup key={service} label={service}>
                              {emps.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
                            </optgroup>
                          ))}
                        </select>
                      </td>
                      <td className="py-1 px-2 text-center">
                        <select value={d.mode || 'semaine'} onChange={(e) => handleDispoMode(i, e.target.value)}
                          className="w-full px-2 py-1 rounded border border-gray-300 focus:outline-none focus:ring-1 focus:ring-amber-500 text-xs">
                          <option value="semaine">Semaine</option>
                          <option value="jour">Jour</option>
                        </select>
                      </td>
                      <td className="py-1 px-2 text-center">
                        <input type="number" value={d.nombre} min="0" max={rowMax} onChange={(e) => handleDispoChange(i, 'nombre', e.target.value)}
                          className={`w-16 px-2 py-1 rounded border text-sm text-center focus:outline-none focus:ring-2 focus:ring-brand-500/30 ${(parseFloat(d.nombre) || 0) > rowMax ? 'border-red-400 bg-red-50' : 'border-gray-400'}`} />
                        {(parseFloat(d.nombre) || 0) > rowMax && <span className="text-red-500 text-xs block">max {rowMax}{d.mode === 'jour' ? ' j' : ' sem'}</span>}
                      </td>
                      <td className="py-1 px-2 text-right font-medium">
                        {seeAmounts ? ((parseFloat(d.nombre) || 0) * (d.mode === 'jour' ? astreinteConfig.weeklyMax / 7 : getRate(d.employee_id))).toLocaleString('fr-FR') : '••••••'}
                      </td>
                      <td className="py-1 px-2 text-center">
                        <button type="button" onClick={() => removeDispoRow(i)} className="text-red-500 hover:text-red-700 text-sm">✕</button>
                      </td>
                    </tr>
                    )
                  })}
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
                          {employeeOptGroups.map(([service, emps]) => (
                            <optgroup key={service} label={service}>
                              {emps.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
                            </optgroup>
                          ))}
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

        {/* Passer à un N+2 — seulement pour N+1 (pas admin/DG/DRH/Directeur) */}
        {connectedUser?.is_validator_n1 && !connectedUser?.is_admin && !connectedUser?.is_dg && !connectedUser?.is_drh && !connectedUser?.is_directeur && (
          <div className="card-blueline p-3 mb-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                className="checkbox checkbox-sm border-blue-300 checked:bg-blue-500"
                checked={passToN2}
                onChange={(e) => {
                  setPassToN2(e.target.checked)
                  if (!e.target.checked) setN2UserId('')
                }}
              />
              <span className="text-sm font-medium text-base-content">Passer à un N+2 (sous-directeur)</span>
            </label>
            {passToN2 && (
              <div className="mt-2 ml-6">
                <label className="block text-xs font-medium text-base-content/70 mb-1">Sélectionner le N+2</label>
                <select
                  className="w-full px-3 py-2 rounded-lg border border-base-300 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 text-sm"
                  value={n2UserId}
                  onChange={(e) => setN2UserId(e.target.value)}
                >
                  <option value="">— Choisir un N+2 —</option>
                  {n2Users.map(u => (
                    <option key={u.id} value={u.id}>{u.name} ({u.department || '—'})</option>
                  ))}
                </select>
                {n2Users.length === 0 && (
                  <p className="text-xs text-amber-600 mt-1">Aucun utilisateur N+2 trouvé dans votre département</p>
                )}
              </div>
            )}
          </div>
        )}

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
              <ExclamationIcon className="w-4 h-4" /> Chaque « Autre prime » doit avoir un type de prime, un type de versement, un montant supérieur à 0, une période (début et fin) et une pièce jointe.
            </div>
          )}
          <div className="flex items-center justify-between mb-4">
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
            <div key={o.key} className="bg-white rounded-lg border border-amber-200 p-4 mb-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-medium text-amber-700">Autre prime #{idx + 1}</span>
                <button type="button" onClick={() => removeOther(o.key)} className="text-red-400 hover:text-red-600 text-lg leading-none">&times;</button>
              </div>
              {/* --- Ligne 1 : type de prime (long) + mode de calcul compact (nbr jour × montant) --- */}
              <div className="flex flex-col sm:flex-row sm:items-start gap-2">
                <div className="w-full sm:flex-1 min-w-0">
                  <label className="block text-[10px] font-medium text-gray-600 mb-0.5">Type de prime *</label>
                  <select
                    title={otherPrimesTypes.find(t => t.id === o.selectedTypeId)?.free_amount ? 'Type à montant libre : saisissez le montant' : ''}
                    value={o.selectedTypeId || ''}
                    onChange={(e) => {
                      const typeId = e.target.value
                      const selected = otherPrimesTypes.find(t => t.id === parseInt(typeId))
                      if (selected) {
                        updateOther(o.key, 'selectedTypeId', selected.id)
                        updateOther(o.key, 'libelle', `${selected.libelle} - ${selected.category}`)
                        // Type à montant libre : on ne pré-remplit pas, l'utilisateur saisit son montant
                        updateOther(o.key, 'montant', selected.free_amount ? 0 : selected.amount)
                      } else {
                        updateOther(o.key, 'selectedTypeId', '')
                        updateOther(o.key, 'libelle', '')
                        updateOther(o.key, 'montant', 0)
                      }
                    }}
                    className="w-full px-2 py-1 rounded border border-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 text-sm">
                    <option value="">-- Sélectionner un type --</option>
                    {otherPrimesTypes.filter(t => t.active).map(t => (
                      <option key={t.id} value={t.id}>{t.libelle} - {t.category}</option>
                    ))}
                  </select>
                </div>
                <div className="w-16 shrink-0">
                  <label className="block text-[10px] font-medium text-gray-600 mb-0.5">Nbr jour</label>
                  <input type="number" min="1" value={o.nbr_jour ?? 1} onChange={(e) => updateOther(o.key, 'nbr_jour', e.target.value)}
                    title="Le montant est multiplié par ce nombre de jours"
                    className="w-full px-2 py-1 rounded border border-gray-400 text-center focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 text-sm" />
                </div>
                <div className="w-full sm:w-40 shrink-0">
                  <label className="block text-[10px] font-medium text-gray-600 mb-0.5">
                    Montant ({formCurrency}){o.selectedTypeId && !otherPrimesTypes.find(t => t.id === o.selectedTypeId)?.free_amount ? '' : ' (libre)'}
                  </label>
                  <input type="number" min="0" value={otherTotal(o)} onChange={(e) => updateOther(o.key, 'montant', (parseFloat(e.target.value) || 0) / otherJour(o))}
                    title={o.selectedTypeId
                      ? (otherPrimesTypes.find(t => t.id === o.selectedTypeId)?.free_amount
                        ? `Montant libre — total = montant saisi × ${otherJour(o)} jour(s)`
                        : `Montant pré-rempli depuis la config, modifiable — total = montant × ${otherJour(o)} jour(s)`)
                      : `Montant total = montant de base × ${otherJour(o)} jour(s)`}
                    className="w-full px-2 py-1 rounded border border-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 text-sm" />
                </div>
              </div>
              {/* --- Ligne 2 : type de versement + dates + pièce jointe, tout sur une ligne --- */}
              <div className="flex flex-wrap items-end gap-x-2 gap-y-2 mt-2">
                <div className="min-w-0">
                  <label className="block text-[10px] font-medium text-gray-600 mb-0.5">Type de versement *</label>
                  <div className="flex items-center gap-1.5">
                    <select value={o.type}
                      onChange={(e) => {
                        updateOther(o.key, 'type', e.target.value)
                        if (e.target.value !== 'autres') updateOther(o.key, 'typeCustom', '')
                      }}
                      className="px-2 py-1 rounded border border-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 text-sm">
                      {otherTypes.map(t => <option key={t} value={t}>{OTHER_TYPE_LABELS[t]}</option>)}
                    </select>
                    {o.type === 'autres' && (
                      <input type="text" value={o.typeCustom}
                        onChange={(e) => updateOther(o.key, 'typeCustom', e.target.value)}
                        placeholder="Précisez le type..."
                        className="w-32 sm:w-40 px-2 py-1 rounded border border-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 text-sm" />
                    )}
                  </div>
                </div>
                <div className="min-w-0">
                  <label className="block text-[10px] font-medium text-gray-600 mb-0.5">Période (optionnel)</label>
                  <div className="flex items-center gap-1 flex-wrap">
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
                    <span className="text-[11px] text-gray-400">→</span>
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
                <div className="flex-1 min-w-[220px]">
                  <label className="block text-[10px] font-medium text-gray-600 mb-0.5">Pièce jointe (obligatoire)</label>
                  {o.file ? (
                    <div className="flex items-center gap-2 text-sm h-[30px]">
                      <button type="button" onClick={() => openFile(o.file.url)} className="text-blue-600 hover:underline truncate text-left">{o.file.original_name}</button>
                      <button type="button" onClick={() => removeOtherFile(o.key)} className="text-red-400 hover:text-red-600">&times;</button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <input ref={(el) => { otherFileRefs.current[o.key] = el }} type="file"
                        accept=".pdf,.png,.jpg,.jpeg,.gif,.doc,.docx,.xls,.xlsx"
                        onChange={(e) => handleOtherFile(o.key, e.target.files?.[0])}
                        className="hidden" />
                      <input type="text" readOnly value=""
                        placeholder="Aucun fichier choisi"
                        className="flex-1 min-w-0 px-2 py-1 rounded border border-gray-300 bg-gray-50 text-gray-400 text-sm cursor-not-allowed" />
                      <button type="button" onClick={() => otherFileRefs.current[o.key]?.click()}
                        className="btn btn-xs bg-amber-600 hover:bg-amber-700 text-white border-0 whitespace-nowrap">Choisir un fichier</button>
                    </div>
                  )}
                </div>
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

        <div className="card-blueline p-4 mt-5 border-l-4 border-l-blue-500 bg-blue-50/40">
          <div className="space-y-2">
            {!hasFreeAmountType && (
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
            )}
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
