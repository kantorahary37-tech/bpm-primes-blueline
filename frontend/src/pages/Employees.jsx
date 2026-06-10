import { useEffect, useState, useMemo, useRef } from 'react';
import { getEmployees, getBonuses, createEmployee, updateEmployee, getUsers } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { Link } from 'react-router-dom';
import { PlusIcon, EyeIcon, CalendarIcon, MoonIcon, ChartIcon, ClipboardIcon, XMarkIcon, DownloadIcon } from '../components/Icons';
import Modal from '../components/Modal';

const DEPARTMENTS = [
  'Clientèle', 'Commercial GP', 'Commercial entreprise', 'ADV', 'Fidélisation',
  'Auditeur interne', 'DAF Contrôleur', 'DAF CDG', 'CTB', 'RH', 'Achat',
  'BBS', 'Communication & Mktg', 'DO', 'DSI', 'DT', 'Logistique', 'DG',
];

const typeIcons = {
  mensuel: CalendarIcon,
  astreinte: MoonIcon,
  commission: ChartIcon,
};

const typeLabels = {
  mensuel: 'Mensuelle',
  astreinte: 'Astreinte',
  commission: 'Commission',
};

const getBadgeClass = (status) => {
  const map = {
    'Initialisé': 'bg-orange-100 text-orange-700',
    'En attente Directeur': 'bg-purple-100 text-purple-700',
    'En attente DG': 'bg-amber-100 text-amber-700',
    'Prime validée': 'bg-emerald-100 text-emerald-700',
    'Prime rejetée': 'bg-red-100 text-red-700',
  };
  return map[status] || 'bg-gray-100 text-gray-600';
};

const formatDate = (d) => new Date(d).toLocaleDateString('fr-FR', {
  day: '2-digit', month: '2-digit', year: 'numeric',
});

const MONTHS = [
  'Janvier','Février','Mars','Avril','Mai','Juin',
  'Juillet','Août','Septembre','Octobre','Novembre','Décembre',
];
const currentYear = new Date().getFullYear();
const YEARS = Array.from({length: 5}, (_, i) => currentYear - 2 + i);

const EXPORT_EMPLOYEE_COLUMNS = ["Matricule", "Nom", "Departement", "Manager", "DateCreation"];
const EXPORT_EMP_BONUS_COLUMNS = ["Matricule", "Nom", "Departement", "TypePrime", "DateDebut", "DateFin", "Montant", "Statut", "DejaRejete", "CreePar", "DateCreation"];

const Employees = () => {
  const { user } = useAuth();
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ matricule: '', name: '', department: 'Clientèle', manager_id: '' });
  const [managers, setManagers] = useState([]);
  const [selectedEmp, setSelectedEmp] = useState(null);
  const [empBonuses, setEmpBonuses] = useState([]);
  const [bonusesLoading, setBonusesLoading] = useState(false);
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [bonusTypeFilter, setBonusTypeFilter] = useState('');
  const [filterMonth, setFilterMonth] = useState('');
  const [filterYear, setFilterYear] = useState('');
  const [bonusStatusFilter, setBonusStatusFilter] = useState('');
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportColumns, setExportColumns] = useState(EXPORT_EMPLOYEE_COLUMNS);
  const [showEmpBonusExportModal, setShowEmpBonusExportModal] = useState(false);
  const [empBonusExportColumns, setEmpBonusExportColumns] = useState(EXPORT_EMP_BONUS_COLUMNS);

  const initRef = useRef(false);

  useEffect(() => {
    if (!user) return;
    if (!initRef.current && user.department && !departmentFilter) {
      initRef.current = true;
      setDepartmentFilter(user.department);
      return;
    }
    initRef.current = true;
    const fetchData = async () => {
      try {
        const [emps, users] = await Promise.all([
          departmentFilter ? getEmployees(departmentFilter) : getEmployees(),
          getUsers(),
        ]);
        setEmployees(emps);
        setManagers(Array.isArray(users) ? users : []);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [departmentFilter, user]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await createEmployee({ ...form, manager_id: parseInt(form.manager_id) });
      setShowForm(false);
      setForm({ matricule: '', name: '', department: 'Clientèle', manager_id: '' });
      const emps = await getEmployees();
      setEmployees(emps);
    } catch (err) {
      alert(err.response?.data?.detail || 'Erreur lors de la création');
    }
  };

  const loadEmployeeBonuses = async (emp) => {
    setSelectedEmp(emp);
    setBonusTypeFilter('');
    setFilterMonth('');
    setFilterYear('');
    setBonusStatusFilter('');
    if (!user?.is_dg && !user?.is_drh && user?.department && emp.department !== user.department) {
      setEmpBonuses([]);
      setBonusesLoading(false);
      return;
    }
    setBonusesLoading(true);
    try {
      const data = await getBonuses(null, emp.id);
      setEmpBonuses(data);
    } catch (err) {
      console.error(err);
    } finally {
      setBonusesLoading(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center items-center h-64"><span className="loading loading-spinner loading-lg" /></div>;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Employés</h1>
        <div className="flex items-center gap-2">
        <button onClick={() => setShowForm(true)} className="btn bg-blue-600 hover:bg-blue-700 text-white border-0 btn-sm flex items-center gap-1.5">
          <PlusIcon className="w-4 h-4" /> Nouvel employé
        </button>
        <button onClick={() => {
          setExportColumns(EXPORT_EMPLOYEE_COLUMNS)
          setShowExportModal(true)
        }} className="btn bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 btn-sm flex items-center gap-1.5" title="Exporter les employés">
          <DownloadIcon className="w-4 h-4" /> Exporter
        </button>
        </div>
      </div>

      {showForm && (
        <div className="card bg-white border border-gray-200 shadow-sm mb-6">
          <div className="card-body p-6">
            <h3 className="font-semibold text-gray-900 mb-4">Nouvel employé</h3>
            <form onSubmit={handleSubmit} className="flex flex-wrap gap-4 items-end">
              <div className="form-control">
                <label className="label"><span className="label-text">Matricule</span></label>
                <input type="text" className="input input-bordered input-sm w-32" value={form.matricule} onChange={(e) => setForm({ ...form, matricule: e.target.value })} required />
              </div>
              <div className="form-control">
                <label className="label"><span className="label-text">Nom</span></label>
                <input type="text" className="input input-bordered input-sm w-48" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              </div>
              <div className="form-control">
                <label className="label"><span className="label-text">Département</span></label>
                <select className="select select-bordered select-sm w-44" value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} required>
                  {DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div className="form-control">
                <label className="label"><span className="label-text">Manager</span></label>
                <select className="select select-bordered select-sm w-44" value={form.manager_id} onChange={(e) => setForm({ ...form, manager_id: e.target.value })} required>
                  <option value="">Sélectionner...</option>
                  {managers.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </div>
              <div className="flex gap-2">
                <button type="submit" className="btn btn-sm bg-blue-600 hover:bg-blue-700 text-white border-0">Créer</button>
                <button type="button" className="btn btn-sm btn-ghost" onClick={() => setShowForm(false)}>Annuler</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 mb-4">
        <select value={departmentFilter} onChange={(e) => setDepartmentFilter(e.target.value)}
          className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500">
          <option value="">Tous les départements</option>
          {user?.department && <option value={user.department}>Mon département ({user.department})</option>}
          {DEPARTMENTS.filter(d => d !== user?.department).map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
        <span className="text-xs text-gray-400">{employees.length} employé(s)</span>
      </div>

      <div className="space-y-2 mb-6">
        {employees.length === 0 ? (
          <div className="text-center text-gray-400 py-12">Aucun employé</div>
        ) : (
          employees.map((emp) => {
            const mgr = managers.find((m) => m.id === emp.manager_id);
            return (
              <button key={emp.id} onClick={() => loadEmployeeBonuses(emp)}
                className={`w-full flex items-center gap-4 px-5 py-3.5 rounded-xl border transition-all text-left ${
                  selectedEmp?.id === emp.id
                    ? 'border-blue-400 bg-blue-50 shadow-md'
                    : 'border-gray-200 bg-white hover:border-blue-300 hover:shadow-sm'
                }`}>
                <div className="w-9 h-9 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-semibold text-sm shrink-0">
                  {emp.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900 truncate">{emp.name}</p>
                  <p className="text-xs text-gray-400">{emp.matricule}</p>
                </div>
                <div className="text-right text-xs">
                  <div className="text-gray-400">Département</div>
                  <div className="font-medium text-gray-700">{emp.department}</div>
                </div>
                <div className="text-right text-xs">
                  <div className="text-gray-400">Manager</div>
                  <div className="font-medium text-gray-700">{mgr?.name || 'N/A'}</div>
                </div>
                <div className="text-right text-xs">
                  <div className="text-gray-400">Taux astreinte</div>
                  <input type="number" value={emp.astreinte_rate ?? ''} placeholder="70000"
                    onChange={(e) => {
                      const val = e.target.value === '' ? null : parseInt(e.target.value)
                      const updated = [...employees]
                      const idx = updated.findIndex(x => x.id === emp.id)
                      updated[idx] = { ...emp, astreinte_rate: val }
                      setEmployees(updated)
                    }}
                    onBlur={(e) => {
                      const val = e.target.value === '' ? null : parseInt(e.target.value)
                      if (val !== emp.astreinte_rate) updateEmployee(emp.id, { astreinte_rate: val })
                    }}
                    className="w-20 px-1 py-0.5 rounded border border-gray-200 text-xs text-right focus:outline-none focus:ring-1 focus:ring-blue-500/30 focus:border-blue-500"
                  />
                </div>
              </button>
            );
          })
        )}
      </div>

      {selectedEmp && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-[8vh]" onClick={() => setSelectedEmp(null)}>
          <div className="fixed inset-0 bg-black/40" />
          <div className="relative bg-white rounded-xl shadow-2xl border border-gray-200 w-full max-w-xl max-h-[78vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 shrink-0">
              <div className="flex items-center gap-2">
                <ClipboardIcon className="w-4 h-4 text-blue-600" />
                <h3 className="font-semibold text-gray-900 text-sm">Primes de {selectedEmp.name}</h3>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => {
                  setEmpBonusExportColumns(EXPORT_EMP_BONUS_COLUMNS)
                  setShowEmpBonusExportModal(true)
                }} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-blue-600" title="Exporter">
                  <DownloadIcon className="w-4 h-4" />
                </button>
                <button onClick={() => setSelectedEmp(null)} className="p-1 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600">
                  <XMarkIcon className="w-4 h-4" />
                </button>
              </div>
            </div>
            <>
              {!bonusesLoading && empBonuses.length > 0 && (
                <div className="px-4 pt-3 pb-2.5 border-b border-gray-100 space-y-2 shrink-0">
                  <select value={bonusTypeFilter} onChange={(e) => setBonusTypeFilter(e.target.value)}
                    className="w-full px-2 py-1.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500">
                    <option value="">Tous les types</option>
                    <option value="mensuel">Mensuelle</option>
                    <option value="astreinte">Astreinte</option>
                    <option value="commission">Commission</option>
                  </select>
                  <div className="flex gap-2">
                    <select value={filterMonth} onChange={(e) => setFilterMonth(e.target.value)}
                      className="flex-1 px-2 py-1.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500">
                      <option value="">Mois</option>
                      {MONTHS.map((name, i) => (
                        <option key={i + 1} value={String(i + 1).padStart(2, '0')}>{name}</option>
                      ))}
                    </select>
                    <select value={filterYear} onChange={(e) => setFilterYear(e.target.value)}
                      className="flex-1 px-2 py-1.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500">
                      <option value="">Année</option>
                      {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                    <select value={bonusStatusFilter} onChange={(e) => setBonusStatusFilter(e.target.value)}
                      className="flex-1 px-2 py-1.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500">
                      <option value="">Tous les statuts</option>
                      <option value="Initialisé">Initialisé</option>
                      <option value="En attente Directeur">En attente Directeur</option>
                      <option value="En attente DG">En attente DG</option>
                      <option value="Prime validée">Validée</option>
                      <option value="Prime rejetée">Rejetée</option>
                    </select>
                  </div>
                </div>
              )}
              <div className="flex-1 overflow-y-auto">
                {bonusesLoading ? (
                  <div className="flex justify-center py-8"><span className="loading loading-spinner loading-sm" /></div>
                ) : !user?.is_dg && !user?.is_drh && selectedEmp.department !== user?.department ? (
                  <p className="text-center text-gray-400 py-6 text-sm">Vous ne pouvez voir que les primes des employés de votre département</p>
                ) : empBonuses.length === 0 ? (
                  <p className="text-center text-gray-400 py-6 text-sm">Aucune prime pour cet employé</p>
                ) : (
                  (() => {
                    const filtered = empBonuses.filter(b => {
                      if (bonusTypeFilter && b.bonus_type !== bonusTypeFilter) return false
                      if (filterYear) {
                        const ym = b.start_date ? b.start_date.slice(0, 4) : ''
                        if (filterMonth) {
                          const full = b.start_date ? b.start_date.slice(0, 7) : ''
                          if (full !== `${filterYear}-${filterMonth}`) return false
                        } else if (ym !== filterYear) return false
                      }
                      if (bonusStatusFilter === 'Prime rejetée') { if (!b.was_rejected) return false; }
                      else if (bonusStatusFilter && b.status !== bonusStatusFilter) return false
                      return true
                    })
                    if (filtered.length === 0) {
                      return <p className="text-center text-gray-400 py-6 text-sm">Aucune prime ne correspond aux filtres</p>
                    }
                    const groups = {}
                    filtered.forEach(b => {
                      const ym = b.start_date ? b.start_date.slice(0, 7) : 'inconnu'
                      if (!groups[ym]) groups[ym] = []
                      groups[ym].push(b)
                    })
                    const sortedMonths = Object.keys(groups).sort().reverse()
                    return sortedMonths.flatMap(ym => {
                      const [y, m] = ym.split('-')
                      const monthName = new Date(parseInt(y), parseInt(m) - 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
                      return [
                        <div key={ym} className="px-4 pt-3 pb-1 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">{monthName}</div>,
                        ...groups[ym].map(bonus => (
                          <Link key={bonus.id} to={`/bonuses/${bonus.id}`}
                            className="flex items-center gap-3 mx-3 px-3 py-2.5 rounded-lg border border-gray-100 hover:border-blue-200 hover:bg-blue-50/40 transition-all">
                            <div className="w-6 h-6 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 text-[11px] font-bold">
                              {bonus.bonus_type === 'mensuel' ? 'M' : bonus.bonus_type === 'astreinte' ? 'A' : bonus.bonus_type === 'commission' ? 'C' : '?'}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-900">{typeLabels[bonus.bonus_type] || bonus.bonus_type}</p>
                              <p className="text-[11px] text-gray-400">{bonus.start_date && bonus.end_date ? `${formatDate(bonus.start_date)} → ${formatDate(bonus.end_date)}` : '—'}</p>
                            </div>
                            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full shrink-0 ${getBadgeClass(bonus.status)} ${bonus.was_rejected ? 'ring-1 ring-red-400' : ''}`}>
                              {bonus.status}
                            </span>
                            <span className="text-xs font-semibold text-blue-600 shrink-0">{bonus.total_amount} Ar</span>
                          </Link>
                        )),
                        <div key={`${ym}-sep`} className="border-b border-gray-50 mx-3 last:border-0" />
                      ]
                    })
                  })()
                )}
              </div>
            </>
          </div>
        </div>
      )}

      <Modal open={showExportModal} onClose={() => setShowExportModal(false)} title="Exporter les employés" size="sm">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">Colonnes à inclure :</p>
            <div className="flex gap-3">
              <button onClick={() => setExportColumns([...EXPORT_EMPLOYEE_COLUMNS])} className="text-xs text-blue-600 hover:text-blue-800 font-medium transition-colors">Tout</button>
              <button onClick={() => setExportColumns([])} className="text-xs text-gray-400 hover:text-gray-600 font-medium transition-colors">Aucun</button>
            </div>
          </div>
          <div className="space-y-2">
            {EXPORT_EMPLOYEE_COLUMNS.map(col => {
              const selected = exportColumns.includes(col)
              return (
                <label key={col} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border cursor-pointer transition-all ${
                  selected ? 'border-blue-300 bg-blue-50/60 shadow-sm' : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
                }`}>
                  <input type="checkbox" checked={selected} onChange={() => {
                    setExportColumns(prev => prev.includes(col) ? prev.filter(c => c !== col) : [...prev, col])
                  }} className="checkbox checkbox-sm rounded border-gray-300 checked:bg-blue-600 checked:border-blue-600" />
                  <span className={`text-sm ${selected ? 'text-blue-700 font-medium' : 'text-gray-700'}`}>{col}</span>
                </label>
              )
            })}
          </div>
          <div className="flex items-center justify-between pt-4 border-t border-gray-100">
            <span className="text-xs font-medium text-gray-400 bg-gray-100 px-2.5 py-1 rounded-full">{exportColumns.length} / {EXPORT_EMPLOYEE_COLUMNS.length}</span>
            <div className="flex gap-2">
              <button onClick={() => setShowExportModal(false)} className="btn btn-sm btn-ghost">Annuler</button>
              <button onClick={() => {
                const p = new URLSearchParams()
                if (departmentFilter) p.set('department', departmentFilter)
                p.set('columns', exportColumns.join(','))
                const token = localStorage.getItem('token')
                fetch(`/api/v1/employees/export?${p.toString()}`, { headers: { Authorization: `Bearer ${token}` } })
                  .then(r => r.blob())
                  .then(blob => {
                    const url = URL.createObjectURL(blob)
                    const a = document.createElement('a')
                    a.href = url
                    a.download = `export_employes_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.csv`
                    a.click()
                    URL.revokeObjectURL(url)
                    setShowExportModal(false)
                  })
              }} className="btn btn-sm bg-blue-600 hover:bg-blue-700 text-white border-0">Exporter</button>
            </div>
          </div>
        </div>
      </Modal>
      <Modal open={showEmpBonusExportModal} onClose={() => setShowEmpBonusExportModal(false)} title="Exporter les primes" size="md">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">Colonnes à inclure :</p>
            <div className="flex gap-3">
              <button onClick={() => setEmpBonusExportColumns([...EXPORT_EMP_BONUS_COLUMNS])} className="text-xs text-blue-600 hover:text-blue-800 font-medium transition-colors">Tout</button>
              <button onClick={() => setEmpBonusExportColumns([])} className="text-xs text-gray-400 hover:text-gray-600 font-medium transition-colors">Aucun</button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {EXPORT_EMP_BONUS_COLUMNS.map(col => {
              const selected = empBonusExportColumns.includes(col)
              return (
                <label key={col} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border cursor-pointer transition-all ${
                  selected ? 'border-blue-300 bg-blue-50/60 shadow-sm' : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
                }`}>
                  <input type="checkbox" checked={selected} onChange={() => {
                    setEmpBonusExportColumns(prev => prev.includes(col) ? prev.filter(c => c !== col) : [...prev, col])
                  }} className="checkbox checkbox-sm rounded border-gray-300 checked:bg-blue-600 checked:border-blue-600" />
                  <span className={`text-sm ${selected ? 'text-blue-700 font-medium' : 'text-gray-700'}`}>{col}</span>
                </label>
              )
            })}
          </div>
          <div className="flex items-center justify-between pt-4 border-t border-gray-100">
            <span className="text-xs font-medium text-gray-400 bg-gray-100 px-2.5 py-1 rounded-full">{empBonusExportColumns.length} / {EXPORT_EMP_BONUS_COLUMNS.length}</span>
            <div className="flex gap-2">
              <button onClick={() => setShowEmpBonusExportModal(false)} className="btn btn-sm btn-ghost">Annuler</button>
              <button onClick={() => {
                const p = new URLSearchParams({ employee_id: selectedEmp.id })
                if (bonusTypeFilter) p.set('bonus_type', bonusTypeFilter)
                if (bonusStatusFilter === 'Prime rejetée') p.set('was_rejected', 'true')
                else if (bonusStatusFilter) p.set('status', bonusStatusFilter)
                if (filterYear) {
                  if (filterMonth) {
                    const lastDay = new Date(parseInt(filterYear), parseInt(filterMonth), 0).getDate()
                    p.set('start_date', `${filterYear}-${filterMonth}-01`)
                    p.set('end_date', `${filterYear}-${filterMonth}-${String(lastDay).padStart(2, '0')}`)
                  } else {
                    p.set('start_date', `${filterYear}-01-01`)
                    p.set('end_date', `${filterYear}-12-31`)
                  }
                }
                p.set('columns', empBonusExportColumns.join(','))
                const token = localStorage.getItem('token')
                fetch(`/api/v1/bonuses/export?${p.toString()}`, { headers: { Authorization: `Bearer ${token}` } })
                  .then(r => r.blob())
                  .then(blob => {
                    const url = URL.createObjectURL(blob)
                    const a = document.createElement('a')
                    a.href = url
                    a.download = `export_${selectedEmp.name.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.csv`
                    a.click()
                    URL.revokeObjectURL(url)
                    setShowEmpBonusExportModal(false)
                  })
              }} className="btn btn-sm bg-blue-600 hover:bg-blue-700 text-white border-0">Exporter</button>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default Employees;
